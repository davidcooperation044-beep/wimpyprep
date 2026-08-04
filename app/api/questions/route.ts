import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';
import { isPremiumYear, PREMIUM_YEAR_START } from '../../../lib/premium';

async function getVerifiedUserId(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1];
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
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

  const { data: subscriptionData, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  if (subscriptionError && subscriptionError.code !== 'PGRST116') {
    return NextResponse.json({ error: 'Unable to verify subscription access' }, { status: 500 });
  }

  const isPro = Boolean(subscriptionData);

  const { data: subjectRow, error: subjectError } = await supabase
    .from('wp_subjects')
    .select('id,name')
    .eq('id', subjectId)
    .maybeSingle();

  let query = supabase
    .from('wp_questions')
    .select('id,topic,question_text,options,year')
    .eq('subject_id', subjectId)
    .limit(40);

  if (!subjectRow && !subjectError) {
    const { data: subjectByName, error: subjectByNameError } = await supabase
      .from('wp_subjects')
      .select('id,name')
      .eq('name', subjectId)
      .maybeSingle();

    if (!subjectByNameError && subjectByName?.id) {
      query = supabase
        .from('wp_questions')
        .select('id,topic,question_text,options,year')
        .eq('subject_id', subjectByName.id)
        .limit(40);
    }
  }

  if (year !== null && Number.isFinite(year)) {
    query = query.eq('year', year);
  }

  if (!isPro) {
    query = query.or(`year.is.null,year.lt.${PREMIUM_YEAR_START}`);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: 'Unable to load questions for this subject' }, { status: 500 });
  }

  const questions = (data ?? []).filter((question) => {
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
        subjectRow: subjectRow ?? null,
      },
    });
  }

  return NextResponse.json({ questions, isPro, premiumYearSelected: Boolean(year && isPremiumYear(year)) });
}
