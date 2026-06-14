import { NextRequest } from 'next/server';
import { createAnthropic, anthropic } from '@ai-sdk/anthropic';
import { createOpenAI, openai } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';

const TaskEvaluationSchema = z.object({
  hasClearGoal: z.boolean(),
  hasSuccessCondition: z.boolean(),
  isBareBones: z.boolean(),
  message: z
    .string()
    .describe(
      'One short user-facing warning sentence explaining what is missing and how to improve it.'
    ),
});

export async function POST(request: NextRequest) {
  const { task, apiKey } = await request.json();
  const taskText = typeof task === 'string' ? task.trim() : '';
  const userKey = typeof apiKey === 'string' ? apiKey.trim() : '';

  if (!taskText) {
    return Response.json({
      hasClearGoal: false,
      hasSuccessCondition: false,
      isBareBones: false,
      message: '',
    });
  }

  const hasOpenAI = !!process.env.OPENAI_API_KEY?.trim();
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY?.trim();
  if (!userKey && !hasOpenAI && !hasAnthropic) {
    return Response.json(
      {
        error:
          'Enter an API key, or add OPENAI_API_KEY / ANTHROPIC_API_KEY to .env.local.',
      },
      { status: 400 }
    );
  }

  const provider: 'openai' | 'anthropic' = userKey
    ? userKey.startsWith('sk-ant-')
      ? 'anthropic'
      : 'openai'
    : process.env.OPENAI_API_KEY?.trim()
      ? 'openai'
      : 'anthropic';

  const model =
    provider === 'openai'
      ? (userKey ? createOpenAI({ apiKey: userKey }) : openai)('gpt-4o-mini')
      : (userKey ? createAnthropic({ apiKey: userKey }) : anthropic)(
          'claude-3-5-haiku-20241022'
        );

  const result = await generateObject({
    model: model as never,
    schema: TaskEvaluationSchema,
    prompt: `Evaluate this usability-testing task prompt:

"${taskText}"

A good task prompt includes:
- a clear user goal: what the simulated user is trying to accomplish
- a success condition: how the agent/human tester will know the task is complete

Mark isBareBones true if either the goal or success condition is missing, vague, or only implied.
Return a concise warning message only when isBareBones is true. The message should tell the user exactly what to add, in one sentence.`,
  });

  return Response.json(result.object);
}
