/**
 * GOMS Effort Model
 * -----------------
 * Single source of truth for translating observable signals about an agent
 * action into a human-behavior-inspired effort breakdown:
 *
 *   thinking  - cognitive planning / interpretation effort
 *   pointing  - target acquisition effort (finding + specifying the element)
 *   typing    - keyboard / text input effort
 *   homing    - context-switch / orientation effort (new page, scroll, first look)
 *   waiting   - effort attributed to model + site latency
 *
 * Design goals:
 *  - Auditable: every bucket is a small, explicit formula with a stated reason.
 *  - Balanced: no single bucket (e.g. raw prompt/image tokens) dominates the bar.
 *  - Observable: inputs are real signals (tokens, DOM counts, timings, payloads),
 *    not private chain-of-thought.
 *
 * All buckets are expressed in unit-less "effort points" so they can be stacked
 * in the same chart. Tune the constants in EFFORT below in one place.
 */

import type {
  ActionEffort,
  ActionObservations,
  EffortReasons,
  EffortResult,
} from './agentTypes';

/** Centralized, tunable constants for the effort model. */
export const EFFORT = {
  /** Rough chars-per-token used to convert text length into token-ish points. */
  CHARS_PER_TOKEN: 4,

  // --- Thinking ---
  /** Floor so even trivial decisions register some cognitive effort. */
  THINKING_BASE: 2,
  /** Extra thinking per competing candidate target (disambiguation cost). */
  THINKING_PER_EXTRA_CANDIDATE: 1,

  // --- Pointing ---
  /** Floor for any targeted (click/type) action. */
  POINTING_BASE: 2,
  /** Effort per extra matching candidate (ambiguous target = harder to point). */
  POINTING_PER_EXTRA_CANDIDATE: 3,
  /** Number of clickable elements that adds 1 point of scan/clutter cost. */
  POINTING_CLUTTER_PER: 12,
  /** Cap on clutter points so a huge page does not explode the bar. */
  POINTING_CLUTTER_MAX: 12,
  /** Points per 100ms of Playwright target-acquisition latency. */
  POINTING_PER_100MS: 1,
  /** Effort added per failed locator attempt before success. */
  POINTING_PER_RETRY: 4,
  /** Fixed small pointing cost for a scroll (you still aim the viewport). */
  POINTING_SCROLL: 1,

  // --- Homing ---
  /** Orienting to the very first screen of the run. */
  HOMING_FIRST_ACTION: 30,
  /** Re-orienting after landing on a new URL/page. */
  HOMING_PAGE_SWITCH: 25,
  /** Re-orienting the viewport after a scroll. */
  HOMING_SCROLL: 8,
  /** Residual orientation cost when staying on the same page. */
  HOMING_RESIDUAL: 5,

  // --- Waiting ---
  /** Effort points per second of combined model + site wait. */
  WAITING_POINTS_PER_SEC: 10,
  /** Cap so a pathologically slow page does not dwarf everything else. */
  WAITING_MAX: 120,
} as const;

export interface EffortInput {
  actionType: 'click' | 'type' | 'scroll' | 'done';
  /** True only for the first executed action of the run. */
  isFirstAction: boolean;
  /** The model's stated reason for the action (used for thinking signal). */
  rationale: string;
  /** clickText or selector — whatever was used to locate the target. */
  targetText: string;
  /** Text typed for `type` actions. */
  typedText: string;
  /** Completion-token delta for this step. */
  completionTokens: number;
  /** Prompt-token delta for this step. */
  promptTokens: number;
  /** Number of DOM elements that matched the target. */
  candidateCount: number;
  /** Viewport element counts at action time. */
  dom: {
    buttons: number;
    links: number;
    inputs: number;
    clickable: number;
  };
  /** Whether the URL changed relative to the previous step. */
  urlChanged: boolean;
  /** Failed locator attempts before success. */
  retryCount: number;
  /** Playwright target acquisition/act time, ms. */
  targetAcquisitionMs: number;
  /** Model wait (TTFT + generation), ms. */
  modelWaitMs: number;
  /** Site settle wait after action, ms. */
  siteWaitMs: number;
}

