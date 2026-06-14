'use client';

import { VibeCheckDashboard } from '@/components/VibeCheckDashboard';

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-[1684px] px-6 py-8">
        <VibeCheckDashboard />
      </div>
    </main>
  );
}
