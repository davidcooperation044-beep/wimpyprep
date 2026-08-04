import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../lib/auth';
import { createServiceSupabaseClient } from '../../../lib/supabase';

export async function GET(request: Request) {
  const { userId, response } = await getVerifiedUserId(request, 'dashboard:get');
  if (response) {
    return response;
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const [sessionsResult, incompleteResult, attemptsResult, userSubjectsResult] = await Promise.all([
    supabase
      .from('wp_sessions')
      .select('id,mode,score,total_questions,started_at,completed_at')
      .eq('user_id', userId)
      .not('completed_at', 'is', null),
    supabase
      .from('wp_sessions')
      .select('id,mode,subject_ids,started_at')
      .eq('user_id', userId)
      .is('completed_at', null)
      .order('started_at', { ascending: false })
      .limit(1),
    supabase
      .from('wp_attempts')
      .select('question_id,is_correct')
      .eq('user_id', userId),
    supabase
      .from('wp_user_subjects')
      .select('subject_id')
      .eq('user_id', userId),
  ]);

  if (sessionsResult.error || incompleteResult.error || attemptsResult.error || userSubjectsResult.error) {
    return NextResponse.json({ error: 'Unable to load dashboard metrics' }, { status: 500 });
  }

  const completedSessions = sessionsResult.data ?? [];
  const incompleteSession = (incompleteResult.data ?? [])[0] ?? null;
  const attempts = attemptsResult.data ?? [];
  const selectedSubjectIds = Array.from(new Set((userSubjectsResult.data ?? []).map((item) => item.subject_id))).filter(Boolean);

  const scoreTrends = completedSessions
    .map((session) => ({
      id: session.id,
      mode: session.mode,
      score: Number(session.score ?? 0),
      total_questions: session.total_questions ?? 0,
      percentage: session.total_questions ? (Number(session.score ?? 0) / session.total_questions) * 100 : 0,
      label: session.completed_at ? new Date(session.completed_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'In progress',
      timestamp: new Date(session.completed_at ?? session.started_at).getTime(),
    }))
    .sort((a, b) => a.timestamp - b.timestamp);

  const allSessions = await supabase
    .from('wp_sessions')
    .select('user_id,score')
    .not('completed_at', 'is', null);

  if (allSessions.error) {
    return NextResponse.json({ error: 'Unable to load score percentiles' }, { status: 500 });
  }

  const averageByUser = new Map<string, { total: number; count: number }>();
  (allSessions.data ?? []).forEach((session) => {
    const existing = averageByUser.get(session.user_id) ?? { total: 0, count: 0 };
    existing.total += Number(session.score ?? 0);
    existing.count += 1;
    averageByUser.set(session.user_id, existing);
  });

  const userAverage = (() => {
    const stats = averageByUser.get(userId);
    if (!stats || stats.count === 0) return 0;
    return stats.total / stats.count;
  })();

  const averages = Array.from(averageByUser.values()).map((stats) => stats.total / stats.count);
  const ranked = averages.filter((avg) => avg <= userAverage).length;
  const percentileRank = averages.length ? Math.round((ranked / averages.length) * 100) : 0;

  const questionIds = Array.from(new Set(attempts.map((attempt) => attempt.question_id))).filter(Boolean);
  const questions = questionIds.length
    ? await supabase.from('wp_questions').select('id,subject_id').in('id', questionIds)
    : { data: [], error: null };

  if (questions.error) {
    return NextResponse.json({ error: 'Unable to load question subjects' }, { status: 500 });
  }

  const subjectIds = Array.from(new Set((questions.data ?? []).map((question) => question.subject_id))).filter(Boolean);
  const subjects = subjectIds.length
    ? await supabase.from('wp_subjects').select('id,name').in('id', subjectIds)
    : { data: [], error: null };

  if (subjects.error) {
    return NextResponse.json({ error: 'Unable to load subject names' }, { status: 500 });
  }

  const subjectNameMap = new Map((subjects.data ?? []).map((subject) => [subject.id, subject.name]));
  const subjectStats = new Map<string, { subjectId: string; subjectName: string; total: number; correct: number }>();

  attempts.forEach((attempt) => {
    const question = (questions.data ?? []).find((item) => item.id === attempt.question_id);
    const subjectId = question?.subject_id;
    if (!subjectId) return;

    const existing = subjectStats.get(subjectId) ?? {
      subjectId,
      subjectName: subjectNameMap.get(subjectId) ?? 'Unknown',
      total: 0,
      correct: 0,
    };
    existing.total += 1;
    if (attempt.is_correct) {
      existing.correct += 1;
    }
    subjectStats.set(subjectId, existing);
  });

  const accuracyBySubject = Array.from(subjectStats.values())
    .map((subject) => ({
      ...subject,
      accuracy: subject.total ? (subject.correct / subject.total) * 100 : 0,
    }))
    .sort((a, b) => {
      const aPreferred = selectedSubjectIds.includes(a.subjectId) ? 1 : 0;
      const bPreferred = selectedSubjectIds.includes(b.subjectId) ? 1 : 0;
      if (aPreferred !== bPreferred) {
        return bPreferred - aPreferred;
      }
      return b.accuracy - a.accuracy;
    });

  return NextResponse.json({
    scoreTrends,
    accuracyBySubject,
    percentileRank,
    incompleteSession,
    subjectSelectionCount: selectedSubjectIds.length,
  });
}