function tokensFromChars(chars: number): number {
  return Math.ceil(Math.max(0, chars) / EFFORT.CHARS_PER_TOKEN);
}

function round(n: number): number {
  return Math.round(n);
}

/**
 * Compute the human-behavior effort breakdown for a single action.
 */
export function computeActionEffort(input: EffortInput): EffortResult {
  const rationaleChars = input.rationale?.length ?? 0;
  const targetChars = input.targetText?.length ?? 0;
  const typedChars = input.typedText?.length ?? 0;
  const extraCandidates = Math.max(0, input.candidateCount - 1);

  // --- Thinking: reasoning output + disambiguation overhead ---
  const reasoningTokens = Math.max(
    input.completionTokens,
    tokensFromChars(rationaleChars)
  );
  const thinking =
    input.actionType === 'done'
      ? Math.max(EFFORT.THINKING_BASE, reasoningTokens)
      : EFFORT.THINKING_BASE +
        reasoningTokens +
        extraCandidates * EFFORT.THINKING_PER_EXTRA_CANDIDATE;

  // --- Pointing: target acquisition ---
  let pointing = 0;
  let pointingReason: string;
  if (input.actionType === 'done') {
    pointing = 0;
    pointingReason = 'No target to acquire (task complete).';
  } else if (input.actionType === 'scroll') {
    pointing = EFFORT.POINTING_SCROLL;
    pointingReason = 'Scroll only nudges the viewport — minimal targeting.';
  } else {
    const targetTokens = tokensFromChars(targetChars);
    const ambiguity = extraCandidates * EFFORT.POINTING_PER_EXTRA_CANDIDATE;
    const clutter = Math.min(
      EFFORT.POINTING_CLUTTER_MAX,
      Math.floor(input.dom.clickable / EFFORT.POINTING_CLUTTER_PER)
    );
    const latency =
      Math.floor(input.targetAcquisitionMs / 100) * EFFORT.POINTING_PER_100MS;
    const retries = input.retryCount * EFFORT.POINTING_PER_RETRY;
    pointing = EFFORT.POINTING_BASE + targetTokens + ambiguity + clutter + latency + retries;

    const parts: string[] = [`acquired target among ${input.dom.clickable} clickable element(s)`];
    if (extraCandidates > 0) parts.push(`${extraCandidates} other match(es)`);
    if (input.targetAcquisitionMs >= 100) parts.push(`took ${input.targetAcquisitionMs}ms`);
    if (input.retryCount > 0) parts.push(`${input.retryCount} retr(ies)`);
    pointingReason = parts.join(', ') + '.';
  }

  // --- Typing: keyboard input ---
  const typing = input.actionType === 'type' ? tokensFromChars(typedChars) : 0;
  const typingReason =
    input.actionType === 'type'
      ? `Typed ${typedChars} character(s).`
      : 'No text entered for this action.';

  // --- Homing: context switching / orientation ---
  let homing: number;
  let homingReason: string;
  if (input.isFirstAction) {
    homing = EFFORT.HOMING_FIRST_ACTION;
    homingReason = 'Orienting to the first screen of the run.';
  } else if (input.urlChanged) {
    homing = EFFORT.HOMING_PAGE_SWITCH;
    homingReason = 'Landed on a new page — full re-orientation.';
  } else if (input.actionType === 'scroll') {
    homing = EFFORT.HOMING_SCROLL;
    homingReason = 'Viewport shifted — light re-orientation.';
  } else {
    homing = EFFORT.HOMING_RESIDUAL;
    homingReason = 'Same page in view — minimal re-orientation.';
  }

  // --- Waiting: model + site latency ---
  const waitMs = Math.max(0, input.modelWaitMs) + Math.max(0, input.siteWaitMs);
  const waiting = Math.min(
    EFFORT.WAITING_MAX,
    round((waitMs / 1000) * EFFORT.WAITING_POINTS_PER_SEC)
  );
  const waitingReason = `Waited ${(waitMs / 1000).toFixed(1)}s (model ${(
    input.modelWaitMs / 1000
  ).toFixed(1)}s + site ${(input.siteWaitMs / 1000).toFixed(1)}s).`;

  const thinkingRounded = round(thinking);
  const pointingRounded = round(pointing);
  const typingRounded = round(typing);
  const homingRounded = round(homing);

  const effort: ActionEffort = {
    thinking: thinkingRounded,
    pointing: pointingRounded,
    typing: typingRounded,
    homing: homingRounded,
    waiting,
    total: thinkingRounded + pointingRounded + typingRounded + homingRounded + waiting,
  };

  const reasons: EffortReasons = {
    thinking:
      input.actionType === 'done'
        ? 'Reasoning to confirm the task is complete.'
        : 'Planning and interpreting the next action' +
          (extraCandidates > 0
            ? ` while disambiguating ${extraCandidates} similar target(s).`
            : '.'),
    pointing: pointingReason,
    typing: typingReason,
    homing: homingReason,
    waiting: waitingReason,
  };

  const observations: ActionObservations = {
    completionTokens: input.completionTokens,
    promptTokens: input.promptTokens,
    rationaleChars,
    targetText: input.targetText,
    targetChars,
    candidateCount: input.candidateCount,
    clickableCount: input.dom.clickable,
    buttonCount: input.dom.buttons,
    linkCount: input.dom.links,
    inputCount: input.dom.inputs,
    urlChanged: input.urlChanged,
    retryCount: input.retryCount,
    typedChars,
    modelWaitMs: round(input.modelWaitMs),
    siteWaitMs: round(input.siteWaitMs),
    targetAcquisitionMs: round(input.targetAcquisitionMs),
  };

  return { effort, reasons, observations };
}

