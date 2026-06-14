import { openai, createOpenAI } from '@ai-sdk/openai';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import type { CoreMessage } from 'ai';
import { Page } from 'playwright';
import {
  ActionSchema,
  type AgentAction,
  type ActionEffort,
  type EffortReasons,
  type ActionObservations,
} from './agentTypes';
import {
  buildTelemetryEvent,
  type GomsTelemetryEvent,
} from './gomsTelemetry';
import { runVisionStep } from './runVisionStep';
import { captureDomSignals } from './browser';
import { computeActionEffort, scaleEffortToTokens } from './gomsEffortModel';

export type { AgentAction } from './agentTypes';
export { ActionSchema } from './agentTypes';

/**
 * Per-action effort attached to each emitted action.
 *
 * `operators` is kept for backward compatibility with the existing dashboard
 * and maps the human-behavior buckets onto the legacy M/P/K/H/D/R slots:
 *   M = thinking, P = pointing, K = typing, H = homing, D = waiting,
 *   R = model wait (seconds).
 */
export interface ActionTokenUsage {
  operators: { M: number; P: number; K: number; H: number; D: number; R: number };
  effort: ActionEffort;
  effortReasons: EffortReasons;
  observations: ActionObservations;
  totalTokens: number;
  difficultyScore: number;
  isError: boolean;
  /** Seconds until DOM settles after Playwright action (not TTFT). */
  siteLatencySeconds: number;
}

const MAX_ITERATIONS = 20;
// Per-action token threshold (real model tokens). Kept in sync with the
// route's displayed threshold. Override with USER_TOKEN_THRESHOLD in the env.
const DEFAULT_TOKEN_THRESHOLD = 4000;
const METHOD_VISION = 'StreamObject_VisionNavigate';

/** Best-effort count of DOM elements matching the action's target. */
async function countCandidates(page: Page, action: AgentAction): Promise<number> {
  try {
    if (action.type === 'click' && action.clickText) {
      const t = action.clickText.trim();
      const counts = await Promise.all([
        page.getByRole('button', { name: t }).count().catch(() => 0),
        page.getByRole('link', { name: t }).count().catch(() => 0),
        page.getByText(t).count().catch(() => 0),
      ]);
      return Math.max(0, ...counts);
    }
    if (action.selector) {
      return await page.locator(action.selector).count().catch(() => 0);
    }
  } catch {
    /* ignore */
  }
  return 0;
}

