import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../../../lib/auth';
import { createServiceSupabaseClient } from '../../../../../lib/supabase';

export async function POST(request: Request, { params }: { params: { battleId: string } }) {
  const { userId, response } = await getVerifiedUserId(request, 'battle:answer');
  if (response) {
    return response;
  }

  const body = await request.json().catch(() => ({}));
  const { questionId, selectedOption } = body as { questionId?: string; selectedOption?: string };
  if (!questionId || !selectedOption) {
    return NextResponse.json({ error: 'questionId and selectedOption are required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { data: battle, error: battleError } = await supabase.from('wp_battles').select('*').eq('id', params.battleId).maybeSingle();
  if (battleError || !battle) {
    return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
  }

  if (battle.status !== 'active') {
    return NextResponse.json({ error: 'Battle is not active yet' }, { status: 409 });
  }

  if (battle.player_one_id !== userId && battle.player_two_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: question, error: questionError } = await supabase.from('wp_questions').select('correct_option').eq('id', questionId).maybeSingle();
  if (questionError || !question) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const { error: insertError } = await supabase.from('wp_battle_answers').upsert({
    battle_id: battle.id,
    user_id: userId,
    question_id: questionId,
    selected_option: selectedOption,
    is_correct: selectedOption === question.correct_option,
    answered_at: new Date().toISOString(),
  }, { onConflict: 'battle_id,user_id,question_id' });

  if (insertError) {
    return NextResponse.json({ error: 'Unable to record the answer' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
