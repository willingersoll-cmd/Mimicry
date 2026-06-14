'use client';

const BODY = '#9DABDD';
const WHEEL = '#C8CDD8';
const IDLE_BG = '#141415';
const ACTIVE_BG = '#1F1F20';
const ERROR_BG = '#2A1518';

function Wheel({
  cx,
  holeFill,
  isRunning,
}: {
  cx: number;
  holeFill: string;
  isRunning: boolean;
}) {
  return (
    <g
      className={isRunning ? 'status-wheel status-wheel--running' : undefined}
      style={{ transformOrigin: `${cx}px 38px` }}
    >
      <circle cx={cx} cy="38" r="4" fill={WHEEL} />
      <circle cx={cx} cy="38" r="1.5" fill={holeFill} />
      {isRunning && (
        <>
          <rect x={cx - 0.5} y="34.5" width="1" height="2" fill={holeFill} />
          <rect x={cx + 2.5} y="37.5" width="2" height="1" fill={holeFill} />
        </>
      )}
    </g>
  );
}

function PixelRobot({
  holeFill,
  isRunning,
  isCompleted,
  isFailed,
}: {
  holeFill: string;
  isRunning: boolean;
  isCompleted: boolean;
  isFailed: boolean;
}) {
  return (
    <>
      <g className={isRunning ? 'status-robot-body status-robot-body--running' : undefined}>
        {/* Antenna spark */}
        <rect x="21" y="6" width="3" height="3" fill={BODY} />
        <rect x="24" y="6" width="3" height="3" fill={BODY} />
        <rect x="27" y="6" width="3" height="3" fill={BODY} />
        <rect x="27" y="9" width="3" height="3" fill={BODY} />
        {/* Antenna */}
        <rect x="24" y="9" width="3" height="3" fill={BODY} />
        <rect x="24" y="12" width="3" height="3" fill={BODY} />
        <rect x="24" y="15" width="3" height="3" fill={BODY} />
        {/* Body */}
        <rect x="15" y="18" width="18" height="3" fill={BODY} />
        <rect x="12" y="21" width="24" height="3" fill={BODY} />
        <rect x="12" y="24" width="6" height="3" fill={BODY} />
        <rect x="21" y="24" width="6" height="3" fill={BODY} />
        <rect x="30" y="24" width="6" height="3" fill={BODY} />
        <rect x="12" y="27" width="24" height="3" fill={BODY} />
        <rect x="15" y="30" width="18" height="3" fill={BODY} />
        {/* Eyes */}
        <rect x="18" y="21" width="3" height="3" fill={holeFill} />
        <rect x="27" y="21" width="3" height="3" fill={holeFill} />
        {isCompleted && (
          <>
            {/* Happy smile */}
            <rect x="18" y="27" width="3" height="3" fill={holeFill} />
            <rect x="21" y="30" width="6" height="3" fill={holeFill} />
            <rect x="27" y="27" width="3" height="3" fill={holeFill} />
          </>
        )}
        {isFailed && (
          <>
            {/* Sad mouth */}
            <rect x="18" y="30" width="3" height="3" fill={holeFill} />
            <rect x="21" y="27" width="6" height="3" fill={holeFill} />
            <rect x="27" y="30" width="3" height="3" fill={holeFill} />
          </>
        )}
      </g>
      {/* Wheels */}
      <Wheel cx={16} holeFill={holeFill} isRunning={isRunning} />
      <Wheel cx={24} holeFill={holeFill} isRunning={isRunning} />
      <Wheel cx={32} holeFill={holeFill} isRunning={isRunning} />
    </>
  );
}

export function StatusIcon({
  isRunning,
  isCompleted = false,
  isFailed = false,
}: {
  isRunning: boolean;
  isCompleted?: boolean;
  isFailed?: boolean;
}) {
  const bgFill = isFailed ? ERROR_BG : isRunning || isCompleted ? ACTIVE_BG : IDLE_BG;

  return (
    <div
      className={`flex h-12 w-12 shrink-0 items-center justify-center ${
        isFailed ? 'bg-[#2A1518]' : isRunning || isCompleted ? 'bg-[#1F1F20]' : 'bg-[#141415]'
      }`}
      aria-hidden
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 48 48"
        fill="none"
        className="overflow-visible"
      >
        <PixelRobot
          holeFill={bgFill}
          isRunning={isRunning}
          isCompleted={isCompleted}
          isFailed={isFailed}
        />
      </svg>
      <style jsx global>{`
        .status-robot-body--running {
          animation: robot-roll-bob 760ms ease-in-out infinite;
        }

        .status-wheel--running {
          animation: robot-wheel-spin 520ms linear infinite;
          transform-box: view-box;
        }

        @keyframes robot-roll-bob {
          0%,
          100% {
            transform: translate(0, 0);
          }
          50% {
            transform: translate(1px, -1px);
          }
        }

        @keyframes robot-wheel-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .status-robot-body--running,
          .status-wheel--running {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
