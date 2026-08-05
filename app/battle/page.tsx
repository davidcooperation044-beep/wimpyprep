"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSession } from '../../lib/session-bootstrap';
import { createPublicSupabaseClient } from '../../lib/supabase';

type SubjectOption = {
  id: string;
  name: string;
  exam_type: string;
};

type QuestionOption = {
  label: string;
  text: string;
};

type BattleQuestion = {
  id: string;
  question_text: string;
  options: QuestionOption[];
  topic: string | null;
  year: number | null;
};

type BattleDetail = {
  id: string;
  subject_id: string;
  year: number | null;
  status: string;
  player_one_id: string;
  player_two_id: string | null;
  question_ids: string[];
  created_at: string;
  started_at: string | null;
  ends_at: string | null;
  completed_at: string | null;
  room_code: string | null;
  is_private: boolean;
  time_limit_seconds: number | null;
  question_count: number | null;
  player_one_ready: boolean;
  player_two_ready: boolean;
  winner_id: string | null;
  questions: BattleQuestion[];
  answered_question_ids: string[];
  player_one_score: number;
  player_two_score: number;
  participant_role: 'player_one' | 'player_two' | null;
  opponent_id: string | null;
};

type BattleAnswerState = {
  selectedOption: string;
  submitted: boolean;
};

async function createBattleLobby(payload: Record<string, unknown>) {
  const shouldJoinPrivate = Boolean(payload.isPrivate && payload.roomCode);
  const endpoint = shouldJoinPrivate ? '/api/battle/join' : '/api/battle';
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error((errorData as { error?: string }).error ?? 'Unable to join a battle lobby right now.');
  }

  return response.json() as Promise<{ battle: BattleDetail; joined: boolean; status: string }>;
}

async function fetchBattleDetail(battleId: string) {
  const response = await fetch(`/api/battle/${battleId}`);
  if (!response.ok) {
    throw new Error('Unable to load the latest battle state.');
  }

  return response.json() as Promise<{ battle: BattleDetail }>;
}

