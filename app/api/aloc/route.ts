import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';

type ALOCQuestion = {
  subject?: string;
  topic?: string;
  year?: number;
  question?: string;
  options?: Array<{ label?: string; text?: string }> | Record<string, string>;
  answer?: string;
  correct_option?: string;
  explanation?: string;
};

function normalizeOptions(payload: ALOCQuestion['options']) {
  if (Array.isArray(payload)) {
    return payload.map((option) => ({
      label: option.label ?? '',
      text: option.text ?? '',
    }));
  }

  if (payload && typeof payload === 'object') {
    return Object.entries(payload).map(([label, text]) => ({ label, text }));
  }

  return [];
}

function normalizeQuestion(record: ALOCQuestion, subjectId: string) {
  const normalizedOptions = normalizeOptions(record.options);
  const answerLabel = record.correct_option || record.answer || '';
  const correctOption = normalizedOptions.find((option) => option.label === answerLabel)?.label || answerLabel;

  return {
    subject_id: subjectId,
    topic: record.topic || 'General',
    year: record.year || 2020,
    question_text: record.question || '',
    options: normalizedOptions,
    correct_option: correctOption,
    explanation: record.explanation || null,
    difficulty: 2,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const subject = searchParams.get('subject') || 'English';
  const examType = searchParams.get('exam_type') || 'jamb';
  const token = process.env.ALOC_ACCESS_TOKEN;
  const serviceSupabase = createServiceSupabaseClient();

  if (!token || !serviceSupabase) {
    return NextResponse.json({ error: 'ALOC access token or Supabase service role is not configured.' }, { status: 500 });
  }

  const subjectResponse = await serviceSupabase.from('wp_subjects').select('id,name').eq('name', subject).maybeSingle();
  if (subjectResponse.error) {
    return NextResponse.json({ error: subjectResponse.error.message }, { status: 500 });
  }

  const subjectId = subjectResponse.data?.id;
  if (!subjectId) {
    return NextResponse.json({ error: `Subject ${subject} was not found in wp_subjects.` }, { status: 404 });
  }

  const alocResponse = await fetch(`https://questions.aloc.com.ng/api/questions?subject=${encodeURIComponent(subject)}&exam_type=${encodeURIComponent(examType)}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!alocResponse.ok) {
    return NextResponse.json({ error: `ALOC request failed: ${alocResponse.statusText}` }, { status: 502 });
  }

  const payload = await alocResponse.json();
  const candidates = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : [];

  const normalized = candidates.slice(0, 20).map((record: ALOCQuestion) => normalizeQuestion(record, subjectId));

  const { error: insertError } = await serviceSupabase.from('wp_questions').insert(normalized);
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ inserted: normalized.length, subject, examType });
}
