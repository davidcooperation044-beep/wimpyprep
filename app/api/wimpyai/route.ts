import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';

const WIMPYAI_API_URL = process.env.WIMPYAI_API_URL ?? 'https://wimpyai.onrender.com/api/chat';
const WIMPYAI_MODEL = process.env.WIMPYAI_MODEL ?? 'gpt-4.1-mini';

function buildPrompt({ session, topicSummary, missedQuestions, questionForExplanation }: {
  session: { id: string; mode: string; score: number; total_questions: number; subject_ids: string[]; completed_at: string | null };
  topicSummary: string;
  missedQuestions: string;
  questionForExplanation?: { question_text: string; selected_option: string; correct_option: string; topic: string };
}) {
  const lines = [
    'You are WimpyAI, a friendly exam prep coach for Nigerian secondary school students preparing for JAMB/WAEC.',
    `The student completed a ${session.mode.replace('_', ' ')} session with a score of ${session.score}/${session.total_questions}.`,
    'Analyze the session performance and recommend the weakest topics for focused review.',
    'Use clear, simple language and avoid unnecessary jargon.',
    '',
    'Topic accuracy summary:',
    topicSummary,
    '',
    'Missed questions summary:',
    missedQuestions || 'None',
    '',
    'Return a brief recommendation message that includes the best 3 topics to focus on next and the reason why those topics are weak.',
  ];

  if (questionForExplanation) {
    lines.push('Also provide a plain-language explanation for the specific missed question below:');
    lines.push(`Question: ${questionForExplanation.question_text}`);
    lines.push(`Selected answer: ${questionForExplanation.selected_option}`);
    lines.push(`Correct answer: ${questionForExplanation.correct_option}`);
    lines.push(`Topic: ${questionForExplanation.topic}`);
  }

  lines.push('', 'Return only the assistant response text.');
  return lines.join('\n');
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const { sessionId, questionId } = body as { sessionId?: string; questionId?: string };

  if (!sessionId || typeof sessionId !== 'string') {
    return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { data: session, error: sessionError } = await supabase
    .from('wp_sessions')
    .select('id,mode,score,total_questions,subject_ids,completed_at,user_id')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 });
  }

  const { data: subscription, error: subscriptionError } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', session.user_id)
    .in('status', ['active', 'trialing'])
    .limit(1)
    .single();

  if (subscriptionError) {
    return NextResponse.json({ error: 'Unable to verify subscription status' }, { status: 500 });
  }

  if (!subscription) {
    return NextResponse.json({
      focusList: [],
      message: 'WimpyPrep Pro is required for AI weak-area recommendations. Upgrade from the in-app Pro panel to continue.',
    }, { status: 402 });
  }

  const { data: attempts, error: attemptsError } = await supabase
    .from('wp_attempts')
    .select('id,question_id,selected_option,is_correct')
    .eq('session_id', sessionId);

  if (attemptsError || !attempts) {
    return NextResponse.json({ error: 'Unable to load attempts for session' }, { status: 500 });
  }

  if (attempts.length === 0) {
    return NextResponse.json({ error: 'No attempts found for this session' }, { status: 404 });
  }

  const questionIds = Array.from(new Set(attempts.map((attempt) => attempt.question_id)));
  const { data: questions, error: questionError } = await supabase
    .from('wp_questions')
    .select('id,topic,question_text,correct_option')
    .in('id', questionIds);

  if (questionError || !questions) {
    return NextResponse.json({ error: 'Unable to load questions for attempts' }, { status: 500 });
  }

  const topics = new Map<string, { correct: number; total: number; missed: Array<{ question_text: string; selected_option: string; correct_option: string; topic: string }> }>();
  let questionForExplanation;

  for (const attempt of attempts) {
    const question = questions.find((questionRow) => questionRow.id === attempt.question_id);
    if (!question) continue;

    const topic = question.topic ?? 'General';
    const existing = topics.get(topic) ?? { correct: 0, total: 0, missed: [] };
    existing.total += 1;
    if (attempt.is_correct) {
      existing.correct += 1;
    } else {
      existing.missed.push({
        question_text: question.question_text,
        selected_option: attempt.selected_option,
        correct_option: question.correct_option,
        topic,
      });
    }
    topics.set(topic, existing);

    if (questionId && attempt.question_id === questionId && !attempt.is_correct) {
      questionForExplanation = {
        question_text: question.question_text,
        selected_option: attempt.selected_option,
        correct_option: question.correct_option,
        topic,
      };
    }
  }

  const topicArray = Array.from(topics.entries())
    .map(([topic, stats]) => ({ topic, correct: stats.correct, total: stats.total, accuracy: stats.total ? stats.correct / stats.total : 0, missed: stats.missed }))
    .sort((a, b) => a.accuracy - b.accuracy);

  const focusList = topicArray.slice(0, 3).map((item) => item.topic);
  const topicSummary = topicArray.map((item) => `- ${item.topic}: ${item.correct}/${item.total} correct`).join('\n');
  const missedQuestions = topicArray
    .flatMap((item) => item.missed.map((missed) => `Topic: ${missed.topic}; Question: ${missed.question_text}; selected ${missed.selected_option}; correct ${missed.correct_option}`))
    .join('\n');

  const prompt = buildPrompt({ session, topicSummary, missedQuestions, questionForExplanation });
  const chatResponse = await fetch(WIMPYAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: WIMPYAI_MODEL,
      max_tokens: 512,
      temperature: 0.7,
      messages: [
        { role: 'system', content: 'You are WimpyAI, a friendly AI tutor that helps students improve weak topics in exam prep.' },
        { role: 'user', content: prompt },
      ],
    }),
  });

  const raw = await chatResponse.text();
  if (!chatResponse.ok) {
    return NextResponse.json({
      focusList,
      message: 'WimpyAI could not generate recommendations at this time.',
      details: raw,
    }, { status: 502 });
  }

  let assistantText = raw;
  try {
    const parsed = JSON.parse(raw);
    assistantText = parsed?.choices?.[0]?.message?.content ?? raw;
  } catch {
    if (raw) {
      assistantText = raw;
    }
  }

  return NextResponse.json({
    focusList,
    message: assistantText,
  });
}
