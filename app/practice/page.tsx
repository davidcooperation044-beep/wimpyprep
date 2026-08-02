"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../lib/session-bootstrap';
import { createPublicSupabaseClient } from '../../lib/supabase';
import { updateStreakAfterSession } from '../../lib/user-metrics';
import { FREE_PRACTICE_DAILY_LIMIT, getSubscriptionStatus, getTodayPracticeCount, WIMPY_PAY_SUBSCRIBE_URL } from '../../lib/subscription';

type Subject = { id: string; name: string; exam_type: string };
type QuestionRow = {
  id: string;
  topic: string | null;
  question_text: string;
  options: Array<{ label: string; text: string }>;
  correct_option: string;
  explanation: string | null;
};

type WimpyAIResponse = {
  focusList: string[];
  message: string;
  error?: string;
};

export default function PracticePage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [wimpyAiResponse, setWimpyAiResponse] = useState<WimpyAIResponse | null>(null);
  const [isFetchingFocus, setIsFetchingFocus] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [practiceCount, setPracticeCount] = useState(0);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(true);
  const [limitMessage, setLimitMessage] = useState('');
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineError, setOfflineError] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const { user, isAuthenticated, isLoading, signInUrl } = useSession();

  useEffect(() => {
    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    supabase
      .from('wp_subjects')
      .select('id,name,exam_type')
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) {
          setSubjects(data as Subject[]);
          if (!selectedSubjectId && data.length > 0) {
            setSelectedSubjectId(data[0].id);
          }
        }
      });
  }, [selectedSubjectId]);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    const loadSubscription = async () => {
      setIsSubscriptionLoading(true);

      const [{ active }, todayResult] = await Promise.all([
        getSubscriptionStatus(supabase, user.id),
        getTodayPracticeCount(supabase, user.id),
      ]);

      setIsPro(active);
      setPracticeCount(todayResult.count ?? 0);
      setIsSubscriptionLoading(false);
    };

    void loadSubscription();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!selectedSubjectId || !isAuthenticated || !user || isSubscriptionLoading) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    const loadQuestions = async () => {
      setIsLoadingQuestions(true);
      setQuestions([]);
      setIndex(0);
      setScore(0);
      setSelected(null);
      setSessionId(null);
      setLimitMessage('');
      setSessionComplete(false);
      setWimpyAiResponse(null);
      setOfflineReady(false);
      setOfflineError('');

      if (!isPro && practiceCount >= FREE_PRACTICE_DAILY_LIMIT) {
        setLimitMessage(`You have hit your free daily limit of ${FREE_PRACTICE_DAILY_LIMIT} questions. Upgrade for unlimited practice.`);
        setIsLoadingQuestions(false);
        return;
      }

      const response = await fetch(`/api/questions?subjectId=${encodeURIComponent(selectedSubjectId)}`);
      if (response.ok) {
        const json = await response.json().catch(() => null);
        setQuestions((json?.questions ?? []) as QuestionRow[]);
        setOfflineReady(true);
      } else {
        setQuestions([]);
      }

      setIsLoadingQuestions(false);
    };

    void loadQuestions();
  }, [isAuthenticated, selectedSubjectId, user, isPro, practiceCount, isSubscriptionLoading]);

  useEffect(() => {
    if (!selectedSubjectId || !questions.length || !isAuthenticated || !user || sessionId) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    const createSession = async () => {
      const { data, error } = await supabase
        .from('wp_sessions')
        .insert({
          user_id: user.id,
          mode: 'practice',
          subject_ids: [selectedSubjectId],
          score: 0,
          total_questions: questions.length,
        })
        .select('id')
        .single();

      if (!error && data) {
        setSessionId(data.id);
      }
    };

    void createSession();
  }, [isAuthenticated, questions.length, selectedSubjectId, sessionId, user]);

  const question = questions[index];
  const progress = useMemo(() => (questions.length ? ((index + 1) / questions.length) * 100 : 0), [index, questions.length]);

  const hasReachedLimit = !isPro && practiceCount >= FREE_PRACTICE_DAILY_LIMIT;

  const downloadQuestions = async () => {
    if (!selectedSubjectId) {
      return;
    }

    setIsDownloading(true);
    setOfflineError('');

    try {
      const response = await fetch(`/api/questions?subjectId=${encodeURIComponent(selectedSubjectId)}`);
      if (!response.ok) {
        throw new Error('Unable to download questions for offline use.');
      }

      await response.json();
      setOfflineReady(true);
    } catch (error) {
      setOfflineError(error instanceof Error ? error.message : 'Download failed.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleAnswer = async (option: string) => {
    if (!isAuthenticated || !user || !question || !sessionId || hasReachedLimit) {
      if (hasReachedLimit) {
        setLimitMessage(`You have hit your free daily limit of ${FREE_PRACTICE_DAILY_LIMIT} questions. Upgrade for unlimited practice.`);
      }
      return;
    }

    const nextScore = option === question.correct_option ? score + 1 : score;
    const isCorrect = option === question.correct_option;
    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    setSelected(option);
    setScore(nextScore);

    await supabase.from('wp_attempts').insert({
      user_id: user.id,
      question_id: question.id,
      selected_option: option,
      is_correct: isCorrect,
      session_id: sessionId,
    });

    setPracticeCount((count) => count + 1);
  };

  const fetchRecommendedFocus = async (questionId?: string) => {
    if (!sessionId) {
      return;
    }

    if (!isPro) {
      setWimpyAiResponse({
        focusList: [],
        message: `WimpyPrep Pro is required for personalized AI weak-area recommendations. Upgrade to continue.`,
      });
      return;
    }

    setIsFetchingFocus(true);
    setWimpyAiResponse(null);

    const response = await fetch('/api/wimpyai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, questionId }),
    });

    const data = await response.json().catch(() => ({ focusList: [], message: 'Unable to parse WimpyAI response.' }));
    setWimpyAiResponse(data as WimpyAIResponse);
    setIsFetchingFocus(false);
  };

  const completeSession = async (questionId?: string) => {
    if (!sessionId || !user) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    await supabase
      .from('wp_sessions')
      .update({ score, completed_at: new Date().toISOString() })
      .eq('id', sessionId);

    await updateStreakAfterSession(supabase, user.id);
    setSessionComplete(true);
    await fetchRecommendedFocus(questionId);
  };

  const nextQuestion = async () => {
    if (index < questions.length - 1) {
      setIndex((value) => value + 1);
      setSelected(null);
      return;
    }

    await completeSession(question?.id);
  };

  if (isLoading) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="meta">Checking your session…</p>
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Practice locked</p>
          <h1>Sign in to track your progress</h1>
          <p className="lead">Practice mode and your study history stay attached to your Wimpy account when you sign in.</p>
          <a href={signInUrl} className="button primary">Sign in with WimpyID</a>
        </section>
      </main>
    );
  }

  if (isSubscriptionLoading) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="meta">Checking your subscription status…</p>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Practice mode</p>
        <h1>Work one question at a time.</h1>
        <p className="lead">Daily practice, instant feedback, and clear explanations keep your momentum high.</p>
        <div className="progress-track" aria-label="practice progress">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <p className="meta">Score: {score}/{index + 1}</p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Choose subject</h2>
          <select
            value={selectedSubjectId}
            onChange={(event) => {
              setSelectedSubjectId(event.target.value);
              setSessionId(null);
              setSessionComplete(false);
              setWimpyAiResponse(null);
              setOfflineReady(false);
              setOfflineError('');
            }}
            className="option"
          >
            {subjects.map((subject) => (
              <option key={subject.id} value={subject.id}>{subject.name}</option>
            ))}
          </select>
        </div>

        <div className="download-row">
          <button className="button secondary" onClick={downloadQuestions} disabled={!selectedSubjectId || isDownloading}>
            {isDownloading ? 'Downloading…' : offlineReady ? 'Refresh offline copy' : 'Download for offline'}
          </button>
          {offlineReady ? <span className="meta">Offline copy ready for this subject.</span> : null}
          {offlineError ? <span className="meta alert-text">{offlineError}</span> : null}
        </div>

        {isLoadingQuestions ? <p className="meta">Loading questions…</p> : null}
        {!isPro && !isLoadingQuestions && practiceCount >= FREE_PRACTICE_DAILY_LIMIT ? (
          <div className="panel">
            <p className="lead">You’ve reached your free daily limit of {FREE_PRACTICE_DAILY_LIMIT} practice questions.</p>
            {limitMessage ? <p className="meta">{limitMessage}</p> : <p className="meta">Upgrade to WimpyPrep Pro for unlimited practice and full AI insights.</p>}
            <a className="button primary" href={WIMPY_PAY_SUBSCRIBE_URL}>Upgrade to Pro</a>
          </div>
        ) : !question ? (
          <p className="lead">No questions are available for this subject yet. Import a question set first.</p>
        ) : (
          <>
            <div className="panel-header">
              <h2>{question.topic ?? 'General'}</h2>
              <span>{index + 1}/{questions.length}</span>
            </div>
            <p className="question-text">{question.question_text}</p>
            <div className="options-list">
              {question.options.map((option) => (
                <button
                  key={option.label}
                  className="option"
                  onClick={() => void handleAnswer(option.label)}
                  disabled={Boolean(selected)}
                >
                  {option.label}. {option.text}
                </button>
              ))}
            </div>
            {selected ? (
              <div className="feedback">
                <p>{selected === question.correct_option ? 'Correct — nice work.' : `Not quite. The correct answer is ${question.correct_option}.`}</p>
                {question.explanation ? <p>{question.explanation}</p> : null}
                {selected !== question.correct_option && sessionId ? (
                  <button
                    className="button secondary"
                    onClick={() => void fetchRecommendedFocus(question.id)}
                  >
                    Explain this question
                  </button>
                ) : null}
                <button className="button primary" onClick={nextQuestion}>
                  {index === questions.length - 1 ? 'Finish session' : 'Next'}
                </button>
              </div>
            ) : null}
            {(sessionComplete || wimpyAiResponse) ? (
              <div className="focus-panel">
                <div className="panel-header">
                  <h2>Recommended Focus</h2>
                  <span>{isFetchingFocus ? 'Analyzing your session…' : 'AI-powered study guidance'}</span>
                </div>
                {isFetchingFocus ? <p className="meta">Loading focus recommendations…</p> : null}
                {wimpyAiResponse ? (
                  <>
                    <div className="chip-list">
                      {wimpyAiResponse.focusList.map((focusItem) => (
                        <span key={focusItem} className="chip">{focusItem}</span>
                      ))}
                    </div>
                    <p className="lead">{wimpyAiResponse.message}</p>
                  </>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </section>
    </main>
  );
}
