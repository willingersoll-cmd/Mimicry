import { NextRequest } from 'next/server';
import { listTestSessions, saveTestSession } from '@/lib/testSessions';

export async function GET() {
  const tests = await listTestSessions();
  return Response.json({ tests });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';

    if (!id || !task || !url) {
      return Response.json({ error: 'id, task, and url are required' }, { status: 400 });
    }

    const summary = await saveTestSession({
      id,
      task,
      url,
      startedAt: typeof body.startedAt === 'string' ? body.startedAt : new Date().toISOString(),
      completedAt: typeof body.completedAt === 'string' ? body.completedAt : new Date().toISOString(),
      difficultyPercent: Number(body.difficultyPercent) || 0,
      thumbnailData: Array.isArray(body.thumbnailData) ? body.thumbnailData : [],
      actions: Array.isArray(body.actions) ? body.actions : [],
      screenshots: Array.isArray(body.screenshots) ? body.screenshots : [],
      telemetrySummary: body.telemetrySummary,
    });

    return Response.json({ summary });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save test session';
    return Response.json({ error: message }, { status: 500 });
  }
}
