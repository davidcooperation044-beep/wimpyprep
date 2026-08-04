import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/supabase';

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

  const url = new URL(request.url);
  const subjectId = url.searchParams.get('subjectId');
  if (!subjectId) {
    return NextResponse.json({ error: 'subjectId is required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { data, error } = await supabase
    .from('wp_questions')
    .select('year')
    .eq('subject_id', subjectId)
    .not('year', 'is', null)
    .order('year', { ascending: true });

  if (error) {
    return NextResponse.json({ error: 'Unable to load years for this subject' }, { status: 500 });
  }

  const years = Array.from(new Set((data ?? []).map((row) => Number(row.year)).filter((value) => Number.isFinite(value))));
  return NextResponse.json({ years });
}
