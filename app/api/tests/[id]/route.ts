import { getTestSession } from '@/lib/testSessions';

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const session = await getTestSession(params.id);
  if (!session) {
    return Response.json({ error: 'Test session not found' }, { status: 404 });
  }
  return Response.json(session);
}
