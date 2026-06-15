import Link from 'next/link';
import type { TestSessionSummary } from '@/lib/testSessions';
import { truncateTaskSummary } from '@/lib/generateTaskSummary';
import { formatPastTestDate } from '@/lib/formatDate';
import { TestThumbnail } from './TestThumbnail';

type PastTestCardProps = {
  test: TestSessionSummary;
};

function cardLabel(test: TestSessionSummary): string {
  return test.taskSummary ?? truncateTaskSummary(test.task);
}

export function PastTestCard({ test }: PastTestCardProps) {
  const label = cardLabel(test);

  return (
    <Link
      href={`/test/${test.id}`}
      className="block bg-[#28282B] hover:bg-[#2f2f32] transition-colors"
    >
      <div className="p-5 text-foreground">
        <div className="flex gap-2 overflow-hidden h-[199px]">
          <TestThumbnail src={test.thumbnails[0]} flexClass="flex-[416]" />
          <TestThumbnail src={test.thumbnails[1]} flexClass="flex-[410]" />
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-foreground text-base truncate" title={test.task}>
              {label}
            </p>
            <p className="text-gray-400 text-base mt-1.5">
              {formatPastTestDate(test.completedAt)}
            </p>
          </div>
          <p className="text-[#BDB4FF] text-base shrink-0">
            {Math.round(test.difficultyPercent)}% Difficulty
          </p>
        </div>
      </div>
    </Link>
  );
}
