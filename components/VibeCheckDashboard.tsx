'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AgentProgress } from './AgentProgress';
import { StatusIcon } from './StatusIcon';
import { ActionTypeIcon } from './ActionTypeIcon';

export interface ActionEffort {
  thinking: number;
  pointing: number;
  typing: number;
  homing: number;
  waiting: number;
  total: number;
}

export interface EffortReasons {
  thinking: string;
  pointing: string;
  typing: string;
  homing: string;
  waiting: string;
}

export interface ActionObservations {
  completionTokens: number;
  promptTokens: number;
  rationaleChars: number;
  targetText: string;
  targetChars: number;
  candidateCount: number;
  clickableCount: number;
  buttonCount: number;
  linkCount: number;
  inputCount: number;
  urlChanged: boolean;
  retryCount: number;
  typedChars: number;
  modelWaitMs: number;
  siteWaitMs: number;
  targetAcquisitionMs: number;
}

export interface AgentAction {
  type: 'click' | 'type' | 'scroll';
  description: string;
  timestamp: string;
  url?: string;
  selector?: string;
  clickText?: string;
  text?: string;
  direction?: 'up' | 'down';
  /** The agent's stated justification for choosing this action. */
  reason?: string;
  /** Human-behavior effort breakdown (preferred for display). */
  effort?: ActionEffort;
  effortReasons?: EffortReasons;
  observations?: ActionObservations;
  /** Legacy GOMS slots kept for backward compatibility. R = model wait (s). */
  operators?: { M: number; P: number; K: number; H: number; D: number; R: number };
  totalTokens?: number;
  difficultyScore?: number;
  isError?: boolean;
  siteLatencySeconds?: number;
}

/** Shared effort bucket metadata: key, label, color, accessor. */
export const EFFORT_BUCKETS = [
  { key: 'thinking', op: 'M', label: 'Thinking', color: '#5B21B6' },
  { key: 'pointing', op: 'P', label: 'Pointing', color: '#2563EB' },
  { key: 'typing', op: 'K', label: 'Typing', color: '#14B8A6' },
  { key: 'homing', op: 'H', label: 'Homing', color: '#64748B' },
  { key: 'waiting', op: 'D', label: 'Waiting', color: '#A855F7' },
] as const;

/** Read an effort bucket from an action, preferring `effort`, then `operators`. */
export function bucketValue(
  a: AgentAction,
  bucket: { key: keyof ActionEffort; op: 'M' | 'P' | 'K' | 'H' | 'D' }
): number {
  if (a.effort) return a.effort[bucket.key] ?? 0;
  if (a.operators) return a.operators[bucket.op] ?? 0;
  return 0;
}

export type EffortBucket = (typeof EFFORT_BUCKETS)[number];
export type EffortBucketKey = EffortBucket['key'];

/** The single operator that best represents what an action primarily did. */
const PRIMARY_OPERATOR_BY_ACTION: Record<string, EffortBucketKey> = {
  click: 'pointing',
  type: 'typing',
  scroll: 'homing',
};

/** The effort bucket metadata for an action's primary operator. */
export function primaryOperatorBucket(a: AgentAction): EffortBucket {
  const key = PRIMARY_OPERATOR_BY_ACTION[a.type] ?? 'thinking';
  return EFFORT_BUCKETS.find((b) => b.key === key) ?? EFFORT_BUCKETS[0];
}

/** Token count for just the action's primary operator (not the mixed total). */
export function primaryOperatorTokens(a: AgentAction): number {
  return bucketValue(a, primaryOperatorBucket(a));
}

type ScreenshotEvent = {
  screenshot: string;
  url: string;
  timestamp?: string;
};

type TaskPromptEvaluation = {
  hasClearGoal: boolean;
  hasSuccessCondition: boolean;
  isBareBones: boolean;
  message: string;
};

