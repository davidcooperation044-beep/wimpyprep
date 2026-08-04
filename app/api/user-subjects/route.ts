import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';

async function getVerifiedUserId(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1];
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

export async function GET(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('wp_user_subjects')
    .select('subject_id,exam_type,wp_subjects(name)')
    .eq('user_id', userId);
  if (error) {
    return NextResponse.json({ error: 'Unable to load your subject selection' }, { status: 500 });
  }

  const selections = (data ?? []).map((row: any) => ({
    subject_id: row.subject_id,
    exam_type: row.exam_type,
    name: row.wp_subjects?.name ?? null,
  }));

  return NextResponse.json({ selections });
}

export async function POST(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const body = await request.json().catch(() => ({}));
  const selections = Array.isArray(body?.selections) ? body.selections : [];

  if (!selections.length) {
    return NextResponse.json({ error: 'Please pick at least one subject.' }, { status: 400 });
  }

  await supabase.from('wp_user_subjects').delete().eq('user_id', userId);

  const { error } = await supabase.from('wp_user_subjects').insert(
    selections.map((selection: { subject_id: string; exam_type: string }) => ({
      user_id: userId,
      subject_id: selection.subject_id,
      exam_type: selection.exam_type,
    }))
  );

  if (error) {
    return NextResponse.json({ error: 'Unable to save your subject selection' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
