import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';
import { isPremiumYear, PREMIUM_YEAR_START } from '../../../lib/premium';
import { ingestQuestionsForSubject } from '../../../lib/aloc-ingestion';

function isLikelyUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function getVerifiedUserId(request: Request) {
  const authorization = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const isLocalRequest = request.url.includes('localhost') || request.url.includes('127.0.0.1');
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (!match) {
    if (isDevelopment && isLocalRequest) {
      return 'local-dev-user';
    }
    return null;
  }

  const token = match[1];
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    if (isDevelopment && isLocalRequest) {
      return 'local-dev-user';
    }
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    if (isDevelopment && isLocalRequest) {
      return 'local-dev-user';
    }
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
  const yearParam = url.searchParams.get('year');
  const year = yearParam ? Number(yearParam) : null;

  if (!subjectId) {
    return NextResponse.json({ error: 'subjectId is required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  let isPro = false;
  try {
    const { data: subscriptionData, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('status')
      .eq('user_id', userId)
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();

    if (!subscriptionError || subscriptionError.code === 'PGRST116') {
      isPro = Boolean(subscriptionData);
    }
  } catch {
    isPro = false;
  }

  const { data: subjectRow, error: subjectError } = await supabase
    .from('wp_subjects')
    .select('id,name,exam_type')
    .eq('id', subjectId)
    .maybeSingle();

  let resolvedSubjectId = subjectId;
  let resolvedSubjectName = subjectId;
  let resolvedExamType: string | null = null;

  if (subjectRow?.id) {
    resolvedSubjectId = subjectRow.id;
    resolvedSubjectName = subjectRow.name ?? subjectId;
    resolvedExamType = subjectRow.exam_type ?? null;
  } else if (!subjectError) {
    const { data: subjectByName, error: subjectByNameError } = await supabase
      .from('wp_subjects')
      .select('id,name,exam_type')
      .eq('name', subjectId)
      .maybeSingle();

    if (!subjectByNameError && subjectByName?.id) {
      resolvedSubjectId = subjectByName.id;
      resolvedSubjectName = subjectByName.name ?? subjectId;
      resolvedExamType = subjectByName.exam_type ?? null;
    }
  }

  const buildQuery = (resolvedSubject: string) => {
    let query = supabase
      .from('wp_questions')
      .select('id,topic,question_text,options,year')
      .eq('subject_id', resolvedSubject)
      .limit(40);

    if (year !== null && Number.isFinite(year)) {
      query = query.eq('year', year);
    }

    if (!isPro) {
      query = query.or(`year.is.null,year.lt.${PREMIUM_YEAR_START}`);
    }

    return query;
  };

  let { data, error } = { data: null as any, error: null as any };
  let ingestionError: string | null = null;
  let ingestionAttempted = false;

  if (isLikelyUuid(resolvedSubjectId)) {
    ({ data, error } = await buildQuery(resolvedSubjectId));
  }

  if (!error && (!data || !data.length) && resolvedSubjectName) {
    ingestionAttempted = true;
    const ingestionResult = await ingestQuestionsForSubject(resolvedSubjectName, resolvedExamType ?? 'jamb');
    if (ingestionResult.ok) {
      resolvedSubjectId = ingestionResult.subjectId ?? resolvedSubjectId;
      ({ data, error } = await buildQuery(resolvedSubjectId));
    } else {
      ingestionError = ingestionResult.error ?? 'ALOC ingestion failed';
      console.error('[questions-route]', {
        subjectId,
        resolvedSubjectId,
        resolvedSubjectName,
        resolvedExamType,
        ingestionError,
      });
    }
  }

  if (error) {
    return NextResponse.json({
      questions: [],
      isPro,
      premiumYearSelected: Boolean(year && isPremiumYear(year)),
      debug: {
        subjectId,
        resolvedSubjectId,
        resolvedSubjectName,
        resolvedExamType,
        subjectRow: subjectRow ?? null,
        ingestionAttempted,
        ingestionError,
        queryError: error?.message ?? null,
      },
    });
  }

  const questions = (data ?? []).filter((question: { year?: number | null }) => {
    if (!isPremiumYear(question.year)) {
      return true;
    }

    return isPro;
  });

  if (!questions.length) {
    return NextResponse.json({
      questions,
      isPro,
      premiumYearSelected: Boolean(year && isPremiumYear(year)),
      debug: {
        subjectId,
        resolvedSubjectId,
        resolvedSubjectName,
        resolvedExamType,
        subjectRow: subjectRow ?? null,
        ingestionAttempted,
        ingestionError,
      },
    });
  }

  return NextResponse.json({ questions, isPro, premiumYearSelected: Boolean(year && isPremiumYear(year)) });
}