export interface AgentState {
  isRunning: boolean;
  isCompleted?: boolean;
  currentUrl: string;
  task: string;
  actions: AgentAction[];
  screenshots: ScreenshotEvent[];
  startedAt?: string;
  userThreshold?: number;
  traceId?: string;
  telemetrySummary?: {
    tTotalMs: number;
    totalTokens: number;
    tokenDensity: number;
    totalCostUsd: number;
  };
  error?: string;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function formatHostish(url: string) {
  try {
    const u = new URL(url);
    const path = u.pathname && u.pathname !== '/' ? u.pathname : '';
    return `${u.hostname}${path}`;
  } catch {
    return url;
  }
}

function StackedHistogram({
  actions,
  hoveredIndex,
  userThreshold,
}: {
  actions: AgentAction[];
  hoveredIndex: number | null;
  userThreshold?: number;
}) {
  // Once a run gets long, switch from a detailed per-operator column view to a
  // compact one-stacked-bar-per-action view so the chart stays scannable.
  const isStackedView = actions.length > 5;

  const barWidth = isStackedView ? 44 : 24;
  const barGap = 3; // gap between operator columns within the same action
  const groupGap = 18; // larger gap between separate agent actions
  const stackedGap = 8; // gap between action bars in stacked view
  const chartHeight = 202;
  const paddingTop = 8;
  const paddingBottom = 40;
  const innerHeight = chartHeight - paddingTop - paddingBottom;
  const errorColor = '#DC2626';

  // --- Granular view data (<= 5 actions): one column per non-zero operator ---
  const columns = actions.flatMap((a, actionIndex) => {
    const primaryKey = primaryOperatorBucket(a).key;
    const overThreshold =
      userThreshold != null && primaryOperatorTokens(a) > userThreshold;
    return EFFORT_BUCKETS.map((b) => ({
      actionIndex,
      key: b.key,
      label: b.label,
      color: b.color,
      value: bucketValue(a, b),
      isPrimary: b.key === primaryKey,
      overThreshold,
    })).filter((c) => c.value > 0);
  });

  let cursorX = 0;
  const placed = columns.map((c, idx) => {
    if (idx > 0) {
      const sameAction = columns[idx - 1].actionIndex === c.actionIndex;
      cursorX += barWidth + (sameAction ? barGap : groupGap);
    }
    return { ...c, x: cursorX };
  });

  const granularWidth = placed.length > 0 ? cursorX + barWidth : 0;
  const granularMax = Math.max(1, ...placed.map((p) => p.value));

  const actionGroups = actions
    .map((action, actionIndex) => {
      const groupColumns = placed.filter((p) => p.actionIndex === actionIndex);
      if (groupColumns.length === 0) return null;
      const first = groupColumns[0];
      const last = groupColumns[groupColumns.length - 1];
      return {
        action,
        actionIndex,
        centerX: (first.x + last.x + barWidth) / 2,
      };
    })
    .filter(Boolean) as Array<{ action: AgentAction; actionIndex: number; centerX: number }>;
  const groupSeparators = actionGroups.slice(1).map((g, idx) => {
    const prevColumns = placed.filter((p) => p.actionIndex === actionGroups[idx].actionIndex);
    const prevLast = prevColumns[prevColumns.length - 1];
    const currentColumns = placed.filter((p) => p.actionIndex === g.actionIndex);
    const currentFirst = currentColumns[0];
    return (prevLast.x + barWidth + currentFirst.x) / 2;
  });

  // --- Stacked view data (> 5 actions): one bar per action, segments stacked ---
  const actionBars = actions.map((a, actionIndex) => {
    const segments = EFFORT_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      color: b.color,
      value: bucketValue(a, b),
    })).filter((s) => s.value > 0);
    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const overThreshold =
      userThreshold != null && primaryOperatorTokens(a) > userThreshold;
    const x = actionIndex * (barWidth + stackedGap);
    return { action: a, actionIndex, segments, total, overThreshold, x };
  });

  const stackedWidth =
    actionBars.length > 0 ? actionBars.length * (barWidth + stackedGap) - stackedGap : 0;
  const stackedMax = Math.max(1, ...actionBars.map((b) => b.total));

  const width = isStackedView ? stackedWidth : granularWidth;
  const maxValue = isStackedView ? stackedMax : granularMax;
  const scaleY = (t: number) => (t / maxValue) * innerHeight;

  return (
    <div className="bg-[#1F1F20] font-normal">
      <div>
        <div className="flex items-center justify-between px-4 pt-3">
          <div className="text-sm text-foreground">Tokens over time</div>
          {userThreshold != null && (
            <div className="text-xs text-gray-400">Threshold: {userThreshold}</div>
          )}
        </div>

        <div className="px-4 pb-3 pt-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
            {EFFORT_BUCKETS.map((b) => (
              <span key={b.key} className="inline-flex items-center gap-2">
                <span className="h-2.5 w-2.5" style={{ background: b.color }} />
                {b.label}
              </span>
            ))}
          </div>
        </div>

        <div className="px-4 pb-4">
          <div className="overflow-x-auto">
            <svg width={Math.max(width, 700)} height={chartHeight} className="block">
            <line
              x1={0}
              x2={Math.max(width, 700)}
              y1={chartHeight - paddingBottom}
              y2={chartHeight - paddingBottom}
              stroke="rgba(148,163,184,0.5)"
            />

            {!isStackedView &&
              groupSeparators.map((x, idx) => (
                <line
                  key={idx}
                  x1={x}
                  x2={x}
                  y1={chartHeight - paddingBottom}
                  y2={chartHeight - 2}
                  stroke="rgba(148,163,184,0.22)"
                />
              ))}

            {!isStackedView &&
              placed.map((c, idx) => {
                const h = scaleY(c.value);
                const y = chartHeight - paddingBottom - h;
                const isHover = hoveredIndex === c.actionIndex;
                return (
                  <g key={idx}>
                    <motion.rect
                      x={c.x}
                      y={h <= 0.5 ? chartHeight - paddingBottom - 1 : y}
                      width={barWidth}
                      height={h <= 0.5 ? 1 : h}
                      rx={0}
                      fill={c.color}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.35, ease: 'easeOut', delay: idx * 0.025 }}
                    >
                      <title>{`${c.label}: ${c.value} tokens`}</title>
                    </motion.rect>
                    {c.overThreshold && c.isPrimary && (
                      <rect x={c.x} y={y - 3} width={barWidth} height={2} fill={errorColor} />
                    )}
                    {isHover && (
                      <rect
                        x={c.x - 1}
                        y={paddingTop - 1}
                        width={barWidth + 2}
                        height={innerHeight + 2}
                        rx={0}
                        fill="none"
                        stroke="#412FC6"
                        strokeWidth={2}
                      />
                    )}
                  </g>
                );
              })}

            {isStackedView &&
              actionBars.map((bar) => {
                const isHover = hoveredIndex === bar.actionIndex;
                const barTop = chartHeight - paddingBottom - scaleY(bar.total);
                let yCursor = chartHeight - paddingBottom;
                return (
                  <g key={bar.actionIndex}>
                    {bar.segments.map((s) => {
                      const h = scaleY(s.value);
                      yCursor -= h;
                      if (h <= 0.5) return null;
                      return (
                        <motion.rect
                          key={s.key}
                          x={bar.x}
                          y={yCursor}
                          width={barWidth}
                          height={h}
                          rx={0}
                          fill={s.color}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{
                            duration: 0.35,
                            ease: 'easeOut',
                            delay: bar.actionIndex * 0.035,
                          }}
                        >
                          <title>{`${s.label}: ${s.value} tokens`}</title>
                        </motion.rect>
                      );
                    })}
                    {(isHover || bar.overThreshold) && (
                      <rect
                        x={bar.x - 1}
                        y={barTop - 1}
                        width={barWidth + 2}
                        height={chartHeight - paddingBottom - barTop + 2}
                        rx={0}
                        fill="none"
                        stroke={bar.overThreshold && !isHover ? errorColor : '#412FC6'}
                        strokeWidth={2}
                      />
                    )}
                  </g>
                );
              })}

            {(isStackedView ? actionBars : actionGroups).map((g) => {
              const isHover = hoveredIndex === g.actionIndex;
              const centerX = isStackedView
                ? (g as (typeof actionBars)[number]).x + barWidth / 2
                : (g as (typeof actionGroups)[number]).centerX;
              return (
                <motion.foreignObject
                  key={g.actionIndex}
                  x={centerX - 10}
                  y={chartHeight - 30}
                  width={20}
                  height={20}
                  opacity={isHover ? 1 : 0.85}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: isHover ? 1 : 0.85 }}
                  transition={{ duration: 0.3, ease: 'easeOut', delay: g.actionIndex * 0.035 }}
                >
                  <div className="flex h-5 w-5 items-center justify-center bg-[#28282B] text-gray-200">
                    <ActionTypeIcon type={g.action.type} className="h-5 w-5" />
                  </div>
                </motion.foreignObject>
              );
            })}
          </svg>
        </div>
        </div>
      </div>
    </div>
  );
}

