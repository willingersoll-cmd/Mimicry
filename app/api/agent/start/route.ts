import { randomUUID } from 'crypto';
import { NextRequest } from 'next/server';
import type { Page } from 'playwright';
import { createPage, navigateToUrl, captureScreenshot } from '@/lib/browser';
import { runAgentLoop, AgentAction } from '@/lib/agent';
import { computeSessionTotals, type GomsTelemetryEvent } from '@/lib/gomsTelemetry';

export const maxDuration = 300; // 5 minutes for Vercel

export async function POST(request: NextRequest) {
  const hasOpenAI = !!process.env.OPENAI_API_KEY?.trim();
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY?.trim();
  if (!hasOpenAI && !hasAnthropic) {
    return new Response(
      JSON.stringify({
        error: 'Add OPENAI_API_KEY or ANTHROPIC_API_KEY to .env.local and restart the dev server.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { url, task } = await request.json();

  if (!url || !task) {
    return new Response(
      JSON.stringify({ error: 'URL and task are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create a readable stream for SSE
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      let page: Page | undefined;
      const traceId = randomUUID();
      const telemetryBuffer: GomsTelemetryEvent[] = [];
      try {
        const userThreshold =
          Number(process.env.USER_TOKEN_THRESHOLD) ||
          2000; // keep in sync with DEFAULT_TOKEN_THRESHOLD in lib/agent.ts

        // Create page and navigate
        page = await createPage();
        await navigateToUrl(page, url);

        // Capture initial screenshot
        const initialScreenshot = await captureScreenshot(page);

        send({
          type: 'meta',
          traceId,
          startedAt: new Date().toISOString(),
          userThreshold,
        });

        // Run agent loop (it will send the initial screenshot)
        await runAgentLoop(
          page,
          task,
          initialScreenshot,
          async (action: AgentAction) => {
            send({
              type: 'action',
              action: {
                ...action,
                timestamp: new Date().toISOString(),
                url: page?.url?.() || url,
              },
            });
          },
          async ({ screenshot, url }: { screenshot: string; url: string }) => {
            send({ type: 'screenshot', screenshot, url, timestamp: new Date().toISOString() });
          },
          async (error: string) => {
            send({ type: 'error', error });
          },
          {
            traceId,
            onTelemetry: async (event) => {
              telemetryBuffer.push(event);
              send({ type: 'telemetry', event });
            },
          }
        );

        const totals = computeSessionTotals(telemetryBuffer);
        send({ type: 'telemetry_summary', traceId, ...totals });

        send({ type: 'done' });
      } catch (error: any) {
        send({ type: 'error', error: error.message || 'Unknown error occurred' });
      } finally {
        if (page) {
          await page.close();
        }
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
