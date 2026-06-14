'use client';

import { useMemo, useRef, useState } from 'react';
import { AgentProgress } from './AgentProgress';
import { StatusIcon } from './StatusIcon';

export interface AgentAction {
  type: 'click' | 'type' | 'scroll';
  description: string;
  timestamp: string;
  url?: string;
  selector?: string;
  clickText?: string;
  text?: string;
  direction?: 'up' | 'down';
  /** GOMS token usage — R = TTFT (s); site latency separate (PRD). */
  operators?: { M: number; P: number; K: number; H: number; D: number; R: number };
  totalTokens?: number;
  difficultyScore?: number;
  isError?: boolean;
  siteLatencySeconds?: number;
}

type ScreenshotEvent = {
  screenshot: string;
  url: string;
  timestamp?: string;
};

export interface AgentState {
  isRunning: boolean;
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
  const barWidth = 44;
  const gap = 8;
  const chartHeight = 170;
  const paddingTop = 8;
  const paddingBottom = 8;
  const innerHeight = chartHeight - paddingTop - paddingBottom;

  const values = actions.map((a) => ({
    M: a.operators?.M ?? 0,
    P: a.operators?.P ?? 0,
    K: a.operators?.K ?? 0,
    H: a.operators?.H ?? 0,
    D: a.operators?.D ?? 0,
    total:
      a.totalTokens ??
      (a.operators
        ? a.operators.M + a.operators.P + a.operators.K + a.operators.H + (a.operators.D ?? 0)
        : 0),
    isError: !!a.isError,
  }));
  const maxTotal = Math.max(1, ...values.map((v) => v.total));

  const width = actions.length * (barWidth + gap) - gap;
  const scaleY = (t: number) => (t / maxTotal) * innerHeight;

  const colors = {
    M: '#5B21B6',
    P: '#2563EB',
    K: '#14B8A6',
    H: '#64748B',
    D: '#A855F7',
    error: '#DC2626',
  };

