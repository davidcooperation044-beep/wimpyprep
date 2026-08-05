import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../../../lib/auth';
import { createServiceSupabaseClient } from '../../../../../lib/supabase';

function parseTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export async function POST(request: Request, { params }: { params: { battleId: string } }) {
  const { userId, response } = await getVerifiedUserId(request, 'battle:complete');
  if (response) {
    return response;
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { data: battle, error: battleError } = await supabase.from('wp_battles').select('*').eq('id', params.battleId).maybeSingle();
  if (battleError || !battle) {
    return NextResponse.json({ error: 'Battle not found' }, { status: 404 });
  }

  if (battle.player_one_id !== userId && battle.player_two_id !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data: answers, error: answersError } = await supabase
    .from('wp_battle_answers')
    .select('user_id,is_correct,answered_at')
    .eq('battle_id', battle.id);

  if (answersError) {
    return NextResponse.json({ error: 'Unable to load battle results' }, { status: 500 });
  }

  const playerOneAnswers = answers.filter((row) => row.user_id === battle.player_one_id);
  const playerTwoAnswers = answers.filter((row) => row.user_id === battle.player_two_id);
  const playerOneScore = playerOneAnswers.filter((row) => row.is_correct).length;
  const playerTwoScore = playerTwoAnswers.filter((row) => row.is_correct).length;

  const playerOneFinish = playerOneAnswers
    .map((row) => parseTimestamp(row.answered_at))
    .filter((value) => value !== null) as number[];
  const playerTwoFinish = playerTwoAnswers
    .map((row) => parseTimestamp(row.answered_at))
    .filter((value) => value !== null) as number[];

  const playerOneLast = playerOneFinish.length ? Math.max(...playerOneFinish) : null;
  const playerTwoLast = playerTwoFinish.length ? Math.max(...playerTwoFinish) : null;

  let winnerId: string | null = null;
  if (playerOneScore > playerTwoScore) {
    winnerId = battle.player_one_id;
  } else if (playerTwoScore > playerOneScore) {
    winnerId = battle.player_two_id;
  } else if (playerOneLast !== null && playerTwoLast !== null) {
    if (playerOneLast < playerTwoLast) {
      winnerId = battle.player_one_id;
    } else if (playerTwoLast < playerOneLast) {
      winnerId = battle.player_two_id;
    }
  }

  const completedAt = new Date().toISOString();
  const { data: completedBattle, error: updateError } = await supabase
    .from('wp_battles')
    .update({
      status: 'completed',
      completed_at: completedAt,
      winner_id: winnerId,
    })
    .eq('id', battle.id)
    .select('*')
    .single();

  if (updateError || !completedBattle) {
    return NextResponse.json({ error: 'Unable to complete the battle' }, { status: 500 });
  }

  return NextResponse.json({ battle: completedBattle, winnerId, playerOneScore, playerTwoScore });
}
