'use client';

import {
  KeyboardMusic,
  Loader,
  Pointer,
  ScrollVertical,
} from 'pixelarticons/react';
import type { AgentAction } from './VibeCheckDashboard';

type ActionType = AgentAction['type'] | 'thinking' | string;

export function ActionTypeIcon({
  type,
  className = 'h-5 w-5',
}: {
  type: ActionType;
  className?: string;
}) {
  const iconClassName = `${className} text-current`;

  if (type === 'click') return <Pointer className={iconClassName} aria-hidden />;
  if (type === 'type') return <KeyboardMusic className={iconClassName} aria-hidden />;
  if (type === 'scroll') return <ScrollVertical className={iconClassName} aria-hidden />;

  return <Loader className={iconClassName} aria-hidden />;
}