export async function runAgentLoop(
  page: Page,
  task: string,
  initialScreenshotBase64: string,
  onAction: (action: AgentAction & ActionTokenUsage) => Promise<void>,
  onScreenshot: (payload: { screenshot: string; url: string }) => Promise<void>,
  onError: (error: string) => Promise<void>,
  options: {
    traceId: string;
    onTelemetry: (e: GomsTelemetryEvent) => Promise<void>;
    /** Optional user-supplied API key; falls back to env keys when absent. */
    apiKey?: string;
  }
): Promise<void> {
  const { traceId, onTelemetry } = options;
  let iterations = 0;
  const visitedUrls = new Set<string>();
  const userThreshold = Number(process.env.USER_TOKEN_THRESHOLD) || DEFAULT_TOKEN_THRESHOLD;
  let lastPromptTokens = 0;
  let lastCompletionTokens = 0;
  let prevStepUrl = '';

  // Pick the provider: a user-supplied key wins (Anthropic keys start with
  // "sk-ant-"); otherwise fall back to whichever env key is configured.
  const userKey = options.apiKey?.trim();
  const provider: 'openai' | 'anthropic' = userKey
    ? userKey.startsWith('sk-ant-')
      ? 'anthropic'
      : 'openai'
    : process.env.OPENAI_API_KEY?.trim()
      ? 'openai'
      : 'anthropic';

  // Build the model, injecting the user key when one was provided.
  const model =
    provider === 'openai'
      ? (userKey ? createOpenAI({ apiKey: userKey }) : openai)('gpt-4o')
      : (userKey ? createAnthropic({ apiKey: userKey }) : anthropic)(
          'claude-3-5-sonnet-20241022'
        );

  const systemPrompt = `You are a web automation agent testing website usability. Your task is: "${task}"

Analyze the screenshot and determine the next action to take. You can:
- CLICK: Use clickText with the EXACT visible text of the button/link (e.g. "Register now", "Sign in"). Do NOT use selector with :contains() or :has-text() — those are invalid. For click-by-text always use clickText.
- TYPE: Use selector (standard CSS only: #id, .class, input[name=...]) and text for the value to type.
- SCROLL: Use direction "up" or "down".
- DONE: When the task is complete.

Rules: selector must be standard CSS only (no :contains, no :has-text). For clicking a button or link, set clickText to its visible label. If the task seems complete, return type: "done".

For "reason", write one short user-facing think-aloud sentence in first person: what you noticed on the page, what you did, and why it helps the task. Use only visible/observable evidence from the screenshot and task; do not include hidden chain-of-thought. Example: "I saw a 'Contact' link that looked relevant, so I clicked it to look for the company details."`;

  try {
    await onScreenshot({ screenshot: initialScreenshotBase64, url: page.url() });

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const screenshot = await page.screenshot({ fullPage: false });
      const screenshotBase64 = screenshot.toString('base64');
      await onScreenshot({ screenshot: screenshotBase64, url: page.url() });

      const currentUrl = page.url();
      visitedUrls.add(currentUrl);
      const isFirstAction = iterations === 1;
      const urlChanged = !isFirstAction && currentUrl !== prevStepUrl;

      const userContent: CoreMessage = {
        role: 'user',
        content: [
          { type: 'image', image: `data:image/png;base64,${screenshotBase64}` },
          {
            type: 'text',
            text: `Current URL: ${currentUrl}\n\nWhat action should I take next to complete the task: "${task}"?`,
          },
        ],
      };

      const messagesOpenAI: CoreMessage[] = [
        { role: 'system', content: systemPrompt },
        userContent,
      ];

      const messagesAnthropic: CoreMessage[] = [
        {
          role: 'user',
          content: [
            { type: 'image', image: `data:image/png;base64,${screenshotBase64}` },
            {
              type: 'text',
              text: `${systemPrompt}\n\nCurrent URL: ${currentUrl}\n\nWhat action should I take next?`,
            },
          ],
        },
      ];

      const selectionRule =
        'IF viewport supports task THEN choose click|type|scroll|done; ELSE scroll. Prefer clickText for buttons/links.';

      const vision = await runVisionStep({
        model: model as never,
        schema: ActionSchema,
        messages: provider === 'openai' ? messagesOpenAI : messagesAnthropic,
        traceId,
        stepIndex: iterations,
        lastPromptTokens,
        lastCompletionTokens,
        provider,
        selectionRule,
        onTelemetry,
      });

      const action = vision.action;
      lastPromptTokens = vision.promptTokens;
      lastCompletionTokens = vision.completionTokens;

      const modelWaitMs = vision.ttftMs + vision.streamGenMs;
      const targetText = action.clickText || action.selector || '';
      const typedText = action.type === 'type' ? action.text || '' : '';

      // Observable DOM context the agent (and a human) had to interpret.
      const dom = await captureDomSignals(page);
      const candidateCount =
        action.type === 'done' ? 0 : await countCandidates(page, action);

      // Real tokens the model consumed for this step (1:1 with API usage).
      const stepTokens = vision.promptTokens + vision.completionTokens;

      // ---- DONE: no browser action, compute effort and finish ----
      if (action.type === 'done') {
        const { effort: rawEffort, reasons, observations } = computeActionEffort({
          actionType: 'done',
          isFirstAction,
          rationale: action.reason || '',
          targetText: '',
          typedText: '',
          completionTokens: vision.completionTokens,
          promptTokens: vision.promptTokens,
          candidateCount: 0,
          dom,
          urlChanged,
          retryCount: 0,
          targetAcquisitionMs: 0,
          modelWaitMs,
          siteWaitMs: 0,
        });
        // Distribute the real token usage across the effort buckets so the
        // displayed numbers sum exactly to the tokens used.
        const effort = scaleEffortToTokens(rawEffort, stepTokens);

        await emitEffortTelemetry({
          onTelemetry,
          traceId,
          stepIndex: iterations,
          effort,
          vision,
          provider,
          selectionRule: action.reason?.trim() || selectionRule,
          pAcquireStart: vision.visionEndMs,
          pEnd: Date.now(),
        });

        await onAction(
          buildActionPayload(action, effort, reasons, observations, {
            userThreshold,
            modelWaitMs,
            siteLatencySeconds: 0,
          })
        );
        break;
      }

      // ---- Execute the browser action, measuring acquisition + retries ----
      let siteLatencySeconds = 0;
      let retryCount = 0;
      const responseStart = Date.now();
      const pAcquireStart = Date.now();

      try {
        if (action.type === 'click') {
          if (action.clickText) {
            const t = action.clickText.trim();
            const locators = [
              page.getByRole('button', { name: t }).first(),
              page.getByRole('link', { name: t }).first(),
              page.getByRole('menuitem', { name: t }).first(),
              page.getByText(t, { exact: true }).first(),
            ];
            let clicked = false;
            for (const loc of locators) {
              try {
                await loc.click({ timeout: 3000 });
                clicked = true;
                break;
              } catch {
                retryCount++;
              }
            }
            if (!clicked) throw new Error(`Could not find element with text "${t}"`);
          } else if (action.selector) {
            await page.locator(action.selector).first().click({ timeout: 5000 });
          } else {
            await onError('Click action needs clickText or selector');
            continue;
          }
        } else if (action.type === 'type' && action.selector && action.text) {
          await page.locator(action.selector).first().fill(action.text);
        } else if (action.type === 'scroll') {
          if (action.direction === 'up') {
            await page.evaluate(() => window.scrollBy(0, -500));
          } else {
            await page.evaluate(() => window.scrollBy(0, 500));
          }
        }

        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(300);
        siteLatencySeconds = (Date.now() - responseStart) / 1000;
      } catch (actionError: any) {
        siteLatencySeconds = (Date.now() - responseStart) / 1000;
        await onError(`Action failed: ${actionError.message}`);
        prevStepUrl = currentUrl;
        continue;
      }

      const pEnd = Date.now();
      const targetAcquisitionMs = pEnd - pAcquireStart;

      const { effort: rawEffort, reasons, observations } = computeActionEffort({
        actionType: action.type,
        isFirstAction,
        rationale: action.reason || '',
        targetText,
        typedText,
        completionTokens: vision.completionTokens,
        promptTokens: vision.promptTokens,
        candidateCount,
        dom,
        urlChanged,
        retryCount,
        targetAcquisitionMs,
        modelWaitMs,
        siteWaitMs: siteLatencySeconds * 1000,
      });
      // Distribute the real token usage across the effort buckets so the
      // displayed numbers sum exactly to the tokens used.
      const effort = scaleEffortToTokens(rawEffort, stepTokens);

      await emitEffortTelemetry({
        onTelemetry,
        traceId,
        stepIndex: iterations,
        effort,
        vision,
        provider,
        selectionRule: action.reason?.trim() || selectionRule,
        pAcquireStart,
        pEnd,
      });

      await onAction(
        buildActionPayload(action, effort, reasons, observations, {
          userThreshold,
          modelWaitMs,
          siteLatencySeconds,
        })
      );

      prevStepUrl = currentUrl;

      if (visitedUrls.size === 1 && iterations > 5) {
        await onError('Agent appears to be stuck. Stopping.');
        break;
      }
    }

    if (iterations >= MAX_ITERATIONS) {
      await onError('Maximum iterations reached. Stopping.');
    }
  } catch (error: any) {
    await onError(`Agent error: ${error.message}`);
    throw error;
  }
}

