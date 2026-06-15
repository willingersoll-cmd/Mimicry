import { createAnthropic, anthropic } from '@ai-sdk/anthropic';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

/** Fits one truncated line in PastTestCard (~374px at text-base). */
export const TASK_SUMMARY_MAX_CHARS = 45;

const TaskSummarySchema = z.object({
  summary: z
    .string()
    .describe(
      `A single-line summary of the usability test task. Maximum ${TASK_SUMMARY_MAX_CHARS} characters. No quotes.`
    ),
});

function resolveProvider(apiKey?: string): 'openai' | 'anthropic' | null {
  const userKey = apiKey?.trim();
  if (userKey) {
    return userKey.startsWith('sk-ant-') ? 'anthropic' : 'openai';
  }
  if (process.env.OPENAI_API_KEY?.trim()) return 'openai';
  if (process.env.ANTHROPIC_API_KEY?.trim()) return 'anthropic';
  return null;
}

function buildModel(provider: 'openai' | 'anthropic', apiKey?: string) {
  const userKey = apiKey?.trim();
  return provider === 'openai'
    ? (userKey ? createOpenAI({ apiKey: userKey }) : openai)('gpt-4o-mini')
    : (userKey ? createAnthropic({ apiKey: userKey }) : anthropic)(
        'claude-3-5-haiku-20241022'
      );
}

export function truncateTaskSummary(text: string, maxChars = TASK_SUMMARY_MAX_CHARS): string {
  const trimmed = text.trim().replace(/\s+/g, ' ');
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars - 1).trimEnd()}…`;
}

export async function generateTaskSummary(
  task: string,
  options?: { apiKey?: string }
): Promise<string | null> {
  const taskText = task.trim();
  if (!taskText) return null;

  const provider = resolveProvider(options?.apiKey);
  if (!provider) return null;

  try {
    const result = await generateObject({
      model: buildModel(provider, options?.apiKey) as never,
      schema: TaskSummarySchema,
      prompt: `Write a short card label summarizing this usability-testing task.

Task prompt:
"${taskText}"

Requirements:
- One line only
- At most ${TASK_SUMMARY_MAX_CHARS} characters
- Describe what the user is trying to accomplish (not how to test it)
- Plain language, no quotes, no trailing period
- Example style: "Finding passport information on USA.gov"`,
    });

    const summary = result.object.summary.trim();
    return summary ? truncateTaskSummary(summary) : null;
  } catch {
    return null;
  }
}
