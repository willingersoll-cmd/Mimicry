'use client';

import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AgentAction, primaryOperatorBucket, primaryOperatorTokens } from './VibeCheckDashboard';
import { ActionTypeIcon } from './ActionTypeIcon';

interface AgentProgressProps {
  isRunning: boolean;
  task: string;
  actions: AgentAction[];
  currentUrl: string;
  startedAt?: string;
  userThreshold?: number;
  onHoverActionIndex?: (idx: number | null) => void;
}

/** Short, single-line label for the card header (truncated with ellipsis). */
function getActionTitle(action: AgentAction): string {
  if (action.type === 'click') {
    return action.clickText ? `Clicked “${action.clickText}”` : 'Clicked element';
  }
  if (action.type === 'type') {
    return action.text ? `Typed “${action.text}”` : 'Typed text';
  }
  if (action.type === 'scroll') {
    return `Scrolled ${action.direction ?? 'down'}`;
  }
  return action.description || 'Action';
}

/** One-sentence justification shown when the card is expanded. */
function getJustification(action: AgentAction): string {
  const rawReason = (action.reason || action.description || '').trim();
  const reason = rawReason.replace(/\s+/g, ' ');

  if (reason) {
    const firstPerson = /\bI\s+(saw|noticed|looked|clicked|typed|scrolled|opened|checked|selected|found|used)\b/i.test(reason);
    return firstPerson
      ? reason
      : `I noticed ${reason.charAt(0).toLowerCase()}${reason.slice(1)}`;
  }

  if (action.type === 'click' && action.clickText) {
    return `I saw “${action.clickText}” as the most relevant next step, so I clicked it to keep moving toward the task.`;
  }
  if (action.type === 'type' && action.text) {
    return `I found the input field and typed “${action.text}” because that information was needed to continue.`;
  }
  if (action.type === 'scroll') {
    return `I scrolled ${action.direction ?? 'down'} to look for more information that was not visible yet.`;
  }

  return 'I completed this step because it appeared to move the task forward.';
}

function formatStepDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const s = ms / 1000;
  return s < 10 ? `${s.toFixed(1)} sec` : `${Math.round(s)} sec`;
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

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

export function AgentProgress({
  isRunning,
  task,
  actions,
  currentUrl,
  startedAt,
  userThreshold,
  onHoverActionIndex,
}: AgentProgressProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

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
            <AnimatePresence initial={false}>
            {actions.map((action, index) => {
              const durationMs = stepDurationMs(actions, index, startedAt);
              const isExpanded = expandedIndex === index;
              const primaryBucket = primaryOperatorBucket(action);
              const primaryTokens = primaryOperatorTokens(action);
              const overThreshold =
                userThreshold != null && primaryTokens > userThreshold;
              return (
                <motion.div
                  key={`${action.timestamp}-${index}`}
                  className="bg-[#1F1F20] p-4 cursor-pointer"
                  onMouseEnter={() => onHoverActionIndex?.(index)}
                  onMouseLeave={() => onHoverActionIndex?.(null)}
                  onClick={() => setExpandedIndex(isExpanded ? null : index)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center bg-[#28282B] text-gray-200">
                      <ActionTypeIcon type={action.type} className="h-5 w-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm text-foreground">
                          {getActionTitle(action)}
                        </p>
                        <Chevron open={isExpanded} />
                      </div>

                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-400">
                        <span className="tabular-nums">
                          {durationMs != null ? formatStepDuration(durationMs) : '—'}
                        </span>
                        <span className="text-gray-600">·</span>
                        <span className="inline-flex items-center gap-1.5 tabular-nums">
                          <span
                            className="h-2 w-2 shrink-0"
                            style={{ background: primaryBucket.color }}
                          />
                          {primaryTokens} {primaryBucket.label.toLowerCase()} tokens
                        </span>
                        {overThreshold && (
                          <span className="text-[#FCA5A5]">Over threshold</span>
                        )}
                      </div>

                      {isExpanded && (
                        <p className="mt-3 text-sm leading-relaxed text-gray-400">
                          {getJustification(action)}
                        </p>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
