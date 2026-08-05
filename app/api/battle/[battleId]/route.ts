import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../../lib/auth';
import { createServiceSupabaseClient } from '../../../../lib/supabase';

function shuffleArray<T>(values: T[], salt: string) {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const hash = Array.from(salt + index).reduce((sum, char) => sum + char.charCodeAt(0), 0);
    const swapIndex = hash % (index + 1);
    const temp = shuffled[index];
    shuffled[index] = shuffled[swapIndex];
    shuffled[swapIndex] = temp;
  }

  return shuffled;
}

export async function GET(request: Request, { params }: { params: { battleId: string } }) {
  const { userId, response } = await getVerifiedUserId(request, 'battle:detail');
  if (response) {
    return response;
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { data: battle, error } = await supabase
    .from('wp_battles')
    .select('*')
    .eq('id', params.battleId)
    .maybeSingle();

  if (error || !battle) {
    return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
  }

  if (battle.player_one_id !== userId && battle.player_two_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const questionIds = Array.isArray(battle.question_ids) ? battle.question_ids : [];
  const questionLookup = questionIds.length
    ? await supabase.from('wp_questions').select('id,topic,question_text,options,year').in('id', questionIds)
    : { data: [], error: null };

  if (questionLookup.error) {
    return NextResponse.json({ error: 'Unable to load battle questions' }, { status: 500 });
  }

  const questionMap = new Map<string, any>((questionLookup.data ?? []).map((question: any) => [question.id, question]));
  const questions = questionIds
    .map((id: string) => questionMap.get(id))
    .filter(Boolean)
    .map((question: any) => ({
      ...question,
      options: Array.isArray(question.options) ? shuffleArray(question.options, `${battle.id}:${question.id}`) : [],
    }));

  const { data: answersData } = await supabase
    .from('wp_battle_answers')
    .select('question_id')
    .eq('battle_id', battle.id)
    .eq('user_id', userId);

  const answeredQuestionIds = (answersData ?? []).map((row) => row.question_id);
  const playerOneAnswers = (await supabase.from('wp_battle_answers').select('user_id,question_id,is_correct').eq('battle_id', battle.id).eq('user_id', battle.player_one_id)).data ?? [];
  const playerTwoAnswers = (await supabase.from('wp_battle_answers').select('user_id,question_id,is_correct').eq('battle_id', battle.id).eq('user_id', battle.player_two_id ?? userId)).data ?? [];
  const playerOneScore = playerOneAnswers.filter((row) => row.is_correct).length;
  const playerTwoScore = playerTwoAnswers.filter((row) => row.is_correct).length;

  return NextResponse.json({
    battle: {
      id: battle.id,
      subject_id: battle.subject_id,
      year: battle.year,
      status: battle.status,
      player_one_id: battle.player_one_id,
      player_two_id: battle.player_two_id,
      question_ids: questionIds,
      created_at: battle.created_at,
      started_at: battle.started_at,
      ends_at: battle.ends_at,
      completed_at: battle.completed_at,
      room_code: battle.room_code,
      is_private: battle.is_private,
      time_limit_seconds: battle.time_limit_seconds,
      question_count: battle.question_count,
      player_one_ready: battle.player_one_ready,
      player_two_ready: battle.player_two_ready,
      winner_id: battle.winner_id,
      questions,
      answered_question_ids: answeredQuestionIds,
      player_one_score: playerOneScore,
      player_two_score: playerTwoScore,
      participant_role: battle.player_one_id === userId ? 'player_one' : 'player_two',
      opponent_id: battle.player_one_id === userId ? battle.player_two_id : battle.player_one_id,
    },
  });
}
