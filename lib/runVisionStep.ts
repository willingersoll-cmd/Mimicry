import { streamObject, type CoreMessage } from 'ai';
import type { z } from 'zod';
import type { AgentAction } from './agentTypes';
import {
  buildTelemetryEvent,
  persistTelemetryEvent,
  type GomsTelemetryEvent,
} from './gomsTelemetry';

const METHOD_VISION = 'StreamObject_VisionNavigate';

export interface VisionStepResult {
  action: AgentAction;
  promptTokens: number;
  completionTokens: number;
  deltaPrompt: number;
  deltaCompletion: number;
  /** TTFT in ms (first partial object chunk). */
  ttftMs: number;
  /** Wall time for stream after first partial (drawing phase). */
  streamGenMs: number;
  /** Timestamp when vision step finished (for Homing: switch to browser). */
  visionEndMs: number;
  events: GomsTelemetryEvent[];
}

/**
 * Runs one vision planning step with streamObject to measure TTFT (R) and split M/D tokens.
 */
export async function runVisionStep(input: {
  model: any;
  schema: z.ZodType<AgentAction>;
  messages: CoreMessage[];
  traceId: string;
  stepIndex: number;
  lastPromptTokens: number;
  lastCompletionTokens: number;
  provider: 'openai' | 'anthropic';
  selectionRule: string;
  onTelemetry: (e: GomsTelemetryEvent) => Promise<void>;
}): Promise<VisionStepResult> {
  const events: GomsTelemetryEvent[] = [];
  const emit = async (e: GomsTelemetryEvent) => {
    events.push(e);
    await input.onTelemetry(e);
    void persistTelemetryEvent(e);
  };

  const kStart = Date.now();
  const result = await streamObject({
    model: input.model as never,
    schema: input.schema,
    messages: input.messages,
  });
  const kEnd = Date.now();

  await emit(
    buildTelemetryEvent({
      traceId: input.traceId,
      stepIndex: input.stepIndex,
      operator: 'K',
      startMs: kStart,
      endMs: kEnd,
      tokens: 0,
      provider: input.provider,
      methodUsed: METHOD_VISION,
      selectionRule: input.selectionRule,
    })
  );

  let firstPartialMs: number | null = null;
  const rStart = kStart;
  for await (const _ of result.partialObjectStream) {
    if (firstPartialMs === null) firstPartialMs = Date.now();
  }
  const streamEnd = Date.now();
  const firstAt = firstPartialMs ?? streamEnd;
  const ttftMs = firstAt - rStart;
  const streamGenMs = streamEnd - firstAt;

  const usage = await result.usage;
  const object = await result.object;
  const action = object as AgentAction;

  const promptTokens = usage?.promptTokens ?? 0;
  const completionTokens = usage?.completionTokens ?? 0;
  const deltaPrompt = Math.max(0, promptTokens - input.lastPromptTokens);
  const deltaCompletion = Math.max(0, completionTokens - input.lastCompletionTokens);

  await emit(
    buildTelemetryEvent({
      traceId: input.traceId,
      stepIndex: input.stepIndex,
      operator: 'R',
      startMs: rStart,
      endMs: firstAt,
      tokens: 0,
      provider: input.provider,
      methodUsed: METHOD_VISION,
      selectionRule: input.selectionRule,
    })
  );

  const mTokens = Math.round(deltaCompletion * 0.35);
  const dTokens = Math.max(0, deltaCompletion - mTokens);
  const mDur = Math.round(streamGenMs * 0.35);
  const dDur = Math.max(0, streamGenMs - mDur);

  await emit(
    buildTelemetryEvent({
      traceId: input.traceId,
      stepIndex: input.stepIndex,
      operator: 'M',
      startMs: firstAt,
      endMs: firstAt + mDur,
      tokens: mTokens,
      promptTokensForCost: promptTokens,
      completionTokensForCost: completionTokens,
      provider: input.provider,
      methodUsed: METHOD_VISION,
      selectionRule: input.selectionRule,
    })
  );

  await emit(
    buildTelemetryEvent({
      traceId: input.traceId,
      stepIndex: input.stepIndex,
      operator: 'D',
      startMs: firstAt + mDur,
      endMs: streamEnd,
      tokens: dTokens,
      promptTokensForCost: promptTokens,
      completionTokensForCost: completionTokens,
      provider: input.provider,
      methodUsed: METHOD_VISION,
      selectionRule: input.selectionRule,
    })
  );

  return {
    action,
    promptTokens,
    completionTokens,
    deltaPrompt,
    deltaCompletion,
    ttftMs,
    streamGenMs,
    visionEndMs: streamEnd,
    events,
  };
}
