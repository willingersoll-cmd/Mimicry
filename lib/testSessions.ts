import { mkdir, readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import type { AgentAction, AgentState } from '@/components/VibeCheckDashboard';

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
  url: string;
  startedAt: string;
  completedAt: string;
  difficultyPercent: number;
  thumbnails: [string, string];
};

export type TestSessionRecord = TestSessionSummary & {
  actions: AgentAction[];
  screenshots: ScreenshotEvent[];
  telemetrySummary?: AgentState['telemetrySummary'];
};

export type SaveTestSessionInput = {
  id: string;
  task: string;
  url: string;
  startedAt: string;
  completedAt: string;
  difficultyPercent: number;
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

function thumbPath(id: string, index: number) {
  return join(sessionDir(id), `thumb-${index}.png`);
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

export async function getTestThumbnail(id: string, index: number): Promise<Buffer | null> {
  try {
    return await readFile(thumbPath(id, index));
  } catch {
    return null;
  }
}

export async function saveTestSession(input: SaveTestSessionInput): Promise<TestSessionSummary> {
  const dir = sessionDir(input.id);
  await mkdir(dir, { recursive: true });

  const thumbs: string[] = [];
  for (let i = 0; i < 2; i++) {
    const data = input.thumbnailData[i];
    if (data) {
      const buf = parseDataUrl(data);
      if (buf) {
        await writeFile(thumbPath(input.id, i), buf);
        thumbs.push(thumbnailApiPath(input.id, i));
      }
    }
  }

  while (thumbs.length < 2) {
    thumbs.push(thumbnailApiPath(input.id, thumbs.length));
  }

  const summary: TestSessionSummary = {
    id: input.id,
    task: input.task,
    url: input.url,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    difficultyPercent: input.difficultyPercent,
    thumbnails: [thumbs[0], thumbs[1]],
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
