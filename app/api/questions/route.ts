import { NextResponse } from 'next/server';
import { createPublicSupabaseClient, createServiceSupabaseClient } from '../../../lib/supabase';
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
  const supabase = createServiceSupabaseClient() ?? createPublicSupabaseClient();
  if (!supabase) {
    if (isDevelopment && isLocalRequest) {
      return 'local-dev-user';
    }
    return null;
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      if (isDevelopment && isLocalRequest) {
        return 'local-dev-user';
      }
      return null;
    }

    return data.user.id;
  } catch {
    if (isDevelopment && isLocalRequest) {
      return 'local-dev-user';
    }
    return null;
  }
}

export async function GET(request: Request) {
  try {
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

    const supabase = createServiceSupabaseClient() ?? createPublicSupabaseClient();
    if (!supabase) {
      return NextResponse.json({
        questions: [],
        isPro: false,
        premiumYearSelected: Boolean(year && isPremiumYear(year)),
        debug: {
          subjectId,
          error: 'Supabase client is not configured',
        },
      });
    }

    let isPro = false;
    let subjectRow: { id?: string; name?: string | null; exam_type?: string | null } | null = null;
    let subjectError: { message?: string } | null = null;
    type SubjectLookupRow = { id?: string; name?: string | null; exam_type?: string | null };
    let resolvedSubjectId = subjectId;
    let resolvedSubjectName = subjectId;
    let resolvedExamType: string | null = null;
    let questionsData: Array<{ id: string; topic?: string | null; question_text?: string; options?: unknown; year?: number | null }> | null = null;
    type QuestionRow = { id: string; topic?: string | null; question_text?: string; options?: unknown; year?: number | null };
    let error: { message?: string } | null = null;
    let ingestionError: string | null = null;
    let ingestionAttempted = false;

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

    try {
      const subjectResponse = await supabase
        .from('wp_subjects')
        .select('id,name,exam_type')
        .eq('id', subjectId)
        .maybeSingle();

      subjectRow = (subjectResponse.data as SubjectLookupRow | null) ?? null;
      subjectError = subjectResponse.error as typeof subjectError;

      if (subjectRow?.id) {
        resolvedSubjectId = subjectRow.id;
        resolvedSubjectName = subjectRow.name ?? subjectId;
        resolvedExamType = subjectRow.exam_type ?? null;
      } else if (!subjectError) {
        const subjectByNameResponse = await supabase
          .from('wp_subjects')
          .select('id,name,exam_type')
          .eq('name', subjectId)
          .maybeSingle();

        const subjectByName = (subjectByNameResponse.data as SubjectLookupRow | null) ?? null;
        const subjectByNameError = subjectByNameResponse.error as typeof subjectError;

        if (!subjectByNameError && subjectByName?.id) {
          resolvedSubjectId = subjectByName.id;
          resolvedSubjectName = subjectByName.name ?? subjectId;
          resolvedExamType = subjectByName.exam_type ?? null;
        }
      }
    } catch (subjectLookupError) {
      subjectError = { message: subjectLookupError instanceof Error ? subjectLookupError.message : 'Unknown subject lookup error' };
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

    try {
      if (isLikelyUuid(resolvedSubjectId)) {
        const queryResult = await buildQuery(resolvedSubjectId);
        questionsData = (queryResult.data as Array<QuestionRow> | null) ?? null;
        error = queryResult.error as typeof error;
      }

      const hasQuestionRows = Array.isArray(questionsData) && (questionsData as Array<QuestionRow>).length > 0;
      if (!error && !hasQuestionRows && resolvedSubjectName) {
        ingestionAttempted = true;
        const ingestionResult = await ingestQuestionsForSubject(resolvedSubjectName, resolvedExamType ?? 'jamb');
        if (ingestionResult.ok) {
          resolvedSubjectId = ingestionResult.subjectId ?? resolvedSubjectId;
          const refreshResult = await buildQuery(resolvedSubjectId);
          questionsData = (refreshResult.data as Array<QuestionRow> | null) ?? null;
          error = refreshResult.error as typeof error;
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
    } catch (queryError) {
      error = { message: queryError instanceof Error ? queryError.message : 'Unknown query error' };
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
          queryError: error.message ?? null,
        },
      });
    }

    const questions = (questionsData ?? []).filter((question: { year?: number | null }) => {
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
          subjectError: subjectError?.message ?? null,
        },
      });
    }

    return NextResponse.json({ questions, isPro, premiumYearSelected: Boolean(year && isPremiumYear(year)) });
  } catch (error) {
    console.error('[questions-route] Unhandled error', error);
    const subjectId = new URL(request.url).searchParams.get('subjectId');
    return NextResponse.json(
      {
        questions: [],
        isPro: false,
        premiumYearSelected: false,
        debug: {
          subjectId,
          error: error instanceof Error ? error.message : 'Unexpected server error while loading questions.',
        },
      },
      { status: 500 },
    );
  }
}
