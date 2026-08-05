import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../../lib/auth';
import { createServiceSupabaseClient } from '../../../../lib/supabase';

export async function POST(request: Request) {
  const { userId, response } = await getVerifiedUserId(request, 'battle:join');
  if (response) {
    return response;
  }

  const body = await request.json().catch(() => ({}));
  const { roomCode, userId: requestedUserId } = body as {
    roomCode?: string;
    userId?: string;
  };

  if (!roomCode) {
    return NextResponse.json({ error: 'roomCode is required to join a private battle' }, { status: 400 });
  }

  const effectiveUserId = requestedUserId ?? userId;
  if (!effectiveUserId) {
    return NextResponse.json({ error: 'userId is required' }, { status: 400 });
  }

  if (effectiveUserId !== userId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const normalizedRoomCode = String(roomCode).trim().toUpperCase();
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { data: privateBattle, error: privateBattleError } = await supabase
    .from('wp_battles')
    .select('*')
    .eq('status', 'waiting')
    .eq('is_private', true)
    .eq('room_code', normalizedRoomCode)
    .maybeSingle();

  if (privateBattleError) {
    return NextResponse.json({ error: 'Unable to look up private battle' }, { status: 500 });
  }

  if (!privateBattle) {
    return NextResponse.json({ error: 'Private room not found' }, { status: 404 });
  }

  if (privateBattle.player_two_id && privateBattle.player_two_id !== effectiveUserId) {
    return NextResponse.json({ error: 'Private room is already full' }, { status: 409 });
  }

  if (privateBattle.player_one_id === effectiveUserId) {
    return NextResponse.json({ battle: privateBattle, joined: false, status: 'waiting' });
  }

  const { data: joinedBattle, error: joinError } = await supabase
    .from('wp_battles')
    .update({
      player_two_id: effectiveUserId,
      status: 'waiting',
      player_two_ready: false,
      started_at: null,
      ends_at: null,
    })
    .eq('id', privateBattle.id)
    .select('*')
    .single();

  if (joinError || !joinedBattle) {
    return NextResponse.json({ error: 'Unable to join battle lobby' }, { status: 500 });
  }

  return NextResponse.json({ battle: joinedBattle, joined: true, status: 'waiting' });
}
