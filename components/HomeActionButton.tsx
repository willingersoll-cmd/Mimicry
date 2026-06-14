'use client';

import Link from 'next/link';
import { Plus, RedoSharp } from 'pixelarticons/react';

export function HomeActionButtons() {
  return (
    <div className="flex items-center gap-4">
      <Link
        href="/test"
        className="inline-flex items-center gap-2.5 bg-accent text-white px-2.5 py-1.5 text-base hover:opacity-90 transition-opacity"
      >
        <Plus className="h-[22px] w-[22px] shrink-0" aria-hidden />
        <span>New test</span>
      </Link>
      <button
        type="button"
        disabled
        title="Coming soon"
        className="inline-flex items-center gap-2 text-gray-500 cursor-not-allowed text-sm"
      >
        <RedoSharp className="h-[22px] w-[22px] shrink-0" aria-hidden />
        <span>Retry a test</span>
      </button>
    </div>
  );
}
