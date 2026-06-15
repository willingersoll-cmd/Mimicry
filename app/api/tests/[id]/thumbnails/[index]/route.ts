import { getTestThumbnail } from '@/lib/testSessions';

export async function GET(
  _request: Request,
  { params }: { params: { id: string; index: string } }
) {
  const index = Number(params.index);
  if (!Number.isInteger(index) || index < 0 || index > 1) {
    return new Response('Invalid thumbnail index', { status: 400 });
  }

  const thumbnail = await getTestThumbnail(params.id, index);
  if (!thumbnail) {
    return new Response('Thumbnail not found', { status: 404 });
  }

  return new Response(new Uint8Array(thumbnail.buffer), {
    headers: {
      'Content-Type': thumbnail.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
    },
  });
}
