"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../lib/session-bootstrap';
import { createPublicSupabaseClient } from '../../lib/supabase';
import { updateStreakAfterSession } from '../../lib/user-metrics';
import { getSubscriptionStatus } from '../../lib/subscription';
import { UpgradeModal } from '../components/upgrade-modal';
import { SubjectSelection } from '../components/subject-selection';

type Subject = { id: string; name: string; exam_type: string };
type QuestionRow = {
  id: string;
  topic: string | null;
  question_text: string;
  options: Array<{ label: string; text: string }>;
};

type QuestionResult = {
  isCorrect: boolean;
  correctOption: string;
  explanation: string | null;
};

type WimpyAIResponse = {
  focusList: string[];
  message: string;
  error?: string;
};

export default function MockPage() {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedSubjectName, setSelectedSubjectName] = useState<string>('');
  const [questions, setQuestions] = useState<QuestionRow[]>([]);
  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(90);
  const [score, setScore] = useState(0);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [questionResult, setQuestionResult] = useState<QuestionResult | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoadingQuestions, setIsLoadingQuestions] = useState(false);
  const [sessionComplete, setSessionComplete] = useState(false);
  const [wimpyAiResponse, setWimpyAiResponse] = useState<WimpyAIResponse | null>(null);
  const [isFetchingFocus, setIsFetchingFocus] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [isSubscriptionLoading, setIsSubscriptionLoading] = useState(true);
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [showSubjectSelection, setShowSubjectSelection] = useState(false);
  const [userSubjectIds, setUserSubjectIds] = useState<string[]>([]);
  const [isSubjectSelectionReady, setIsSubjectSelectionReady] = useState(false);
  const { user, accessToken, isAuthenticated, isLoading, signInUrl } = useSession();
  const userId = user?.id ?? null;
  const subjectIdsList = useMemo(() => subjects.map((subject) => subject.id), [subjects]);

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
        }
      });
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    const loadSubscription = async () => {
      const { active } = await getSubscriptionStatus(supabase, user.id);
      setIsPro(active);
      setIsSubscriptionLoading(false);
    };

    void loadSubscription();
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated || !user || !accessToken) {
      return;
    }

    const loadUserSubjects = async () => {
      const response = await fetch('/api/user-subjects', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        setUserSubjectIds([]);
        setIsSubjectSelectionReady(true);
        return;
      }

      const data = await response.json().catch(() => ({ selections: [] }));
      const selections = (data?.selections ?? []) as Array<{ subject_id: string; name?: string | null }>;
      const ids = selections.map((selection) => selection.subject_id);
      setUserSubjectIds(ids);
      setIsSubjectSelectionReady(true);
      const shouldResetSelection = !selectedSubjectId || !ids.includes(selectedSubjectId);
      if (shouldResetSelection && ids.length > 0) {
        const nextSubject = subjects.find((subject) => subject.id === ids[0]);
        if (nextSubject) {
          setSelectedSubjectId(nextSubject.id);
          setSelectedSubjectName(nextSubject.name);
        }
      }
    };

    void loadUserSubjects();
  }, [accessToken, isAuthenticated, selectedSubjectId, subjects, user]);

  useEffect(() => {
    if (!selectedSubjectId || !isAuthenticated || !user || !accessToken || isSubscriptionLoading) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    const loadQuestions = async () => {
      if (!isPro) {
        setIsLoadingQuestions(false);
        setQuestions([]);
        return;
      }

      setIsLoadingQuestions(true);
      setQuestions([]);
      setIndex(0);
      setScore(0);
      setSelectedOption(null);
      setQuestionResult(null);
      setSessionId(null);
      setTimeLeft(90);

      const subjectIdentifier = selectedSubjectId || selectedSubjectName;
      const response = await fetch(`/api/questions?subjectId=${encodeURIComponent(subjectIdentifier)}`, {
        headers: {
          Authorization: `Bearer ${accessToken ?? ''}`,
        },
      });

      if (!response.ok) {
        setQuestions([]);
        setIsLoadingQuestions(false);
        return;
      }

      const json = await response.json().catch(() => null);
      setQuestions((json?.questions ?? []) as QuestionRow[]);
      setIsLoadingQuestions(false);
    };

    void loadQuestions();
  }, [accessToken, isAuthenticated, isPro, isSubscriptionLoading, selectedSubjectId, userId]);

  useEffect(() => {
    if (!isAuthenticated || !user || !selectedSubjectId || !questions.length || sessionId) {
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
          mode: 'mock_exam',
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

  useEffect(() => {
    if (timeLeft <= 0 || !isAuthenticated || !sessionId || sessionComplete) {
      return;
    }

    const timer = window.setInterval(() => setTimeLeft((value) => Math.max(value - 1, 0)), 1000);
    return () => window.clearInterval(timer);
  }, [isAuthenticated, sessionId, sessionComplete, timeLeft]);

  const question = questions[index];
  const progress = useMemo(() => (questions.length ? ((index + 1) / questions.length) * 100 : 0), [index, questions.length]);

  useEffect(() => {
    if (timeLeft !== 0 || !isAuthenticated || !sessionId || sessionComplete) {
      return;
    }

    void completeSession(question?.id);
  }, [timeLeft, isAuthenticated, question?.id, sessionId, sessionComplete]);

  const submitAnswer = async (option: string) => {
    if (!isAuthenticated || !user || !question || !sessionId || selectedOption) {
      return;
    }

    setSelectedOption(option);
    setQuestionResult(null);

    const response = await fetch('/api/questions/answer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken ?? ''}`,
      },
      body: JSON.stringify({
        questionId: question.id,
        selectedOption: option,
        sessionId,
      }),
    });

    if (!response.ok) {
      setQuestionResult({ isCorrect: false, correctOption: '', explanation: 'Unable to validate answer.' });
      return;
    }

    const result = (await response.json()) as QuestionResult;
    setQuestionResult(result);
    setScore((currentScore) => (result.isCorrect ? currentScore + 1 : currentScore));
  };

  const fetchRecommendedFocus = async (questionId?: string) => {
    if (!sessionId) {
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

    await supabase.from('wp_sessions').update({ score, completed_at: new Date().toISOString() }).eq('id', sessionId);
    await updateStreakAfterSession(supabase, user.id);
    setSessionComplete(true);
    await fetchRecommendedFocus(questionId);
  };

  const nextQuestion = async () => {
    if (index < questions.length - 1) {
      setIndex((value) => value + 1);
      setSelectedOption(null);
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
          <p className="eyebrow">Mock exam locked</p>
          <h1>Sign in to track your progress</h1>
          <p className="lead">Your mock-exam attempts need a real identity attached so they can be saved and reviewed.</p>
          <a href={signInUrl} className="button primary">Sign in with WimpyID</a>
        </section>
      </main>
    );
  }

  if (isSubscriptionLoading || !isSubjectSelectionReady) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="meta">Preparing your mock-exam setup…</p>
        </section>
      </main>
    );
  }

  if (showSubjectSelection) {
    return (
      <main className="shell">
        <SubjectSelection onComplete={() => {
          setShowSubjectSelection(false);
          setIsSubjectSelectionReady(false);
        }} />
      </main>
    );
  }

  if (!userSubjectIds.length) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Set your study focus</p>
          <h1>Choose the subjects you’re offering first.</h1>
          <p className="lead">This one-time setup helps personalize mock exams.</p>
          <button className="button primary" onClick={() => setShowSubjectSelection(true)} type="button">Choose subjects</button>
        </section>
      </main>
    );
  }

  if (!isPro) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">WimpyPrep Pro required</p>
          <h1>Mock exams are Pro-only</h1>
          <p className="lead">Upgrade to WimpyPrep Pro to unlock full mock exams and priority AI guidance.</p>
          <button className="button primary" onClick={() => setShowUpgradeModal(true)} type="button">Upgrade to Pro</button>
          <UpgradeModal open={showUpgradeModal} onClose={() => setShowUpgradeModal(false)} onSuccess={() => setShowUpgradeModal(false)} />
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Mock exam mode</p>
        <h1>Feel the real CBT pressure without the surprise.</h1>
        <p className="lead">A timed simulation with a visible countdown and auto-submit pacing.</p>
        <div className="timer-row">
          <span className={`timer ${timeLeft < 20 ? 'danger' : ''}`}>⏱ {timeLeft}s</span>
          <span className="meta">Score {score}/{index + 1}</span>
        </div>
        <div className="progress-track" aria-label="mock exam progress">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Choose subject</h2>
          <select
            value={selectedSubjectId}
            onChange={(event) => {
              if (event.target.value === '__other__') {
                setShowSubjectSelection(true);
                return;
              }
              const nextSubject = subjects.find((subject) => subject.id === event.target.value);
              setSelectedSubjectId(event.target.value);
              setSelectedSubjectName(nextSubject?.name ?? '');
              setSessionId(null);
              setSessionComplete(false);
              setWimpyAiResponse(null);
            }}
            className="option"
          >
            {subjects
              .filter((subject) => userSubjectIds.includes(subject.id) || subject.id === selectedSubjectId)
              .map((subject) => (
                <option key={subject.id} value={subject.id}>{subject.name}</option>
              ))}
            <option value="__other__">Practice a different subject</option>
          </select>
        </div>

        {isLoadingQuestions ? <p className="meta">Loading questions…</p> : null}
        {!question ? (
          <p className="lead">No questions are available for this subject yet. Import a question set first.</p>
        ) : (
          <>
            <div className="panel-header">
              <h2>{question.topic ?? 'General'}</h2>
              <span>Question {index + 1}/{questions.length}</span>
            </div>
            <p className="question-text">{question.question_text}</p>
            <div className="options-list">
              {question.options.map((option) => (
                <button
                  key={option.label}
                  className="option"
                  onClick={() => void submitAnswer(option.label)}
                  disabled={Boolean(selectedOption) || timeLeft === 0}
                >
                  {option.label}. {option.text}
                </button>
              ))}
            </div>
            {selectedOption ? (
              <div className="feedback">
                {questionResult ? (
                  <>
                    <p>{questionResult.isCorrect ? 'Correct — keep the pace.' : `Not quite. Answer ${questionResult.correctOption} is correct.`}</p>
                    {questionResult.explanation ? <p>{questionResult.explanation}</p> : null}
                    {!questionResult.isCorrect && sessionId ? (
                      <button
                        className="button secondary"
                        onClick={() => void fetchRecommendedFocus(question.id)}
                      >
                        Explain this question
                      </button>
                    ) : null}
                  </>
                ) : (
                  <p className="meta">Checking your answer…</p>
                )}
                <button className="button primary" onClick={nextQuestion}>
                  {index === questions.length - 1 ? 'Finish exam' : 'Next question'}
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
