import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../lib/auth';
import { ingestQuestionsForSubject } from '../../../lib/aloc-ingestion';
import { createServiceSupabaseClient } from '../../../lib/supabase';

async function ensureQuestionIds(supabase: NonNullable<ReturnType<typeof createServiceSupabaseClient>>, subjectId: string, year: number | null) {
  const fallbackQuery = supabase
    .from('wp_questions')
    .select('id')
    .eq('subject_id', subjectId)
    .limit(24);

  let questionQuery = fallbackQuery;
  if (year !== null) {
    questionQuery = supabase.from('wp_questions').select('id').eq('subject_id', subjectId).eq('year', year).limit(24);
  }

  const { data: directQuestions, error: directError } = await questionQuery;
  if (!directError && (directQuestions?.length ?? 0) > 0) {
    return (directQuestions ?? []).map((question) => question.id).slice(0, 10);
  }

  if (year !== null) {
    const { data: fallbackQuestions, error: fallbackError } = await fallbackQuery;
    if (!fallbackError && (fallbackQuestions?.length ?? 0) > 0) {
      return (fallbackQuestions ?? []).map((question) => question.id).slice(0, 10);
    }
  }

  const subjectResponse = await supabase.from('wp_subjects').select('name,exam_type').eq('id', subjectId).maybeSingle();
  if (!subjectResponse.error && subjectResponse.data?.name) {
    const ingestionResult = await ingestQuestionsForSubject(subjectResponse.data.name, subjectResponse.data.exam_type ?? 'jamb');
    if (ingestionResult.ok) {
      const { data: reloadedQuestions, error: reloadError } = await supabase.from('wp_questions').select('id').eq('subject_id', subjectId).limit(24);
      if (!reloadError && (reloadedQuestions?.length ?? 0) > 0) {
        return (reloadedQuestions ?? []).map((question) => question.id).slice(0, 10);
      }
    } else {
      console.error('[battle-route]', {
        subjectId,
        subjectName: subjectResponse.data.name,
        ingestionError: ingestionResult.error,
      });
    }
  }

  return [];
}

export async function POST(request: Request) {
  const { userId, response } = await getVerifiedUserId(request, 'battle:create');
  if (response) {
    return response;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { subjectId, year, userId: requestedUserId } = body as { subjectId?: string; year?: string | number; userId?: string };

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

    const matchingBattleQuery = supabase
      .from('wp_battles')
      .select('*')
      .eq('status', 'waiting')
      .eq('subject_id', subjectRow.id)
      .order('created_at', { ascending: true })
      .limit(1);

    const finalBattleQuery = Number.isFinite(normalizedYear) ? matchingBattleQuery.eq('year', normalizedYear) : matchingBattleQuery;
    const { data: waitingBattle, error: waitingBattleError } = await finalBattleQuery;

    if (!waitingBattleError && waitingBattle?.[0] && waitingBattle[0].player_one_id !== effectiveUserId) {
      const { data: joinedBattle, error: joinError } = await supabase
        .from('wp_battles')
        .update({
          player_two_id: effectiveUserId,
          status: 'active',
          started_at: new Date().toISOString(),
        })
        .eq('id', waitingBattle[0].id)
        .select('*')
        .single();

      if (joinError || !joinedBattle) {
        return NextResponse.json({ error: 'Unable to join battle lobby' }, { status: 500 });
      }

      return NextResponse.json({ battle: joinedBattle, joined: true, status: 'active' });
    }

    const questionIds = await ensureQuestionIds(supabase, subjectRow.id, Number.isFinite(normalizedYear) ? normalizedYear : null);
    const { data: createdBattle, error: createError } = await supabase
      .from('wp_battles')
      .insert({
        subject_id: subjectRow.id,
        year: Number.isFinite(normalizedYear) ? normalizedYear : null,
        status: 'waiting',
        player_one_id: effectiveUserId,
        question_ids: questionIds,
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
