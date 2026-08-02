import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';

export async function GET(request: Request) {
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
    .select('id,topic,question_text,options,correct_option,explanation')
    .eq('subject_id', subjectId)
    .limit(40);

  if (error) {
    return NextResponse.json({ error: 'Unable to load questions for this subject' }, { status: 500 });
  }

  return NextResponse.json({ questions: data ?? [] });
}
