import { createServiceSupabaseClient } from './supabase';

type ALOCQuestion = {
  id?: string | number;
  subject?: string;
  topic?: string;
  year?: number | string;
  question?: string;
  question_text?: string;
  option?: Record<string, string>;
  options?: Array<{ label?: string; text?: string }> | Record<string, string> | Record<string, unknown>;
  option_a?: string;
  option_b?: string;
  option_c?: string;
  option_d?: string;
  answer?: string;
  correct_option?: string;
  correct_answer?: string;
  explanation?: string;
  solution?: string;
  examtype?: string;
  examyear?: string;
};

const ALOC_API_URL = 'https://questions.aloc.com.ng/api/v2/m/100';
const MAX_QUESTIONS_PER_SUBJECT = 100;
const VALID_ALOC_TYPES = new Set(['utme', 'wassce', 'post-utme']);
const FETCH_TIMEOUT_MS = Number.parseInt(process.env.ALOC_FETCH_TIMEOUT_MS ?? '', 10);
const EFFECTIVE_FETCH_TIMEOUT_MS = Number.isFinite(FETCH_TIMEOUT_MS) && FETCH_TIMEOUT_MS > 0 ? FETCH_TIMEOUT_MS : 300000;

function normalizeSubjectName(value: string) {
  const normalized = value.trim().toLowerCase();
  const aliasMap: Record<string, string> = {
    'english language': 'english',
    'english': 'english',
    'mathematics': 'mathematics',
    'commerce': 'commerce',
    'accounting': 'accounting',
    'biology': 'biology',
    'physics': 'physics',
    'chemistry': 'chemistry',
    'english literature': 'englishlit',
    'englishlit': 'englishlit',
    'government': 'government',
    'crk': 'crk',
    'geography': 'geography',
    'economics': 'economics',
    'irk': 'irk',
    'civiledu': 'civiledu',
    'civic education': 'civiledu',
    'insurance': 'insurance',
    'current affairs': 'currentaffairs',
    'currentaffairs': 'currentaffairs',
    'history': 'history',
  };

  return aliasMap[normalized] ?? normalized;
}

function normalizeExamType(examType: string) {
  const normalized = examType.trim().toLowerCase();
  if (normalized === 'jamb') {
    return 'utme';
  }

  return VALID_ALOC_TYPES.has(normalized) ? normalized : null;
}

function normalizeOptions(payload: ALOCQuestion['options'] | ALOCQuestion['option']) {
  if (Array.isArray(payload)) {
    return payload.map((option) => ({
      label: option.label ?? '',
      text: option.text ?? '',
    }));
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const directEntries = Object.entries(record).filter(([key]) => !['id', 'subject', 'topic', 'year', 'question', 'question_text', 'answer', 'correct_option', 'correct_answer', 'explanation', 'solution', 'examtype', 'examyear'].includes(key));
    if (directEntries.length) {
      return directEntries.map(([label, text]) => ({ label: String(label).toUpperCase(), text: String(text ?? '') }));
    }
  }

  return [];
}

function normalizeQuestion(record: ALOCQuestion, subjectId: string) {
  const normalizedOptions = normalizeOptions(record.option ?? record.options);
  const answerCandidates = [record.correct_option, record.correct_answer, record.answer].filter((value): value is string => Boolean(value));
  const answerLabel = answerCandidates[0]?.trim().toUpperCase() ?? '';
  const correctOption = normalizedOptions.find((option) => option.label.toUpperCase() === answerLabel)?.label || answerLabel;

  return {
    subject_id: subjectId,
    topic: record.topic || 'General',
    year: Number(record.examyear ?? record.year) || 2020,
    question_text: record.question || record.question_text || '',
    options: normalizedOptions,
    correct_option: correctOption,
    explanation: record.solution || record.explanation || null,
    difficulty: 2,
  };
}

function extractQuestions(payload: unknown): ALOCQuestion[] {
  if (Array.isArray(payload)) {
    return payload as ALOCQuestion[];
  }

  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    const directData = record.data;
    if (Array.isArray(directData)) {
      return directData as ALOCQuestion[];
    }

    for (const key of ['results', 'questions', 'items', 'items_data']) {
      const candidate = record[key];
      if (Array.isArray(candidate)) {
        return candidate as ALOCQuestion[];
      }
    }

    if (record.question && typeof record.question === 'object') {
      return [record.question as ALOCQuestion];
    }
  }

  return [];
}

function isValidToken(token: string | undefined) {
  return Boolean(token && /^ALOC-[A-Za-z0-9]{8,}$/.test(token));
}