/** Assemble the action object sent to the UI from the effort model output. */
function buildActionPayload(
  action: AgentAction,
  effort: ActionEffort,
  reasons: EffortReasons,
  observations: ActionObservations,
  ctx: { userThreshold: number; modelWaitMs: number; siteLatencySeconds: number }
): AgentAction & ActionTokenUsage {
  return {
    ...action,
    description: action.description || `${action.type} action`,
    operators: {
      M: effort.thinking,
      P: effort.pointing,
      K: effort.typing,
      H: effort.homing,
      D: effort.waiting,
      R: ctx.modelWaitMs / 1000,
    },
    effort,
    effortReasons: reasons,
    observations,
    totalTokens: effort.total,
    difficultyScore: (effort.total / ctx.userThreshold) * 100,
    isError: effort.total > ctx.userThreshold,
    siteLatencySeconds: ctx.siteLatencySeconds,
  } as AgentAction & ActionTokenUsage;
}

/**
 * Emit homing + pointing phase telemetry using effort-model values so the
 * persisted trace stays consistent with what the dashboard shows.
 */
async function emitEffortTelemetry(input: {
  onTelemetry: (e: GomsTelemetryEvent) => Promise<void>;
  traceId: string;
  stepIndex: number;
  effort: ActionEffort;
  vision: { promptTokens: number; completionTokens: number; visionEndMs: number };
  provider: 'openai' | 'anthropic';
  selectionRule: string;
  pAcquireStart: number;
  pEnd: number;
}): Promise<void> {
  await input.onTelemetry(
    buildTelemetryEvent({
      traceId: input.traceId,
      stepIndex: input.stepIndex,
      operator: 'H',
      startMs: input.vision.visionEndMs,
      endMs: input.pAcquireStart,
      tokens: input.effort.homing,
      promptTokensForCost: input.vision.promptTokens,
      completionTokensForCost: input.vision.completionTokens,
      provider: input.provider,
      methodUsed: METHOD_VISION,
      selectionRule: input.selectionRule,
    })
  );

  await input.onTelemetry(
    buildTelemetryEvent({
      traceId: input.traceId,
      stepIndex: input.stepIndex,
      operator: 'P',
      startMs: input.pAcquireStart,
      endMs: input.pEnd,
      tokens: input.effort.pointing,
      promptTokensForCost: input.vision.promptTokens,
      completionTokensForCost: input.vision.completionTokens,
      provider: input.provider,
      methodUsed: 'Playwright_TargetAcquisition',
      selectionRule: input.selectionRule,
    })
  );
}
