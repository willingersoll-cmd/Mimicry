'use client';

import { useEffect, useState } from 'react';
import type { TestSessionSummary } from '@/lib/testSessions';
import { HomeActionButtons } from './HomeActionButton';
import { PastTestCard } from './PastTestCard';
import { StatusIcon } from './StatusIcon';

function DecorativePatternPanel() {
  return (
    <div
      className="hidden lg:block relative flex-1 min-h-[calc(100vh-100px)] overflow-hidden bg-[#1a1a1a]"
      aria-hidden
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/home/mimicry-background.png"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
    </div>
  );
}

export function HomePage() {
  const [tests, setTests] = useState<TestSessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/tests');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setTests(Array.isArray(data.tests) ? data.tests : []);
      } catch {
        /* non-fatal */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex gap-6 min-h-[calc(100vh-4rem)]">
      <div className="w-full max-w-[701px] flex flex-col">
        <header className="flex gap-7 items-start">
          <StatusIcon isRunning={false} size={81} />
          <div className="min-w-0 pt-1">
            <h1 className="text-[24px] leading-8 text-foreground">Let&apos;s start testing.</h1>
            <div className="mt-4">
              <HomeActionButtons />
            </div>
          </div>
        </header>

        <section className="mt-12 flex-1 min-h-0 flex flex-col">
          <h2 className="text-[24px] leading-8 text-foreground">
            {tests.length} Past test{tests.length === 1 ? '' : 's'}
          </h2>

          <div className="mt-5 flex-1 overflow-y-auto space-y-4 pr-1">
            {loading ? (
              <p className="text-sm text-gray-400">Loading past tests…</p>
            ) : tests.length === 0 ? (
              <p className="text-sm text-gray-400">
                No past tests yet. Run a new test to see results here.
              </p>
            ) : (
              tests.map((test) => <PastTestCard key={test.id} test={test} />)
            )}
          </div>
        </section>
      </div>

      <DecorativePatternPanel />
    </div>
  );
}
