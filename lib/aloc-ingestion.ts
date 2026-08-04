import { createServiceSupabaseClient } from './supabase';

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

const ALOC_API_URL = 'https://questions.aloc.com.ng/api/questions';
const MAX_PAGES = 10;
const PAGE_SIZE = 100;
const MAX_QUESTIONS_PER_SUBJECT = 500;

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

function extractQuestions(payload: unknown): ALOCQuestion[] {
  if (Array.isArray(payload)) {
    return payload as ALOCQuestion[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['data', 'results', 'questions', 'items']) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return candidate as ALOCQuestion[];
      }
    }
  }

  return [];
}

function extractNextPage(payload: unknown, currentPage: number): number | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const pagination = record.pagination;
  if (pagination && typeof pagination === 'object') {
    const nextPage = (pagination as Record<string, unknown>).next_page;
    if (typeof nextPage === 'number') {
      return nextPage;
    }
  }

  const nextPageField = record.next_page;
  if (typeof nextPageField === 'number') {
    return nextPageField;
  }

  const totalPages = record.total_pages;
  if (typeof totalPages === 'number') {
    return totalPages > currentPage ? currentPage + 1 : null;
  }

  return null;
}

export async function ingestQuestionsForSubject(subject: string, examType: string) {
  const token = process.env.ALOC_ACCESS_TOKEN;
  const serviceSupabase = createServiceSupabaseClient();

  if (!token || !serviceSupabase) {
    return { ok: false, status: 500, error: 'ALOC access token or Supabase service role is not configured.' };
  }

  let subjectResponse = await serviceSupabase.from('wp_subjects').select('id,name').eq('name', subject).maybeSingle();
  if (subjectResponse.error) {
    return { ok: false, status: 500, error: subjectResponse.error.message };
  }

  let subjectId = subjectResponse.data?.id;
  if (!subjectId) {
    const insertResponse = await serviceSupabase
      .from('wp_subjects')
      .insert({ name: subject, exam_type: examType })
      .select('id,name')
      .single();
    if (insertResponse.error) {
      return { ok: false, status: 500, error: `Could not create subject ${subject}: ${insertResponse.error.message}` };
    }
    subjectId = insertResponse.data.id;
  }

  const seenQuestions = new Set<string>();
  const existingQuestionsResponse = await serviceSupabase.from('wp_questions').select('question_text').eq('subject_id', subjectId);
  if (existingQuestionsResponse.error) {
    return { ok: false, status: 500, error: existingQuestionsResponse.error.message };
  }

  for (const row of existingQuestionsResponse.data ?? []) {
    const text = typeof row.question_text === 'string' ? row.question_text.trim().toLowerCase() : '';
    if (text) {
      seenQuestions.add(text);
    }
  }

  const normalizedQuestions: Array<{
    subject_id: string;
    topic: string;
    year: number;
    question_text: string;
    options: Array<{ label: string; text: string }>;
    correct_option: string;
    explanation: string | null;
    difficulty: number;
  }> = [];
  let currentPage = 1;
  let hasMorePages = true;

  while (hasMorePages && currentPage <= MAX_PAGES) {
    const url = new URL(ALOC_API_URL);
    url.searchParams.set('subject', subject);
    url.searchParams.set('exam_type', examType);
    url.searchParams.set('page', String(currentPage));
    url.searchParams.set('per_page', String(PAGE_SIZE));

    const alocResponse = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    });

    if (!alocResponse.ok) {
      return { ok: false, status: 502, error: `ALOC request failed: ${alocResponse.statusText}` };
    }

    const payload = await alocResponse.json();
    const candidates = extractQuestions(payload);
    if (!candidates.length) {
      break;
    }

    for (const record of candidates) {
      if (normalizedQuestions.length >= MAX_QUESTIONS_PER_SUBJECT) {
        hasMorePages = false;
        break;
      }

      const normalized = normalizeQuestion(record, subjectId);
      const questionText = normalized.question_text.trim().toLowerCase();
      if (!questionText || seenQuestions.has(questionText)) {
        continue;
      }

      seenQuestions.add(questionText);
      normalizedQuestions.push(normalized);
    }

    if (normalizedQuestions.length >= MAX_QUESTIONS_PER_SUBJECT) {
      break;
    }

    const nextPage = extractNextPage(payload, currentPage);
    if (!nextPage || nextPage <= currentPage) {
      hasMorePages = false;
      break;
    }

    currentPage = nextPage;
  }

  if (!normalizedQuestions.length) {
    return { ok: true, inserted: 0, subject, examType, skipped: true };
  }

  const { error: insertError } = await serviceSupabase.from('wp_questions').insert(normalizedQuestions);
  if (insertError) {
    return { ok: false, status: 500, error: insertError.message };
  }

  return { ok: true, inserted: normalizedQuestions.length, subject, examType };
}