async function submitBattleAnswer(battleId: string, questionId: string, selectedOption: string) {
  const response = await fetch(`/api/battle/${battleId}/answer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ questionId, selectedOption }),
  });

  if (!response.ok) {
    throw new Error('Unable to submit that answer just yet.');
  }

  return response.json();
}

async function markBattleReady(battleId: string) {
  const response = await fetch(`/api/battle/${battleId}/ready`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Unable to mark yourself ready.');
  }

  return response.json() as Promise<{ battle: BattleDetail; started: boolean }>;
}

async function completeBattle(battleId: string) {
  const response = await fetch(`/api/battle/${battleId}/complete`, {
    method: 'POST',
  });

  if (!response.ok) {
    throw new Error('Unable to finish the battle.');
  }

  return response.json() as Promise<{ battle: BattleDetail }>;
}

export default function BattlePage() {
  const { isAuthenticated, user, signInUrl } = useSession();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [year, setYear] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [roomCode, setRoomCode] = useState('');
  const [questionCount, setQuestionCount] = useState('10');
  const [timeLimitSeconds, setTimeLimitSeconds] = useState('1800');
  const [isJoining, setIsJoining] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isReadying, setIsReadying] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleDetail | null>(null);
  const [battleId, setBattleId] = useState<string | null>(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answerStates, setAnswerStates] = useState<Record<string, BattleAnswerState>>({});
  const autoAdvanceTimerRef = useRef<number | null>(null);

  const canJoinPublic = useMemo(() => Boolean(isAuthenticated && user && selectedSubjectId), [isAuthenticated, selectedSubjectId, user]);
  const canJoinExistingPrivate = useMemo(
    () => Boolean(isAuthenticated && user && isPrivate && roomCode.trim()),
    [isAuthenticated, isPrivate, roomCode, user],
  );

  const refreshBattle = useCallback(async (activeBattleId: string) => {
    setIsRefreshing(true);
    try {
      const result = await fetchBattleDetail(activeBattleId);
      setBattle(result.battle);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to refresh the battle.');
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const loadSubjects = async () => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) {
        return;
      }

      const { data, error } = await supabase.from('wp_subjects').select('id,name,exam_type').order('name', { ascending: true });
      if (!error) {
        setSubjects((data ?? []) as SubjectOption[]);
      }
    };

    void loadSubjects();
  }, []);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimerRef.current !== null) {
        window.clearTimeout(autoAdvanceTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!battleId) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshBattle(battleId);
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [battleId, refreshBattle]);

  useEffect(() => {
    if (!battleId || !isAuthenticated) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    const channel = supabase.channel(`battle-${battleId}`);
    channel
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wp_battles', filter: `id=eq.${battleId}` }, () => {
        void refreshBattle(battleId);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'wp_battle_answers', filter: `battle_id=eq.${battleId}` }, () => {
        void refreshBattle(battleId);
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [battleId, isAuthenticated, refreshBattle]);

  useEffect(() => {
    if (!battle?.questions?.length) {
      return;
    }

    if (questionIndex >= battle.questions.length) {
      setQuestionIndex(Math.max(0, battle.questions.length - 1));
    }
  }, [battle, questionIndex]);

  const handleJoinLobby = async () => {
    if (!user || (!isPrivate ? !canJoinPublic : !canJoinPublic && !canJoinExistingPrivate)) {
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      const result = await createBattleLobby({
        subjectId: selectedSubjectId,
        year,
        userId: user.id,
        questionCount: Number(questionCount) || 10,
        timeLimitSeconds: Number(timeLimitSeconds) || 1800,
        isPrivate,
        roomCode: roomCode.trim(),
      });
      setBattleId(result?.battle?.id ?? null);
      setBattle(result?.battle ?? null);
      setQuestionIndex(0);
      setAnswerStates({});
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to join a battle lobby.');
    } finally {
      setIsJoining(false);
    }
  };

  const clearAutoAdvanceTimer = () => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  };

  const handleReady = async () => {
    if (!battleId || !battle) {
      return;
    }

    setIsReadying(true);
    setJoinError(null);
    try {
      const result = await markBattleReady(battleId);
      setBattle(result.battle);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to mark yourself ready.');
    } finally {
      setIsReadying(false);
    }
  };

  const handleComplete = async () => {
    if (!battleId || !battle) {
      return;
    }

    setIsCompleting(true);
    setJoinError(null);
    try {
      const result = await completeBattle(battleId);
      setBattle(result.battle);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to finish the battle.');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleAnswer = async (questionId: string, selectedOption: string) => {
    if (!battleId || !battle || answerStates[questionId]?.submitted) {
      return;
    }

    setIsSubmitting(true);
    try {
      await submitBattleAnswer(battleId, questionId, selectedOption);
      const nextAnswerStates = {
        ...answerStates,
        [questionId]: {
          selectedOption,
          submitted: true,
        },
      };
      setAnswerStates(nextAnswerStates);
      await refreshBattle(battleId);
      if (battle.questions?.length && questionIndex < battle.questions.length - 1) {
        clearAutoAdvanceTimer();
        autoAdvanceTimerRef.current = window.setTimeout(() => {
          setQuestionIndex((value) => Math.min(value + 1, battle.questions.length - 1));
        }, 1000);
      }

      const answeredCount = Object.keys(nextAnswerStates).length;
      if (battle.question_count && answeredCount >= battle.question_count) {
        await completeBattle(battleId);
      }
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to submit that answer.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const activeQuestion = useMemo(() => {
    if (!battle?.questions?.length) {
      return null;
    }

    return battle.questions[questionIndex] ?? battle.questions[0] ?? null;
  }, [battle, questionIndex]);

  const previousQuestion = () => {
    clearAutoAdvanceTimer();
    setQuestionIndex((value) => Math.max(0, value - 1));
  };

  const nextQuestion = () => {
    clearAutoAdvanceTimer();
    if (!battle?.questions?.length) {
      return;
    }
    setQuestionIndex((value) => Math.min(value + 1, battle.questions.length - 1));
  };

  const battleReady = battle?.status === 'active' || Boolean(battle?.player_one_ready && battle?.player_two_ready);

  if (!isAuthenticated) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Exam battle</p>
          <h1>Sign in to join a live match.</h1>
          <p className="lead">Live battles pair you with another learner in a timed exam-room challenge.</p>
          <a href={signInUrl} className="button primary">Sign in with WimpyID</a>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Live Exam Battle</p>
        <h1>Race another learner in a real-time exam room.</h1>
        <p className="lead">Create a public lobby or join a private room with a code, then ready up for a live match.</p>
        {!battle ? (
          <div className="panel" style={{ marginTop: 18 }}>
            <label className="subject-picker-label">
              <span>Subject</span>
              <select className="option" value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
                <option value="">Choose a subject</option>
                {subjects.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="subject-picker-label" style={{ marginTop: 12 }}>
              <span>Exam year</span>
              <select className="option" value={year} onChange={(event) => setYear(event.target.value)}>
                <option value="">Any recent year</option>
                <option value="2023">2023</option>
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
            </label>
            <label className="subject-picker-label" style={{ marginTop: 12 }}>
              <span>Question count</span>
              <select className="option" value={questionCount} onChange={(event) => setQuestionCount(event.target.value)}>
                <option value="10">10 questions</option>
                <option value="20">20 questions</option>
                <option value="40">40 questions</option>
              </select>
            </label>
            <label className="subject-picker-label" style={{ marginTop: 12 }}>
              <span>Time limit</span>
              <select className="option" value={timeLimitSeconds} onChange={(event) => setTimeLimitSeconds(event.target.value)}>
                <option value="900">15 minutes</option>
                <option value="1800">30 minutes</option>
                <option value="3600">60 minutes</option>
              </select>
            </label>
            <label className="subject-picker-label" style={{ marginTop: 12 }}>
              <span>Private room</span>
              <input className="option" type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} style={{ width: 'auto' }} />
            </label>
            {isPrivate ? (
              <label className="subject-picker-label" style={{ marginTop: 12 }}>
                <span>Room code</span>
                <input className="option" value={roomCode} onChange={(event) => setRoomCode(event.target.value.toUpperCase())} placeholder="e.g. ABC123" />
              </label>
            ) : null}
            <div className="actions">
              <button
                className="button primary"
                type="button"
                disabled={isJoining || (!isPrivate ? !canJoinPublic : !canJoinPublic && !canJoinExistingPrivate)}
                onClick={() => void handleJoinLobby()}
              >
                {isJoining
                  ? 'Joining…'
                  : isPrivate
                  ? roomCode.trim()
                    ? 'Join private room'
                    : 'Create private room'
                  : 'Create public room'}
              </button>
              <Link href="/practice" className="button secondary">Practice instead</Link>
            </div>
            {joinError ? <p className="meta alert-text" style={{ marginTop: 12 }}>{joinError}</p> : null}
          </div>
        ) : (
          <div className="panel" style={{ marginTop: 18 }}>
            <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p className="eyebrow">{battle.status === 'waiting' ? 'Waiting room' : battle.status === 'active' ? 'Live match' : 'Completed'}</p>
                <h2 style={{ margin: '4px 0' }}>{battle.status === 'waiting' ? 'Waiting for the second player' : battle.status === 'active' ? 'Battle in progress' : 'Battle complete'}</h2>
              </div>
              <button className="button secondary" type="button" onClick={() => setBattle(null)}>
                New battle
              </button>
            </div>
            <p className="meta" style={{ marginTop: 8 }}>
              Subject: {subjects.find((subject) => subject.id === battle.subject_id)?.name ?? 'Selected subject'} · Year:{' '}
              {battle.year ?? 'Any'} · Questions: {battle.question_count ?? '10'}
            </p>
            {battle.room_code ? <p className="meta" style={{ marginTop: 4 }}>Room code: {battle.room_code}</p> : null}
            <p className="meta" style={{ marginTop: 4 }}>
              {battle.status === 'waiting' ? 'Invite the other player and press Ready when you are both prepared.' : 'Realtime updates are flowing in from your opponent.'}
            </p>
            <div className="panel" style={{ marginTop: 12 }}>
              <p className="meta">Scoreboard</p>
              <p className="meta">
                You: {battle.participant_role === 'player_one' ? battle.player_one_score : battle.player_two_score} · Opponent: {battle.participant_role === 'player_one' ? battle.player_two_score : battle.player_one_score}
              </p>
              {battle.status === 'waiting' ? (
                <div className="actions" style={{ marginTop: 8 }}>
                  <button className="button primary" type="button" disabled={isReadying || battleReady} onClick={() => void handleReady()}>
                    {isReadying ? 'Preparing…' : battleReady ? 'Waiting for opponent' : 'Ready up'}
                  </button>
                </div>
              ) : null}
            </div>
            {battle.status === 'active' && activeQuestion ? (
              <div className="panel" style={{ marginTop: 12 }}>
                <div className="actions" style={{ marginBottom: 12 }}>
                  <button className="button secondary" type="button" onClick={previousQuestion} disabled={questionIndex === 0}>
                    Previous
                  </button>
                  <button className="button primary" type="button" onClick={nextQuestion} disabled={!battle.questions?.length || questionIndex >= battle.questions.length - 1}>
                    Next
                  </button>
                </div>
                <p className="eyebrow">Question {questionIndex + 1}/{battle.questions.length}</p>
                <h3 style={{ marginTop: 4 }}>{activeQuestion.question_text}</h3>
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  {activeQuestion.options.map((option) => {
                    const state = answerStates[activeQuestion.id];
                    return (
                      <button
                        key={`${activeQuestion.id}-${option.label}`}
                        className="button secondary"
                        type="button"
                        disabled={isSubmitting || Boolean(state?.submitted)}
                        onClick={() => void handleAnswer(activeQuestion.id, option.label)}
                      >
                        {option.label}. {option.text}
                      </button>
                    );
                  })}
                </div>
                <div className="actions" style={{ marginTop: 12 }}>
                  <button className="button secondary" type="button" disabled={isCompleting} onClick={() => void handleComplete()}>
                    {isCompleting ? 'Finishing…' : 'Finish battle'}
                  </button>
                </div>
              </div>
            ) : null}
            {joinError ? <p className="meta alert-text" style={{ marginTop: 12 }}>{joinError}</p> : null}
            {isRefreshing ? <p className="meta" style={{ marginTop: 12 }}>Refreshing battle state…</p> : null}
          </div>
        )}
      </section>
    </main>
  );
}
