import { z } from 'zod';

export const ActionSchema = z.object({
  type: z.enum(['click', 'type', 'scroll', 'done']),
  description: z.string().describe('A human-readable description of the action'),
  selector: z.string().optional().describe('Standard CSS only for type actions (e.g. #id, .class, input[name=email]). Do NOT use :contains() or :has-text().'),
  clickText: z.string().optional().describe('For click: the exact visible text of the button or link to click (e.g. "Register now"). Use this instead of selector when clicking by text.'),
  text: z.string().optional().describe('Text to type (for type actions)'),
  direction: z.enum(['up', 'down']).optional().describe('Scroll direction (for scroll actions)'),
  reason: z.string().optional().describe('Why this action was chosen'),
});

export type AgentAction = z.infer<typeof ActionSchema>;

/**
 * Human-behavior effort breakdown for a single action.
 *
 * These are NOT raw model tokens. They are derived "effort points" that model
 * how a human would expend effort completing the same interface action, split
 * into GOMS-inspired buckets. See lib/gomsEffortModel.ts for the derivation.
 */
export interface ActionEffort {
  /** Cognitive planning/interpretation effort (what to do next). */
  thinking: number;
  /** Target acquisition effort (finding/specifying the element). */
  pointing: number;
  /** Text/keyboard input effort. */
  typing: number;
  /** Context-switch/orientation effort (new page, scroll, first look). */
  homing: number;
  /** Waiting effort derived from model + site latency. */
  waiting: number;
  /** Sum of all effort buckets. */
  total: number;
}

/** Short human-readable justification for each effort bucket. */
export interface EffortReasons {
  thinking: string;
  pointing: string;
  typing: string;
  homing: string;
  waiting: string;
}

/**
 * Raw observable signals captured for an action. These are the inputs the
 * effort model consumes, kept on the action so the UI can explain the "why".
 */
export interface ActionObservations {
  /** Completion-token delta for this step (model output). */
  completionTokens: number;
  /** Prompt-token delta for this step (context fed in). */
  promptTokens: number;
  /** Length of the model's stated reason, in characters. */
  rationaleChars: number;
  /** The target text or selector used to locate the element. */
  targetText: string;
  /** Length of targetText in characters. */
  targetChars: number;
  /** Number of DOM elements that matched the target (ambiguity signal). */
  candidateCount: number;
  /** Count of clickable targets (buttons + links) in the viewport. */
  clickableCount: number;
  /** Count of <button>-like elements in the viewport. */
  buttonCount: number;
  /** Count of <a href> links in the viewport. */
  linkCount: number;
  /** Count of input/textarea/select fields in the viewport. */
  inputCount: number;
  /** Whether the URL changed relative to the previous step. */
  urlChanged: boolean;
  /** Number of failed locator attempts before the action succeeded. */
  retryCount: number;
  /** Characters typed for `type` actions. */
  typedChars: number;
  /** Wall time waiting on the model (TTFT + generation), ms. */
  modelWaitMs: number;
  /** Wall time waiting on the site to settle after the action, ms. */
  siteWaitMs: number;
  /** Time Playwright spent acquiring/acting on the target, ms. */
  targetAcquisitionMs: number;
}

/** Full result of running the effort model for one action. */
export interface EffortResult {
  effort: ActionEffort;
  reasons: EffortReasons;
  observations: ActionObservations;
}
