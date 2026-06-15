import { NextRequest } from 'next/server';
import { computeDifficultyPercent } from '@/lib/computeDifficulty';
import {
  generateTaskSummary,
  truncateTaskSummary,
} from '@/lib/generateTaskSummary';
import {
  getTestSession,
  getTestThumbnail,
  listTestSessions,
  patchTestSession,
  saveTestSession,
} from '@/lib/testSessions';

async function resolveThumbnails(
  test: Awaited<ReturnType<typeof listTestSessions>>[number]
): Promise<[string | null, string | null]> {
  const resolved = await Promise.all(
    ([0, 1] as const).map(async (index) => {
      const url = test.thumbnails[index];
      if (!url) return null;
      const thumbnail = await getTestThumbnail(test.id, index);
      return thumbnail ? url : null;
    })
  );
  return [resolved[0], resolved[1]];
}

async function enrichTestSummary(
  test: Awaited<ReturnType<typeof listTestSessions>>[number],
  apiKey?: string
) {
  const session = await getTestSession(test.id);
  const actions = session?.actions ?? [];
  const difficultyPercent = computeDifficultyPercent(actions);
  const thumbnails = await resolveThumbnails(test);

  let taskSummary = test.taskSummary;
  if (!taskSummary) {
    const generated = await generateTaskSummary(test.task, { apiKey });
    taskSummary = generated ?? truncateTaskSummary(test.task);
  }

  const needsPatch =
    test.difficultyPercent !== difficultyPercent ||
    test.taskSummary !== taskSummary ||
    test.thumbnails[0] !== thumbnails[0] ||
    test.thumbnails[1] !== thumbnails[1];

  if (needsPatch) {
    const updated = await patchTestSession(test.id, {
      taskSummary,
      difficultyPercent,
      thumbnails,
    });
    return updated ?? { ...test, taskSummary, difficultyPercent, thumbnails };
  }

  return { ...test, taskSummary, difficultyPercent, thumbnails };
}

export async function GET(request: NextRequest) {
  const apiKey = request.nextUrl.searchParams.get('apiKey') ?? undefined;
  const tests = await listTestSessions();
  const enriched = await Promise.all(tests.map((test) => enrichTestSummary(test, apiKey)));
  return Response.json({ tests: enriched });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const task = typeof body.task === 'string' ? body.task.trim() : '';
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : undefined;

    if (!id || !task || !url) {
      return Response.json({ error: 'id, task, and url are required' }, { status: 400 });
    }

    const generated = await generateTaskSummary(task, { apiKey });
    const taskSummary = generated ?? truncateTaskSummary(task);

    const summary = await saveTestSession({
      id,
      task,
      taskSummary,
      url,
      startedAt: typeof body.startedAt === 'string' ? body.startedAt : new Date().toISOString(),
      completedAt: typeof body.completedAt === 'string' ? body.completedAt : new Date().toISOString(),
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
