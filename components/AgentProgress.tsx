'use client';

import { AgentAction } from './VibeCheckDashboard';

interface AgentProgressProps {
  isRunning: boolean;
  task: string;
  actions: AgentAction[];
  currentUrl: string;
  startedAt?: string;
  onHoverActionIndex?: (idx: number | null) => void;
}

function getActionSummary(action: AgentAction): string {
  if (action.type === 'click' && action.clickText) {
    return `Clicked “${action.clickText}” — ${action.description}`;
  }
  if (action.type === 'type' && action.text) {
    return `Typed — ${action.description}`;
  }
  if (action.type === 'scroll' && action.direction) {
    return `Scrolled ${action.direction} — ${action.description}`;
  }
  return action.description;
}

function formatStepDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)}s` : `${Math.round(s)}s`;
}

function stepDurationMs(
  actions: AgentAction[],
  index: number,
  startedAt?: string
): number | null {
  const t = new Date(actions[index].timestamp).getTime();
  if (Number.isNaN(t)) return null;
  if (index > 0) {
    const prev = new Date(actions[index - 1].timestamp).getTime();
    if (Number.isNaN(prev)) return null;
    return Math.max(0, t - prev);
  }
  if (startedAt) {
    const start = new Date(startedAt).getTime();
    if (Number.isNaN(start)) return null;
    return Math.max(0, t - start);
  }
  return null;
}

export function AgentProgress({
  isRunning,
  task,
  actions,
  currentUrl,
  startedAt,
  onHoverActionIndex,
}: AgentProgressProps) {
  const getActionIcon = (type: string) => {
    switch (type) {
      case 'click':
        return '🖱️';
      case 'type':
        return '⌨️';
      case 'scroll':
        return '📜';
      default:
        return '⚡';
    }
  };

  return (
    <div className="font-normal flex h-full min-h-0 flex-col overflow-hidden">
      <div className="mb-4 shrink-0">
        <div className="text-2xl text-foreground">Your Agent’s Actions</div>
        <div className="text-sm text-gray-400">{actions.length} Actions</div>
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
        
        {actions.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
            No actions yet. Start testing to see agent progress.
          </p>
        ) : (
          <div className="space-y-2">
            {actions.map((action, index) => {
              const durationMs = stepDurationMs(actions, index, startedAt);
              return (
                <div
                  key={index}
                  className="p-3 bg-[#1F1F20]"
                  onMouseEnter={() => onHoverActionIndex?.(index)}
                  onMouseLeave={() => onHoverActionIndex?.(null)}
                >
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 shrink-0 border border-gray-700 bg-[#141415] flex items-center justify-center">
                      <span className="text-base">{getActionIcon(action.type)}</span>
                    </div>
                    <p className="flex-1 min-w-0 text-sm text-foreground leading-snug line-clamp-2">
                      {getActionSummary(action)}
                    </p>
                    <div className="shrink-0 flex flex-col items-end gap-0.5 text-right">
                      <span className="text-xs font-medium tabular-nums text-gray-300">
                        {durationMs != null ? formatStepDuration(durationMs) : '—'}
                      </span>
                      {action.isError && (
                        <span className="text-[10px] text-[#FCA5A5]">Over threshold</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