  return (
    <div className="bg-[#1F1F20] font-normal">
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="text-sm text-foreground">Difficulty over time</div>
        {userThreshold != null && (
          <div className="text-xs text-gray-400">Threshold: {userThreshold}</div>
        )}
      </div>

      <div className="px-4 pb-3 pt-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-300">
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5" style={{ background: colors.M }} />
            M Mental
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5" style={{ background: colors.P }} />
            P Pointing
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5" style={{ background: colors.K }} />
            K Keystroke
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5" style={{ background: colors.H }} />
            H Homing
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2.5 w-2.5" style={{ background: colors.D }} />
            D Drawing
          </span>
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

            {actions.map((_, i) => {
              const x = i * (barWidth + gap);
              const v = values[i];
              const isHover = hoveredIndex === i;
              const outline = isHover ? 'rgba(250,204,21,0.95)' : 'transparent';

              if (v.isError) {
                const h = scaleY(v.total);
                const y = paddingTop + (innerHeight - h);
                return (
                  <g key={i}>
                    <rect x={x} y={y} width={barWidth} height={h} rx={0} fill={colors.error} />
                    <rect x={x - 1} y={y - 1} width={barWidth + 2} height={h + 2} rx={0} fill="none" stroke={outline} strokeWidth={2} />
                  </g>
                );
              }

              const segs: Array<{ key: 'M' | 'P' | 'K' | 'H' | 'D'; value: number }> = [
                { key: 'M', value: v.M },
                { key: 'P', value: v.P },
                { key: 'K', value: v.K },
                { key: 'H', value: v.H },
                { key: 'D', value: v.D },
              ];

              let yCursor = chartHeight - paddingBottom;
              return (
                <g key={i}>
                  {segs.map((s) => {
                    const h = scaleY(s.value);
                    yCursor -= h;
                    if (h <= 0.5) return null;
                    return (
                      <rect
                        key={s.key}
                        x={x}
                        y={yCursor}
                        width={barWidth}
                        height={h}
                        rx={0}
                        fill={colors[s.key]}
                      />
                    );
                  })}
                  {v.total > 0 && (
                    <rect
                      x={x - 1}
                      y={paddingTop - 1}
                      width={barWidth + 2}
                      height={innerHeight + 2}
                      rx={0}
                      fill="none"
                      stroke={outline}
                      strokeWidth={2}
                      opacity={isHover ? 1 : 0}
                    />
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
          <span>0 sec</span>
          <span>{Math.max(0, actions.length)} actions</span>
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
            {pages.map((p) => {
              const last = p.screenshots[p.screenshots.length - 1];
              const label = formatHostish(p.url);
              return (
                <div
                  key={p.url}
                  className="w-[337px] shrink-0 bg-[#1F1F20] overflow-hidden"
                >
                  <div className="p-4">
                    <div className="overflow-hidden bg-black">
                      {last ? (
                        <img
                          src={`data:image/png;base64,${last.screenshot}`}
                          alt={`Screenshot for ${label}`}
                          className="h-[147px] w-full object-cover"
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
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function VibeCheckDashboard() {
  const [url, setUrl] = useState('');
  const [task, setTask] = useState('');
  const [userContext, setUserContext] = useState('');
  const [agentState, setAgentState] = useState<AgentState>({
    isRunning: false,
    currentUrl: '',
    task: '',
    actions: [],
    screenshots: [],
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const [hoveredActionIndex, setHoveredActionIndex] = useState<number | null>(null);

  const handleStart = async () => {
    if (!url.trim() || !task.trim()) {
      alert('Please provide both a URL and a task');
      return;
    }

    // Reset state
    setAgentState({
      isRunning: true,
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
        body: JSON.stringify({ url, task: userContext.trim() ? `${task}\n\nUser Context:\n${userContext}` : task }),
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
              }));
              return;
            } else if (data.type === 'done') {
              setAgentState((prev) => ({
                ...prev,
                isRunning: false,
              }));
              return;
            }
          } catch (e) {
            console.error('Error parsing SSE data:', e);
          }
        }
      }

      // Stream ended without 'done' or 'error' — stop running
      setAgentState(prev => ({ ...prev, isRunning: false }));
    } catch (error: any) {
      if (error.name === 'AbortError') {
        setAgentState(prev => ({
          ...prev,
          isRunning: false,
          error: 'Agent stopped by user',
        }));
      } else {
        setAgentState(prev => ({
          ...prev,
          isRunning: false,
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
    }));
  };

  const metrics = useMemo(() => {
    const actions = agentState.actions;
    const totalTokens = actions.reduce((sum, a) => sum + (a.totalTokens ?? 0), 0);
    const count = actions.length || 1;
    const avgDifficulty = actions.reduce((sum, a) => sum + (a.difficultyScore ?? 0), 0) / count;
    const startedAt = agentState.startedAt ? new Date(agentState.startedAt).getTime() : null;
    const now = Date.now();
    const elapsedSec = startedAt ? Math.max(0, (now - startedAt) / 1000) : 0;
    return {
      totalTokens,
      overallDifficulty: clamp(avgDifficulty, 0, 999),
      elapsedSec,
    };
  }, [agentState.actions, agentState.startedAt]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[401px_1fr] gap-6 font-normal">
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
              disabled={agentState.isRunning}
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
              disabled={agentState.isRunning}
            />
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
              disabled={agentState.isRunning}
            />
          </div>

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

          {agentState.error && (
            <div className="bg-[#2A1518] border border-[#7F1D1D] p-4">
              <p className="text-[#FCA5A5] text-sm">{agentState.error}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right Side - Analytics + actions + journey */}
      <div className="min-w-0">
        <div className="bg-[#28282B] p-6">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_359px] gap-8 items-start xl:items-stretch">
            {/* Main */}
            <div className="min-w-0 w-full max-w-[772px] space-y-6 self-start">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <StatusIcon isRunning={agentState.isRunning} />
                  <div>
                    <div className="text-2xl text-foreground">
                      {agentState.isRunning ? 'Working...' : 'Ready'}
                    </div>
                    <div className="text-sm text-gray-400">
                      {agentState.isRunning ? 'the agent is still completing the task' : 'start a run to see results'}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 ${agentState.isRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
                  <span className="text-sm text-gray-300">
                    {agentState.isRunning ? 'Agent Active' : 'Agent Idle'}
                  </span>
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
                  <div className="text-sm text-gray-400">Tokens used total</div>
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
                onHoverActionIndex={setHoveredActionIndex}
              />
            </div>
          </div>

          <JourneyGallery screenshots={agentState.screenshots} actions={agentState.actions} />
        </div>
      </div>
    </div>
  );
}
