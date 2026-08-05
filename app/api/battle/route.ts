import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../lib/auth';
import { createServiceSupabaseClient } from '../../../lib/supabase';

const DEFAULT_QUESTION_COUNT = 10;
const DEFAULT_TIME_LIMIT_SECONDS = 1800;
const VALID_EXAM_TYPES = new Set(['jamb', 'waec', 'neco', 'post-utme']);

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

async function ensureQuestionIds(
  supabase: NonNullable<ReturnType<typeof createServiceSupabaseClient>>,
  subjectId: string,
  year: number | null,
  questionCount: number,
) {
  try {
    let questionQuery = supabase.from('wp_questions').select('id').eq('subject_id', subjectId);
    if (year !== null) {
      questionQuery = questionQuery.eq('year', year);
    }

    const { data: questions, error } = await questionQuery;
    if (error) {
      console.error('[battle-route] Unable to load seeded questions', { subjectId, year, error: error.message });
      return [];
    }

    const shuffledIds = shuffleArray(
      (questions ?? []).map((question) => question.id).filter(Boolean),
      `${subjectId}:${year ?? 'any'}`,
    );

    return shuffledIds.slice(0, Math.max(1, Math.min(questionCount, 100)));
  } catch (error) {
    console.error('[battle-route] Unable to ensure question ids', {
      subjectId,
      error: error instanceof Error ? error.message : 'Unknown question-id error',
    });
    return [];
  }
}

export async function POST(request: Request) {
  const { userId, response } = await getVerifiedUserId(request, 'battle:create');
  if (response) {
    return response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const {
      subjectId,
      year,
      userId: requestedUserId,
      examType,
      questionCount,
      timeLimitSeconds,
      isPrivate,
      roomCode,
    } = body as {
      subjectId?: string;
      year?: string | number;
      userId?: string;
      examType?: string;
      questionCount?: number | string;
      timeLimitSeconds?: number | string;
      isPrivate?: boolean;
      roomCode?: string;
    };

    if (!subjectId) {
      return NextResponse.json({ error: 'subjectId is required' }, { status: 400 });
    }

    const effectiveUserId = requestedUserId ?? userId;
    if (!effectiveUserId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    if (effectiveUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
    }

    const normalizedYear = year === undefined || year === null || year === '' ? null : Number(year);
    const normalizedExamType = typeof examType === 'string' && VALID_EXAM_TYPES.has(examType.trim().toLowerCase())
      ? examType.trim().toLowerCase()
      : 'jamb';
    const parsedQuestionCount = Number(questionCount);
    const normalizedQuestionCount = Number.isFinite(parsedQuestionCount)
      ? Math.max(1, Math.min(100, Math.floor(parsedQuestionCount)))
      : DEFAULT_QUESTION_COUNT;
    const parsedTimeLimit = Number(timeLimitSeconds);
    const normalizedTimeLimitSeconds = Number.isFinite(parsedTimeLimit)
      ? Math.max(60, Math.min(7200, Math.floor(parsedTimeLimit)))
      : DEFAULT_TIME_LIMIT_SECONDS;
    const isPrivateBattle = Boolean(isPrivate);
    const nextRoomCode = isPrivateBattle ? String(roomCode ?? '').trim().toUpperCase() : null;

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    await supabase.from('wp_battles').update({ status: 'cancelled' }).lt('created_at', fiveMinutesAgo).eq('status', 'waiting');

    const { data: subjectRow, error: subjectError } = await supabase
      .from('wp_subjects')
      .select('id,name,exam_type')
      .eq('id', subjectId)
      .maybeSingle();

    if (subjectError || !subjectRow?.id) {
      return NextResponse.json({ error: 'Subject not found' }, { status: 404 });
    }

    if (isPrivateBattle && nextRoomCode) {
      const { data: existingBattle, error: existingError } = await supabase
        .from('wp_battles')
        .select('id')
        .eq('status', 'waiting')
        .eq('is_private', true)
        .eq('room_code', nextRoomCode)
        .maybeSingle();

      if (existingError) {
        return NextResponse.json({ error: 'Unable to validate private room code' }, { status: 500 });
      }

      if (existingBattle) {
        return NextResponse.json({ error: 'Room code already in use; choose another code' }, { status: 409 });
      }
    }

    let matchingBattleQuery = supabase
      .from('wp_battles')
      .select('*')
      .eq('status', 'waiting')
      .eq('subject_id', subjectRow.id)
      .eq('is_private', false);

    if (Number.isFinite(normalizedYear)) {
      matchingBattleQuery = matchingBattleQuery.eq('year', normalizedYear);
    }

    const { data: waitingBattles, error: waitingBattleError } = await matchingBattleQuery.order('created_at', { ascending: true }).limit(1);
    const matchingBattle = waitingBattles?.[0];

    if (!waitingBattleError && matchingBattle && matchingBattle.player_one_id !== effectiveUserId) {
      const { data: joinedBattle, error: joinError } = await supabase
        .from('wp_battles')
        .update({
          player_two_id: effectiveUserId,
          status: 'waiting',
          player_two_ready: false,
          started_at: null,
          ends_at: null,
        })
        .eq('id', matchingBattle.id)
        .select('*')
        .single();

      if (joinError || !joinedBattle) {
        return NextResponse.json({ error: 'Unable to join battle lobby' }, { status: 500 });
      }

      return NextResponse.json({ battle: joinedBattle, joined: true, status: 'waiting' });
    }

    const questionIds = await ensureQuestionIds(
      supabase,
      subjectRow.id,
      Number.isFinite(normalizedYear) ? normalizedYear : null,
      normalizedQuestionCount,
    );

    if (!questionIds.length) {
      return NextResponse.json({ error: 'Not enough questions available for this subject yet.' }, { status: 409 });
    }

    const { data: createdBattle, error: createError } = await supabase
      .from('wp_battles')
      .insert({
        subject_id: subjectRow.id,
        year: Number.isFinite(normalizedYear) ? normalizedYear : null,
        status: 'waiting',
        player_one_id: effectiveUserId,
        question_ids: questionIds,
        room_code: isPrivateBattle ? (nextRoomCode || null) : null,
        is_private: isPrivateBattle,
        time_limit_seconds: normalizedTimeLimitSeconds,
        question_count: normalizedQuestionCount,
      })
      .select('*')
      .single();

    if (createError || !createdBattle) {
      return NextResponse.json({ error: 'Unable to create battle lobby' }, { status: 500 });
    }

    return NextResponse.json({ battle: createdBattle, joined: false, status: 'waiting' });
  } catch (error) {
    console.error('[battle]', error);
    return NextResponse.json({ error: 'Unable to create battle lobby' }, { status: 500 });
  }
}