export async function ingestQuestionsForSubject(subject: string, examType: string) {
  const token = process.env.ALOC_ACCESS_TOKEN;
  const serviceSupabase = createServiceSupabaseClient();

  try {
    if (!token || !serviceSupabase) {
      const error = 'ALOC access token or Supabase service role is not configured.';
      console.error('[aloc-ingestion]', { subject, examType, error });
      return { ok: false, status: 500, error };
    }

    if (!isValidToken(token)) {
      const error = `ALOC access token is invalid. Expected a token that starts with ALOC- and contains a 40-character-ish hex-like value.`;
      console.error('[aloc-ingestion]', { subject, examType, error, token: token.slice(0, 12) });
      return { ok: false, status: 500, error };
    }

    const normalizedSubject = normalizeSubjectName(subject);
    if (!normalizedSubject) {
      const error = `No valid ALOC subject slug could be derived from ${subject}.`;
      console.error('[aloc-ingestion]', { subject, examType, error });
      return { ok: false, status: 400, error };
    }

    const normalizedExamType = normalizeExamType(examType);
    let subjectResponse;
    try {
      subjectResponse = await serviceSupabase.from('wp_subjects').select('id,name').eq('name', subject).maybeSingle();
    } catch (subjectLookupError) {
      const error = subjectLookupError instanceof Error ? subjectLookupError.message : 'Unknown subject lookup error';
      console.error('[aloc-ingestion]', { subject, examType, error });
      return { ok: false, status: 500, error };
    }

    if (subjectResponse.error && subjectResponse.error.code !== 'PGRST116') {
      const error = subjectResponse.error.message;
      console.error('[aloc-ingestion]', { subject, examType, error });
      return { ok: false, status: 500, error };
    }

    let subjectId = subjectResponse.data?.id;
    if (!subjectId) {
      let subjectSearchResponse;
      try {
        subjectSearchResponse = await serviceSupabase
          .from('wp_subjects')
          .select('id,name')
          .ilike('name', `%${subject}%`)
          .limit(5);
      } catch (subjectSearchError) {
        const error = subjectSearchError instanceof Error ? subjectSearchError.message : 'Unknown subject search error';
        console.error('[aloc-ingestion]', { subject, examType, error });
        return { ok: false, status: 500, error };
      }

      if (!subjectSearchResponse.error && subjectSearchResponse.data?.length) {
        subjectId = subjectSearchResponse.data[0]?.id;
      }
    }

    if (!subjectId) {
      let insertResponse;
      try {
        insertResponse = await serviceSupabase
          .from('wp_subjects')
          .insert({ name: subject, exam_type: examType })
          .select('id,name')
          .single();
      } catch (insertSubjectError) {
        const error = insertSubjectError instanceof Error ? insertSubjectError.message : 'Unknown subject insert error';
        console.error('[aloc-ingestion]', { subject, examType, error });
        return { ok: false, status: 500, error };
      }

      if (insertResponse.error) {
        const error = `Could not create subject ${subject}: ${insertResponse.error.message}`;
        console.error('[aloc-ingestion]', { subject, examType, error });
        return { ok: false, status: 500, error };
      }
      subjectId = insertResponse.data.id;
    }

    const seenQuestions = new Set<string>();
    let existingQuestionsResponse;
    try {
      existingQuestionsResponse = await serviceSupabase.from('wp_questions').select('question_text').eq('subject_id', subjectId);
    } catch (existingQuestionsError) {
      const error = existingQuestionsError instanceof Error ? existingQuestionsError.message : 'Unknown existing questions lookup error';
      console.error('[aloc-ingestion]', { subject, examType, error });
      return { ok: false, status: 500, error };
    }

    if (existingQuestionsResponse.error) {
      const error = existingQuestionsResponse.error.message;
      console.error('[aloc-ingestion]', { subject, examType, error });
      return { ok: false, status: 500, error };
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

    const url = new URL(ALOC_API_URL);
    url.searchParams.set('subject', normalizedSubject);
    if (normalizedExamType) {
      url.searchParams.set('type', normalizedExamType);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EFFECTIVE_FETCH_TIMEOUT_MS);

    let alocResponse: Response;
    try {
      alocResponse = await fetch(url.toString(), {
        headers: {
          AccessToken: token,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
    } catch (fetchError) {
      const error = fetchError instanceof Error ? fetchError.message : 'Unknown network error calling ALOC';
      console.error('[aloc-ingestion]', { subject, examType, normalizedSubject, error });
      return { ok: false, status: 502, error };
    } finally {
      clearTimeout(timeout);
    }

    if (!alocResponse.ok) {
      const responseText = await alocResponse.text().catch(() => '');
      const error = `ALOC request failed with ${alocResponse.status} ${alocResponse.statusText}`;
      console.error('[aloc-ingestion]', { subject, examType, normalizedSubject, normalizedExamType, error, status: alocResponse.status, statusText: alocResponse.statusText, responseText });
      return { ok: false, status: 502, error };
    }

    const payload = await alocResponse.json().catch((reason) => {
      console.error('[aloc-ingestion]', { subject, examType, normalizedSubject, error: `Failed to parse ALOC JSON: ${reason}` });
      return null;
    });

    const candidates = extractQuestions(payload);
    if (!candidates.length) {
      const error = `ALOC returned no usable questions for subject ${normalizedSubject}`;
      console.error('[aloc-ingestion]', { subject, examType, normalizedSubject, error, payload });
      return { ok: false, status: 502, error };
    }

    for (const record of candidates) {
      if (normalizedQuestions.length >= MAX_QUESTIONS_PER_SUBJECT) {
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

    if (!normalizedQuestions.length) {
      const error = `ALOC returned questions but none could be normalized for ${subject}`;
      console.error('[aloc-ingestion]', { subject, examType, normalizedSubject, error, payload });
      return { ok: false, status: 502, error };
    }

    let insertError;
    try {
      insertError = await serviceSupabase.from('wp_questions').insert(normalizedQuestions);
    } catch (insertQuestionsError) {
      const error = insertQuestionsError instanceof Error ? insertQuestionsError.message : 'Unknown insert questions error';
      console.error('[aloc-ingestion]', { subject, examType, normalizedSubject, error });
      return { ok: false, status: 500, error };
    }

    if (insertError.error) {
      const error = insertError.error.message;
      console.error('[aloc-ingestion]', { subject, examType, normalizedSubject, error });
      return { ok: false, status: 500, error };
    }

    return { ok: true, inserted: normalizedQuestions.length, subject, examType, normalizedSubject, subjectId };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected ingestion error';
    console.error('[aloc-ingestion] Unexpected failure', { subject, examType, error: message });
    return { ok: false, status: 500, error: message };
  }
}
