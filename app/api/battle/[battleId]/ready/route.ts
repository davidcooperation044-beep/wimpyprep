import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../../../lib/auth';
import { createServiceSupabaseClient } from '../../../../../lib/supabase';

export async function POST(request: Request, { params }: { params: { battleId: string } }) {
  const { userId, response } = await getVerifiedUserId(request, 'battle:ready');
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

  const readyField = battle.player_one_id === userId ? 'player_one_ready' : 'player_two_ready';
  const updateValues = { [readyField]: true } as Record<string, boolean>;

  const { data: updatedBattle, error: updateError } = await supabase
    .from('wp_battles')
    .update(updateValues)
    .eq('id', battle.id)
    .select('*')
    .single();

  if (updateError || !updatedBattle) {
    return NextResponse.json({ error: 'Unable to mark ready' }, { status: 500 });
  }

  const bothReady = Boolean(updatedBattle.player_one_ready && updatedBattle.player_two_ready);
  if (bothReady) {
    const startedAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + (updatedBattle.time_limit_seconds ?? 1800) * 1000).toISOString();
    const { data: startedBattle, error: startError } = await supabase
      .from('wp_battles')
      .update({ status: 'active', started_at: startedAt, ends_at: endsAt })
      .eq('id', battle.id)
      .select('*')
      .single();

    if (startError || !startedBattle) {
      return NextResponse.json({ error: 'Unable to start the match' }, { status: 500 });
    }

    return NextResponse.json({ battle: startedBattle, started: true });
  }

  return NextResponse.json({ battle: updatedBattle, started: false });
}
