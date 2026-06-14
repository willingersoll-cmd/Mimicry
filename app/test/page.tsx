import { VibeCheckDashboard } from '@/components/VibeCheckDashboard';

export default function NewTestPage() {
  return (
    <main className="min-h-screen bg-background text-foreground py-[50px]">
      <div className="mx-auto max-w-[1684px] px-6 py-8">
        <VibeCheckDashboard mode="create" />
      </div>
    </main>
  );
}
