import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../../lib/auth';
import { createServiceSupabaseClient } from '../../../../lib/supabase';

export async function POST(request: Request) {
  const { userId, response } = await getVerifiedUserId(request, 'questions-answer:post');
  if (response) {
    return response;
  }

  const body = await request.json().catch(() => ({}));
  const { questionId, selectedOption, sessionId } = body as { questionId?: string; selectedOption?: string; sessionId?: string };

  if (!questionId || !selectedOption || !sessionId) {
    return NextResponse.json({ error: 'questionId, selectedOption, and sessionId are required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { data: session, error: sessionError } = await supabase
    .from('wp_sessions')
    .select('id,user_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  if (session.user_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const questionResult = await supabase
    .from('wp_questions')
    .select('correct_option,explanation')
    .eq('id', questionId)
    .single();

  if (questionResult.error || !questionResult.data) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const correctOption = questionResult.data.correct_option;
  const explanation = questionResult.data.explanation ?? null;
  const isCorrect = selectedOption === correctOption;

  const { error: insertError } = await supabase.from('wp_attempts').insert({
    user_id: userId,
    question_id: questionId,
    selected_option: selectedOption,
    is_correct: isCorrect,
    session_id: sessionId,
  });

  if (insertError) {
    return NextResponse.json({ error: 'Unable to record attempt' }, { status: 500 });
  }

  return NextResponse.json({
    isCorrect,
    correctOption,
    explanation,
  });
}
