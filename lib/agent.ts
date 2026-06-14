import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import type { CoreMessage } from 'ai';
import { Page } from 'playwright';
import { ActionSchema, type AgentAction } from './agentTypes';
import {
  buildTelemetryEvent,
  type GomsTelemetryEvent,
} from './gomsTelemetry';
import { runVisionStep } from './runVisionStep';

export type { AgentAction } from './agentTypes';
export { ActionSchema } from './agentTypes';

/** Consolidated operators for UI + PRD (R = TTFT; site wait separate). */
export interface ActionTokenUsage {
  operators: { M: number; P: number; K: number; H: number; D: number; R: number };
  totalTokens: number;
  difficultyScore: number;
  isError: boolean;
  /** Seconds until DOM settles after Playwright action (not TTFT). */
  siteLatencySeconds: number;
}

const MAX_ITERATIONS = 20;
const DEFAULT_TOKEN_THRESHOLD = 2000;
const METHOD_VISION = 'StreamObject_VisionNavigate';

function estimatePointingTokens(action: AgentAction): number {
  if (action.type === 'done') return 0;
  if (action.type === 'click') {
    const chars = (action.clickText?.length ?? 0) || (action.selector?.length ?? 0);
    return Math.max(1, Math.ceil(chars / 4));
  }
  if (action.type === 'type' && action.selector) {
    return Math.max(1, Math.ceil(action.selector.length / 4));
  }
  if (action.type === 'scroll') return 3;
  return 0;
}

function estimateKeystrokeTokens(action: AgentAction): number {
  if (action.type === 'type' && action.text) {
    return Math.max(0, Math.ceil(action.text.length / 4));
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
  }
): Promise<void> {
  const { traceId, onTelemetry } = options;
  let iterations = 0;
  const visitedUrls = new Set<string>();
  const userThreshold = Number(process.env.USER_TOKEN_THRESHOLD) || DEFAULT_TOKEN_THRESHOLD;
  let lastPromptTokens = 0;
  let lastCompletionTokens = 0;
  const useOpenAI = !!process.env.OPENAI_API_KEY?.trim();
  const provider: 'openai' | 'anthropic' = useOpenAI ? 'openai' : 'anthropic';

  const systemPrompt = `You are a web automation agent testing website usability. Your task is: "${task}"

Analyze the screenshot and determine the next action to take. You can:
- CLICK: Use clickText with the EXACT visible text of the button/link (e.g. "Register now", "Sign in"). Do NOT use selector with :contains() or :has-text() — those are invalid. For click-by-text always use clickText.
- TYPE: Use selector (standard CSS only: #id, .class, input[name=...]) and text for the value to type.
- SCROLL: Use direction "up" or "down".
- DONE: When the task is complete.

Rules: selector must be standard CSS only (no :contains, no :has-text). For clicking a button or link, set clickText to its visible label. If the task seems complete, return type: "done". Explain in "reason" why you chose this action over alternatives (selection rule for logging).`;

  try {
    await onScreenshot({ screenshot: initialScreenshotBase64, url: page.url() });

    while (iterations < MAX_ITERATIONS) {
      iterations++;

      const screenshot = await page.screenshot({ fullPage: false });
      const screenshotBase64 = screenshot.toString('base64');
      await onScreenshot({ screenshot: screenshotBase64, url: page.url() });

      const currentUrl = page.url();
      visitedUrls.add(currentUrl);

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
        model: (useOpenAI ? openai('gpt-4o') : anthropic('claude-3-5-sonnet-20241022')) as never,
        schema: ActionSchema,
        messages: useOpenAI ? messagesOpenAI : messagesAnthropic,
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

      const mTokens = Math.round(vision.deltaCompletion * 0.35);
      const dTokens = Math.max(0, vision.deltaCompletion - mTokens);
      const H_tokens = vision.deltaPrompt;
      const K_tokens = estimateKeystrokeTokens(action);
      const P_tokens = estimatePointingTokens(action);
      const R_ttft_sec = vision.ttftMs / 1000;

      const pAcquireStart = Date.now();
      await onTelemetry(
        buildTelemetryEvent({
          traceId,
          stepIndex: iterations,
          operator: 'H',
          startMs: vision.visionEndMs,
          endMs: pAcquireStart,
          tokens: H_tokens,
          promptTokensForCost: vision.promptTokens,
          completionTokensForCost: vision.completionTokens,
          provider,
          methodUsed: METHOD_VISION,
          selectionRule: action.reason?.trim() || selectionRule,
        })
      );

      if (action.type === 'done') {
        const totalTokens = mTokens + dTokens + H_tokens + K_tokens + P_tokens;
        await onAction({
          ...action,
          description: action.description || `${action.type} action`,
          operators: {
            M: mTokens,
            P: P_tokens,
            K: K_tokens,
            H: H_tokens,
            D: dTokens,
            R: R_ttft_sec,
          },
          totalTokens,
          difficultyScore: (totalTokens / userThreshold) * 100,
          isError: totalTokens > userThreshold,
          siteLatencySeconds: 0,
        } as AgentAction & ActionTokenUsage);
        break;
      }

      let siteLatencySeconds = 0;
      const responseStart = Date.now();

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
                /* try next */
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

        const pEnd = Date.now();
        await onTelemetry(
          buildTelemetryEvent({
            traceId,
            stepIndex: iterations,
            operator: 'P',
            startMs: pAcquireStart,
            endMs: pEnd,
            tokens: P_tokens,
            promptTokensForCost: vision.promptTokens,
            completionTokensForCost: vision.completionTokens,
            provider,
            methodUsed: 'Playwright_TargetAcquisition',
            selectionRule: action.reason?.trim() || selectionRule,
          })
        );

        await page.waitForLoadState('domcontentloaded').catch(() => {});
        await page.waitForTimeout(300);
        siteLatencySeconds = (Date.now() - responseStart) / 1000;
      } catch (actionError: any) {
        siteLatencySeconds = (Date.now() - responseStart) / 1000;
        await onError(`Action failed: ${actionError.message}`);
        continue;
      }

      const totalTokens = mTokens + dTokens + H_tokens + K_tokens + P_tokens;
      await onAction({
        ...action,
        description: action.description || `${action.type} action`,
        operators: {
          M: mTokens,
          P: P_tokens,
          K: K_tokens,
          H: H_tokens,
          D: dTokens,
          R: R_ttft_sec,
        },
        totalTokens,
        difficultyScore: (totalTokens / userThreshold) * 100,
        isError: totalTokens > userThreshold,
        siteLatencySeconds,
      } as AgentAction & ActionTokenUsage);

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
