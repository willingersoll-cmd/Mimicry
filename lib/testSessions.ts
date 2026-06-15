import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { AgentAction, AgentState } from '@/components/VibeCheckDashboard';
import { computeDifficultyPercent } from '@/lib/computeDifficulty';
import { isPlaceholderScreenshot, isPlaceholderScreenshotBuffer } from '@/lib/screenshotUtils';

const TESTS_DIR = join(process.cwd(), 'data', 'tests');
const INDEX_PATH = join(TESTS_DIR, 'index.json');

export type ScreenshotEvent = {
  screenshot: string;
  url: string;
  timestamp?: string;
};

export type TestSessionSummary = {
  id: string;
  task: string;
  taskSummary?: string;
  url: string;
  startedAt: string;
  completedAt: string;
  difficultyPercent: number;
  thumbnails: [string | null, string | null];
};

export type TestSessionRecord = TestSessionSummary & {
  actions: AgentAction[];
  screenshots: ScreenshotEvent[];
  telemetrySummary?: AgentState['telemetrySummary'];
};

export type SaveTestSessionInput = {
  id: string;
  task: string;
  taskSummary?: string;
  url: string;
  startedAt: string;
  completedAt: string;
  difficultyPercent?: number;
  thumbnailData: string[];
  actions: AgentAction[];
  screenshots: ScreenshotEvent[];
  telemetrySummary?: AgentState['telemetrySummary'];
};

function sessionDir(id: string) {
  return join(TESTS_DIR, id);
}

function sessionPath(id: string) {
  return join(sessionDir(id), 'session.json');
}

function thumbPath(id: string, index: number, ext = 'png') {
  return join(sessionDir(id), `thumb-${index}.${ext}`);
}

export function thumbnailApiPath(id: string, index: number): string {
  return `/api/tests/${id}/thumbnails/${index}`;
}

function parseDataUrl(data: string): Buffer | null {
  const trimmed = data.trim();
  const match = trimmed.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  const base64 = match ? match[1] : trimmed;
  try {
    return Buffer.from(base64, 'base64');
  } catch {
    return null;
  }
}

function detectContentType(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xd8) return 'image/jpeg';
  if (buffer.length >= 12 && buffer.slice(0, 4).toString('ascii') === 'RIFF' && buffer.slice(8, 12).toString('ascii') === 'WEBP') {
    return 'image/webp';
  }
  return 'image/png';
}

function firstTwoScreenshotData(input: Pick<SaveTestSessionInput, 'thumbnailData' | 'screenshots'>): [string, string] {
  const fromScreenshots = input.screenshots.slice(0, 2).map((s) => s.screenshot);
  return [
    input.thumbnailData[0] || fromScreenshots[0] || '',
    input.thumbnailData[1] || fromScreenshots[1] || '',
  ];
}

async function readIndex(): Promise<TestSessionSummary[]> {
  try {
    const raw = await readFile(INDEX_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeIndex(summaries: TestSessionSummary[]): Promise<void> {
  await mkdir(TESTS_DIR, { recursive: true });
  await writeFile(INDEX_PATH, JSON.stringify(summaries, null, 2), 'utf8');
}

export async function listTestSessions(): Promise<TestSessionSummary[]> {
  return readIndex();
}

export async function getTestSession(id: string): Promise<TestSessionRecord | null> {
  try {
    const raw = await readFile(sessionPath(id), 'utf8');
    return JSON.parse(raw) as TestSessionRecord;
  } catch {
    return null;
  }
}

export async function getTestThumbnail(
  id: string,
  index: number
): Promise<{ buffer: Buffer; contentType: string } | null> {
  for (const ext of ['png', 'webp', 'jpg', 'jpeg']) {
    try {
      const buffer = await readFile(thumbPath(id, index, ext));
      if (isPlaceholderScreenshotBuffer(buffer)) return null;
      return { buffer, contentType: detectContentType(buffer) };
    } catch {
      /* try next extension */
    }
  }

  const session = await getTestSession(id);
  const screenshot = session?.screenshots?.[index]?.screenshot;
  if (!screenshot || isPlaceholderScreenshot(screenshot)) return null;

  const buffer = parseDataUrl(screenshot);
  if (!buffer || isPlaceholderScreenshotBuffer(buffer)) return null;

  return { buffer, contentType: detectContentType(buffer) };
}

export async function saveTestSession(input: SaveTestSessionInput): Promise<TestSessionSummary> {
  const dir = sessionDir(input.id);
  await mkdir(dir, { recursive: true });

  const [firstShot, secondShot] = firstTwoScreenshotData(input);
  const thumbnailSources = [firstShot, secondShot];

  const thumbs: [string | null, string | null] = [null, null];
  for (let i = 0; i < 2; i++) {
    const data = thumbnailSources[i];
    if (!data || isPlaceholderScreenshot(data)) continue;

    const buf = parseDataUrl(data);
    if (!buf || isPlaceholderScreenshotBuffer(buf)) continue;

    await writeFile(thumbPath(input.id, i), buf);
    thumbs[i] = thumbnailApiPath(input.id, i);
  }

  const difficultyPercent = computeDifficultyPercent(input.actions);

  const summary: TestSessionSummary = {
    id: input.id,
    task: input.task,
    ...(input.taskSummary ? { taskSummary: input.taskSummary } : {}),
    url: input.url,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    difficultyPercent,
    thumbnails: thumbs,
  };

  const record: TestSessionRecord = {
    ...summary,
    actions: input.actions,
    screenshots: input.screenshots,
    telemetrySummary: input.telemetrySummary,
  };

  await writeFile(sessionPath(input.id), JSON.stringify(record, null, 2), 'utf8');

  const index = await readIndex();
  const without = index.filter((s) => s.id !== input.id);
  await writeIndex([summary, ...without]);

  return summary;
}

export async function patchTestSession(
  id: string,
  patch: Partial<Pick<TestSessionSummary, 'taskSummary' | 'difficultyPercent' | 'thumbnails'>>
): Promise<TestSessionSummary | null> {
  const index = await readIndex();
  const entryIndex = index.findIndex((s) => s.id === id);
  if (entryIndex === -1) return null;

  const updated: TestSessionSummary = {
    ...index[entryIndex],
    ...patch,
  };
  index[entryIndex] = updated;
  await writeIndex(index);

  try {
    const raw = await readFile(sessionPath(id), 'utf8');
    const record = JSON.parse(raw) as TestSessionRecord;
    if (patch.taskSummary !== undefined) record.taskSummary = patch.taskSummary;
    if (patch.difficultyPercent !== undefined) {
      record.difficultyPercent = patch.difficultyPercent;
    }
    if (patch.thumbnails !== undefined) record.thumbnails = patch.thumbnails;
    await writeFile(sessionPath(id), JSON.stringify(record, null, 2), 'utf8');
  } catch {
    /* session file may be missing; index update is enough for the home list */
  }

  return updated;
}

/** @deprecated Use patchTestSession */
export async function patchTestSessionSummary(
  id: string,
  taskSummary: string
): Promise<TestSessionSummary | null> {
  return patchTestSession(id, { taskSummary });
}
