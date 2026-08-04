import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { subjectId, year, userId } = body as { subjectId?: string; year?: string; userId?: string };

    if (!subjectId || !userId) {
      return NextResponse.json({ error: 'subjectId and userId are required' }, { status: 400 });
    }

    const lobbyId = `lobby-${userId.slice(0, 8)}-${Date.now().toString(36)}`;
    return NextResponse.json({ lobbyId, subjectId, year: year ?? null });
  } catch (error) {
    console.error('[battle]', error);
    return NextResponse.json({ error: 'Unable to create battle lobby' }, { status: 500 });
  }
}
