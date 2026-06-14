/**
 * Agentic GOMS Telemetry Engine — PRD-aligned types and helpers.
 * Overhead target: mapping + persist < 10ms (sync work only; I/O is async/fire-and-forget).
 */

import { appendFile, mkdir } from 'fs/promises';
import { join } from 'path';

export type GomsOperatorCode = 'K' | 'P' | 'H' | 'D' | 'M' | 'R';

/**
 * NOTE: These operator codes describe low-level API/timing PHASES of a vision
 * step (request init, target acquisition, generation, etc.). They are distinct
 * from the human-behavior effort buckets in lib/gomsEffortModel.ts
 * (thinking / pointing / typing / homing / waiting), which are what the
 * dashboard renders. The telemetry stream is timing instrumentation only.
 */
export const OPERATOR_LABELS: Record<GomsOperatorCode, string> = {
  K: 'API Request Initiation',
  P: 'Target Acquisition / Indexing',
  H: 'Context Switching',
  D: 'Token Stream Generation',
  M: 'Mental Preparation (CoT)',
  R: 'TTFT / Network Wait (Response)',
};

export interface GomsTelemetryEvent {
  trace_id: string;
  step_index: number;
  operator: GomsOperatorCode;
  label: string;
  start_time: string;
  end_time: string;
  duration_ms: number;
  tokens: number;
  cost_estimate_usd: number;
  method_used: string;
  selection_rule: string;
}

export interface SessionTotals {
  tTotalMs: number;
  totalTokens: number;
  tokenDensity: number;
  totalCostUsd: number;
}

const TRACES_DIR = join(process.cwd(), 'data', 'traces');

function estimateCostUsd(
  promptTokens: number,
  completionTokens: number,
  provider: 'openai' | 'anthropic'
): number {
  const in1k =
    provider === 'openai'
      ? Number(process.env.OPENAI_PRICE_INPUT_PER_1K) || 0.0025
      : Number(process.env.ANTHROPIC_PRICE_INPUT_PER_1K) || 0.003;
  const out1k =
    provider === 'openai'
      ? Number(process.env.OPENAI_PRICE_OUTPUT_PER_1K) || 0.01
      : Number(process.env.ANTHROPIC_PRICE_OUTPUT_PER_1K) || 0.015;
  return (promptTokens / 1000) * in1k + (completionTokens / 1000) * out1k;
}

export function buildTelemetryEvent(input: {
  traceId: string;
  stepIndex: number;
  operator: GomsOperatorCode;
  startMs: number;
  endMs: number;
  tokens: number;
  promptTokensForCost?: number;
  completionTokensForCost?: number;
  provider: 'openai' | 'anthropic';
  methodUsed: string;
  selectionRule: string;
}): GomsTelemetryEvent {
  const duration_ms = Math.max(0, input.endMs - input.startMs);
  const pt = input.promptTokensForCost ?? 0;
  const ct = input.completionTokensForCost ?? 0;
  const cost_estimate_usd =
    input.tokens > 0 && (pt > 0 || ct > 0)
      ? estimateCostUsd(pt, ct, input.provider) * (input.tokens / Math.max(pt + ct, 1))
      : 0;

  return {
    trace_id: input.traceId,
    step_index: input.stepIndex,
    operator: input.operator,
    label: OPERATOR_LABELS[input.operator],
    start_time: new Date(input.startMs).toISOString(),
    end_time: new Date(input.endMs).toISOString(),
    duration_ms,
    tokens: input.tokens,
    cost_estimate_usd: Math.round(cost_estimate_usd * 1e6) / 1e6,
    method_used: input.methodUsed,
    selection_rule: input.selectionRule,
  };
}

/** T_total = sum of operator durations (PRD). D_token = total tokens / T_total (seconds). */
export function computeSessionTotals(events: GomsTelemetryEvent[]): SessionTotals {
  const tTotalMs = events.reduce((s, e) => s + e.duration_ms, 0);
  const totalTokens = events.reduce((s, e) => s + e.tokens, 0);
  const totalCostUsd = events.reduce((s, e) => s + e.cost_estimate_usd, 0);
  const tTotalSec = tTotalMs / 1000;
  const tokenDensity = tTotalSec > 0 ? totalTokens / tTotalSec : 0;
  return { tTotalMs, totalTokens, tokenDensity, totalCostUsd };
}

export async function persistTelemetryEvent(event: GomsTelemetryEvent): Promise<void> {
  const t0 = performance.now();
  try {
    await mkdir(TRACES_DIR, { recursive: true });
    const path = join(TRACES_DIR, `${event.trace_id}.jsonl`);
    await appendFile(path, JSON.stringify(event) + '\n', 'utf8');
  } catch {
    /* non-fatal */
  }
  if (performance.now() - t0 > 10) {
    console.warn('[gomsTelemetry] persist exceeded 10ms budget');
  }
}

export { estimateCostUsd };
