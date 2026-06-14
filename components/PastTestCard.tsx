import Link from 'next/link';
import type { TestSessionSummary } from '@/lib/testSessions';
import { formatPastTestDate } from '@/lib/formatDate';

type PastTestCardProps = {
  test: TestSessionSummary;
};

export function PastTestCard({ test }: PastTestCardProps) {
  return (
    <Link
      href={`/test/${test.id}`}
      className="block bg-[#28282B] hover:bg-[#2f2f32] transition-colors"
    >
      <div className="p-5 text-foreground">
        <div className="flex gap-2 overflow-hidden h-[199px]">
          <div className="flex-[416] min-w-0 h-full bg-[#1F1F20] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={test.thumbnails[0]}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          </div>
          <div className="flex-[410] min-w-0 h-full bg-[#1F1F20] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={test.thumbnails[1]}
              alt=""
              className="w-full h-full object-cover object-top"
            />
          </div>
        </div>

        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-foreground text-sm truncate">{test.task}</p>
            <p className="text-gray-400 text-sm mt-1.5">
              {formatPastTestDate(test.completedAt)}
            </p>
          </div>
          <p className="text-[#BDB4FF] text-sm shrink-0">
            {Math.round(test.difficultyPercent)}% Difficulty
          </p>
        </div>
      </div>
    </Link>
  );
}