function JourneyGallery({
  screenshots,
  actions,
}: {
  screenshots: ScreenshotEvent[];
  actions: AgentAction[];
}) {
  const pages = useMemo(() => {
    const order: string[] = [];
    const map = new Map<
      string,
      { url: string; screenshots: ScreenshotEvent[]; actionCount: number; lastSeenAt?: string }
    >();

    const ensure = (url: string) => {
      if (!map.has(url)) {
        order.push(url);
        map.set(url, { url, screenshots: [], actionCount: 0 });
      }
      return map.get(url)!;
    };

    for (const s of screenshots) {
      const p = ensure(s.url);
      p.screenshots.push(s);
      p.lastSeenAt = s.timestamp;
    }

    for (const a of actions) {
      if (!a.url) continue;
      const p = ensure(a.url);
      p.actionCount += 1;
    }

    return order.map((u) => map.get(u)!);
  }, [screenshots, actions]);

  if (pages.length === 0) return null;

  return (
    <div className="font-normal mt-6 pt-6">
      <div className="text-2xl text-foreground">Your Agent’s Journey</div>
      <div className="text-sm text-gray-400">{pages.length} pages</div>

      <div className="pt-3">
        <div className="overflow-x-auto">
          <div className="flex gap-5 min-w-max">
            <AnimatePresence initial={false}>
            {pages.map((p) => {
              const last = p.screenshots[p.screenshots.length - 1];
              const label = formatHostish(p.url);
              return (
                <motion.div
                  key={p.url}
                  className="w-[337px] shrink-0 bg-[#1F1F20] overflow-hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="p-4">
                    <div className="overflow-hidden bg-black">
                      {last ? (
                        <motion.img
                          key={`${p.url}-${last.timestamp ?? p.screenshots.length}`}
                          src={`data:image/png;base64,${last.screenshot}`}
                          alt={`Screenshot for ${label}`}
                          className="h-[147px] w-full object-cover"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                        />
                      ) : (
                        <div className="h-[147px]" />
                      )}
                    </div>
                    <div className="mt-3">
                      <div className="text-sm text-foreground truncate" title={p.url}>
                        {label}
                      </div>
                      <div className="text-xs text-gray-400">
                        {p.actionCount} {p.actionCount === 1 ? 'action' : 'actions'}
                        {p.screenshots.length > 0 ? ` • ${p.screenshots.length} shots` : ''}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

export function VibeCheckDashboard({
  mode = 'create',
  sessionId,
}: {
  mode?: 'create' | 'view';
  sessionId?: string;
}) {
  const isViewMode = mode === 'view';
  const [url, setUrl] = useState('');
  const [task, setTask] = useState('');
  const [userContext, setUserContext] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [taskEvaluation, setTaskEvaluation] = useState<TaskPromptEvaluation | null>(null);
  const [agentState, setAgentState] = useState<AgentState>({
    isRunning: false,
    currentUrl: '',
    task: '',
    actions: [],
    screenshots: [],
  });
  const [viewLoading, setViewLoading] = useState(isViewMode);
  const [viewError, setViewError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const savedSessionRef = useRef(false);
  const [hoveredActionIndex, setHoveredActionIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!isViewMode || !sessionId) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/tests/${sessionId}`);
        if (!res.ok) {
          throw new Error('Test session not found');
        }
        const data = await res.json();
        if (cancelled) return;

        setUrl(data.url ?? '');
        setTask(data.task ?? '');
        setAgentState({
          isRunning: false,
          isCompleted: true,
          currentUrl: data.url ?? '',
          task: data.task ?? '',
          actions: Array.isArray(data.actions) ? data.actions : [],
          screenshots: Array.isArray(data.screenshots) ? data.screenshots : [],
          startedAt: data.startedAt,
          traceId: data.id,
          telemetrySummary: data.telemetrySummary,
        });
      } catch (error: unknown) {
        if (!cancelled) {
          setViewError(error instanceof Error ? error.message : 'Failed to load test session');
        }
      } finally {
        if (!cancelled) setViewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isViewMode, sessionId]);

  useEffect(() => {
    if (isViewMode) return;
    const taskText = task.trim();
    if (!taskText) {
      setTaskEvaluation(null);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      try {
        const response = await fetch('/api/task/evaluate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            task: taskText,
            apiKey: apiKey.trim() || undefined,
          }),
          signal: controller.signal,
        });

        if (!response.ok) return;
        const data = await response.json();
        setTaskEvaluation(data);
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Error evaluating task prompt:', error);
        }
      }
    }, 800);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [task, apiKey, isViewMode]);

  useEffect(() => {
    if (isViewMode || !agentState.isCompleted || savedSessionRef.current) return;
    if (!agentState.traceId || !url.trim() || !task.trim()) return;

    savedSessionRef.current = true;

    const actions = agentState.actions;
    const count = actions.length || 1;
    const avgDifficulty =
      actions.reduce((sum, a) => sum + (a.difficultyScore ?? 0), 0) / count;
    const difficultyPercent = clamp(avgDifficulty, 0, 999);
    const thumbnails = agentState.screenshots
      .slice(0, 2)
      .map((s) => s.screenshot)
      .filter(Boolean);

    void fetch('/api/tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: agentState.traceId,
        task,
        url,
        startedAt: agentState.startedAt ?? new Date().toISOString(),
        completedAt: new Date().toISOString(),
        difficultyPercent,
        thumbnailData: thumbnails,
        actions: agentState.actions,
        screenshots: agentState.screenshots,
        telemetrySummary: agentState.telemetrySummary,
      }),
    }).catch((error) => {
      console.error('Failed to save test session:', error);
      savedSessionRef.current = false;
    });
  }, [
    isViewMode,
    agentState.isCompleted,
    agentState.traceId,
    agentState.actions,
    agentState.screenshots,
    agentState.startedAt,
    agentState.telemetrySummary,
    task,
    url,
  ]);

  const handleStart = async () => {
    if (!url.trim() || !task.trim()) {
      alert('Please provide both a URL and a task');
      return;
    }

    // Reset state
    setAgentState({
      isRunning: true,
      isCompleted: false,
      currentUrl: url,
      task: task,
      actions: [],
      screenshots: [],
      error: undefined,
      startedAt: new Date().toISOString(),
    });

    // Create abort controller for cancellation
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch('/api/agent/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url,
          task: userContext.trim() ? `${task}\n\nUser Context:\n${userContext}` : task,
          apiKey: apiKey.trim() || undefined,
        }),
        signal: abortControllerRef.current.signal,
      });

      if (!response.ok) {
        throw new Error('Failed to start agent');
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const msg of parts) {
          const line = msg
            .split('\n')
            .map((l) => l.trimEnd())
            .find((l) => l.startsWith('data: '));
          if (!line) continue;
          try {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'meta') {
              setAgentState((prev) => ({
                ...prev,
                startedAt: data.startedAt ?? prev.startedAt,
                userThreshold: typeof data.userThreshold === 'number' ? data.userThreshold : prev.userThreshold,
                traceId: typeof data.traceId === 'string' ? data.traceId : prev.traceId,
              }));
            } else if (data.type === 'telemetry_summary') {
              setAgentState((prev) => ({
                ...prev,
                telemetrySummary: {
                  tTotalMs: data.tTotalMs,
                  totalTokens: data.totalTokens,
                  tokenDensity: data.tokenDensity,
                  totalCostUsd: data.totalCostUsd,
                },
              }));
            } else if (data.type === 'screenshot') {
              setAgentState((prev) => ({
                ...prev,
                currentUrl: data.url || prev.currentUrl,
                screenshots: [
                  ...prev.screenshots,
                  { screenshot: data.screenshot, url: data.url || prev.currentUrl, timestamp: data.timestamp },
                ],
              }));
            } else if (data.type === 'action') {
              setAgentState((prev) => ({
                ...prev,
                actions: [...prev.actions, data.action],
              }));
            } else if (data.type === 'error') {
              setAgentState((prev) => ({
                ...prev,
                error: data.error,
                isRunning: false,
                isCompleted: false,
              }));
              return;
            } else if (data.type === 'done') {
              setAgentState((prev) => ({
                ...prev,
                isRunning: false,
                isCompleted: true,
              }));
              return;
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }

      // Stream ended without 'done' or 'error' — stop running, but do not mark complete.
      setAgentState(prev => ({ ...prev, isRunning: false, isCompleted: false }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setAgentState(prev => ({
          ...prev,
          isRunning: false,
          isCompleted: false,
          error: 'Agent stopped by user',
        }));
      } else {
        setAgentState(prev => ({
          ...prev,
          isRunning: false,
          isCompleted: false,
          error: error.message || 'An error occurred',
        }));
      }
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setAgentState(prev => ({
      ...prev,
      isRunning: false,
      isCompleted: false,
    }));
  };

  const metrics = useMemo(() => {
    const actions = agentState.actions;
    const totalTokens = actions.reduce((sum, a) => sum + (a.totalTokens ?? 0), 0);
    const count = actions.length || 1;
    const avgDifficulty = actions.reduce((sum, a) => sum + (a.difficultyScore ?? 0), 0) / count;
    const startedAt = agentState.startedAt ? new Date(agentState.startedAt).getTime() : null;

    let elapsedSec = 0;
    if (agentState.telemetrySummary?.tTotalMs) {
      elapsedSec = agentState.telemetrySummary.tTotalMs / 1000;
    } else if (startedAt) {
      elapsedSec = Math.max(0, (Date.now() - startedAt) / 1000);
    }

    return {
      totalTokens,
      overallDifficulty: clamp(avgDifficulty, 0, 999),
      elapsedSec,
    };
  }, [agentState.actions, agentState.startedAt, agentState.telemetrySummary]);

  const hasFailed = !!agentState.error && !agentState.isRunning && !agentState.isCompleted;
  const failureExplanation = agentState.error?.replace(/^Action failed:\s*/i, '').trim();
  const statusTitle = agentState.isRunning
    ? 'Working...'
    : hasFailed
      ? 'Task failed'
      : agentState.isCompleted
        ? 'Task completed'
        : 'Ready';
  const statusSubtitle = agentState.isRunning
    ? 'the agent is still completing the task'
    : hasFailed
      ? failureExplanation
      : agentState.isCompleted
        ? 'the agent has finished the task'
        : isViewMode
          ? 'viewing saved test results'
          : 'click "start testing" to start the agent';

  if (isViewMode && viewLoading) {
    return <p className="text-sm text-gray-400">Loading test results…</p>;
  }

  if (isViewMode && viewError) {
    return (
      <div>
        <p className="text-[#FCA5A5] text-sm">{viewError}</p>
        <a href="/" className="inline-block mt-4 text-sm text-accent hover:opacity-90">
          ← Back to home
        </a>
      </div>
    );
  }

  const inputsDisabled = isViewMode || agentState.isRunning;

  return (
    <div className="font-normal">
      {isViewMode && (
        <a href="/" className="inline-block mb-6 text-sm text-gray-400 hover:text-foreground transition-colors">
          ← Back to home
        </a>
      )}
    <div className="grid grid-cols-1 lg:grid-cols-[401px_1fr] gap-6">
      {/* Left Side - Prompt inputs */}
      <div className="bg-[#1F1F20] p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl text-foreground">Your Prompt</h2>
            <p className="text-sm text-gray-400 mt-1">
              Here is what you provided to mimicry.
            </p>
          </div>
        </div>

        <div className="space-y-5 mt-6">
          <div>
            <label htmlFor="url" className="block text-sm text-gray-300 mb-2">
              Your testing website URL:
            </label>
            <input
              id="url"
              type="text"
              inputMode="url"
              autoComplete="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full px-4 py-3 border border-[#3E3E41] bg-[#28282B] text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              disabled={inputsDisabled}
            />
          </div>

          <div>
            <label htmlFor="task" className="block text-sm text-gray-300 mb-2">
              The Task:
            </label>
            <textarea
              id="task"
              value={task}
              onChange={(e) => setTask(e.target.value)}
              placeholder="Try to sign up for a newsletter"
              rows={5}
              className="w-full px-4 py-3 border border-[#3E3E41] bg-[#28282B] text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent resize-none"
              disabled={inputsDisabled}
            />
            {taskEvaluation?.isBareBones && (
              <div className="mt-3 bg-[#2A1518] border border-[#7F1D1D] p-4">
                <p className="text-[#FCA5A5] text-sm">
                  {taskEvaluation.message ||
                    'Add a clearer goal and success condition so the agent knows when the task is complete.'}
                </p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="userContext" className="block text-sm text-gray-300 mb-2">
              User Context:
            </label>
            <textarea
              id="userContext"
              value={userContext}
              onChange={(e) => setUserContext(e.target.value)}
              placeholder="Optional context (persona, constraints, device, etc.)"
              rows={5}
              className="w-full px-4 py-3 border border-[#3E3E41] bg-[#28282B] text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent resize-none"
              disabled={inputsDisabled}
            />
          </div>

          <div>
            <label htmlFor="apiKey" className="block text-sm text-gray-300 mb-2">
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Optional — falls back to the server key if blank"
              className="w-full px-4 py-3 border border-[#3E3E41] bg-[#28282B] text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
              disabled={inputsDisabled}
            />
          </div>

          {!isViewMode && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleStart}
              disabled={agentState.isRunning || !url.trim() || !task.trim()}
              title={
                agentState.isRunning
                  ? 'Test in progress'
                  : !url.trim() || !task.trim()
                    ? 'Enter a URL and task description to start'
                    : undefined
              }
              className="flex-1 bg-accent hover:opacity-90 disabled:bg-gray-600 disabled:cursor-not-allowed text-white py-3 px-6 transition-colors"
            >
              {agentState.isRunning ? 'Running...' : 'Start Testing'}
            </button>

            {agentState.isRunning && (
              <button
                onClick={handleStop}
                className="bg-[#DC2626] hover:opacity-90 text-white py-3 px-6 transition-colors"
              >
                Stop
              </button>
            )}
          </div>
          )}

          {!isViewMode && agentState.error && agentState.isRunning && (
            <div className="bg-[#2A1518] border border-[#7F1D1D] p-4">
              <p className="text-[#FCA5A5] text-sm">{agentState.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Analytics + actions + journey */}
      <div className="min-w-0">
        <div className="bg-[#28282B] p-6 xl:px-16">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_359px] gap-8 items-start xl:items-stretch">
            {/* Main */}
            <div className="min-w-0 w-full max-w-[772px] space-y-6 self-start">
              <div className="flex items-start gap-4">
                <div className="flex items-center gap-3">
                  <StatusIcon
                    isRunning={agentState.isRunning}
                    isCompleted={!!agentState.isCompleted}
                    isFailed={hasFailed}
                  />
                  <div>
                    <div className={`text-2xl ${hasFailed ? 'text-[#FCA5A5]' : 'text-foreground'}`}>
                      {statusTitle}
                    </div>
                    <div className="text-sm text-gray-400">
                      {statusSubtitle}
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="box-content bg-[#1F1F20] p-4 flex flex-col items-center justify-center text-center">
                  <div className="text-3xl text-foreground">
                    {metrics.overallDifficulty.toFixed(0)}%
                  </div>
                  <div className="text-sm text-gray-400">Difficulty Score</div>
                </div>
                <div className="box-content bg-[#1F1F20] p-4 flex flex-col items-center justify-center text-center">
                  <div className="text-3xl text-foreground">
                    {metrics.totalTokens}
                  </div>
                  <div className="text-sm text-gray-400">Total tokens</div>
                </div>
                <div className="box-content bg-[#1F1F20] p-4 flex flex-col items-center justify-center text-center">
                  <div className="text-3xl text-foreground">
                    {metrics.elapsedSec.toFixed(0)} sec
                  </div>
                  <div className="text-sm text-gray-400">Total time elapsed</div>
                </div>
              </div>

              <StackedHistogram
                actions={agentState.actions}
                hoveredIndex={hoveredActionIndex}
                userThreshold={agentState.userThreshold}
              />
            </div>

            {/* Sidebar actions */}
            <div className="min-h-0 w-full overflow-hidden xl:h-full xl:self-stretch xl:[contain:size] max-xl:max-h-[560px]">
              <AgentProgress
                isRunning={agentState.isRunning}
                task={agentState.task}
                actions={agentState.actions}
                currentUrl={agentState.currentUrl}
                startedAt={agentState.startedAt}
                userThreshold={agentState.userThreshold}
                onHoverActionIndex={setHoveredActionIndex}
              />
            </div>
          </div>

          <JourneyGallery screenshots={agentState.screenshots} actions={agentState.actions} />
        </div>
      </div>
    </div>
    </div>
  );
}
