import { VibeCheckDashboard } from '@/components/VibeCheckDashboard';

type PageProps = {
  params: { id: string };
};

export default function TestReplayPage({ params }: PageProps) {
  return (
    <main className="min-h-screen bg-background text-foreground py-[50px]">
      <div className="mx-auto max-w-[1684px] px-6 py-8">
        <VibeCheckDashboard mode="view" sessionId={params.id} />
      </div>
    </main>
  );
}