/**
 * Scale an effort breakdown so its buckets sum EXACTLY to `targetTotal` — the
 * real number of tokens the step consumed — while preserving the relative
 * proportions produced by the effort model. Uses largest-remainder rounding so
 * the integer buckets add up to the target precisely (no off-by-one drift).
 *
 * This is what lets the dashboard display token counts that line up 1:1 with
 * actual model usage: the stacked bars still show the thinking/pointing/typing/
 * homing/waiting split, but their sum equals the tokens billed for the step.
 */
export function scaleEffortToTokens(
  effort: ActionEffort,
  targetTotal: number
): ActionEffort {
  const target = Math.max(0, Math.round(targetTotal));
  if (target === 0) {
    return { thinking: 0, pointing: 0, typing: 0, homing: 0, waiting: 0, total: 0 };
  }

  const keys: Array<keyof Omit<ActionEffort, 'total'>> = [
    'thinking',
    'pointing',
    'typing',
    'homing',
    'waiting',
  ];
  const weights = keys.map((k) => Math.max(0, effort[k]));
  const weightSum = weights.reduce((a, b) => a + b, 0);

  // No signal to distribute by — attribute the whole step to thinking.
  if (weightSum === 0) {
    return { thinking: target, pointing: 0, typing: 0, homing: 0, waiting: 0, total: target };
  }

  const raw = weights.map((w) => (w / weightSum) * target);
  const result = raw.map((r) => Math.floor(r));
  let remainder = target - result.reduce((a, b) => a + b, 0);
  const byFraction = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let j = 0; remainder > 0; j++, remainder--) {
    result[byFraction[j % byFraction.length].i] += 1;
  }

  return {
    thinking: result[0],
    pointing: result[1],
    typing: result[2],
    homing: result[3],
    waiting: result[4],
    total: target,
  };
}
