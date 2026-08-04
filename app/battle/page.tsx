"use client";

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  questions: BattleQuestion[];
  answered_question_ids: string[];
  player_one_score: number;
  player_two_score: number;
  participant_role: 'player_one' | 'player_two' | null;
  opponent_id: string | null;
};

async function createBattleLobby(subjectId: string, year: string, userId: string) {
  const response = await fetch('/api/battle', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subjectId, year, userId }),
  });

  if (!response.ok) {
    throw new Error('Unable to join a battle lobby right now.');
  }

  return response.json();
}

async function fetchBattleDetail(battleId: string) {
  const response = await fetch(`/api/battle/${battleId}`);
  if (!response.ok) {
    throw new Error('Unable to load the latest battle state.');
  }

  return response.json() as Promise<{ battle: BattleDetail }>;
}

async function submitBattleAnswer(battleId: string, questionId: string, selectedOption: string) {
  const response = await fetch(`/api/battle/${battleId}/answers`, {
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

export default function BattlePage() {
  const { isAuthenticated, user, signInUrl } = useSession();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [year, setYear] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [battle, setBattle] = useState<BattleDetail | null>(null);
  const [battleId, setBattleId] = useState<string | null>(null);

  const canJoin = useMemo(() => Boolean(isAuthenticated && user && selectedSubjectId), [isAuthenticated, selectedSubjectId, user]);

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

  const handleJoinLobby = async () => {
    if (!user || !canJoin) {
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      const result = await createBattleLobby(selectedSubjectId, year, user.id);
      setBattleId(result?.battle?.id ?? null);
      setBattle(result?.battle ?? null);
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to join a battle lobby.');
    } finally {
      setIsJoining(false);
    }
  };

  const handleAnswer = async (questionId: string, selectedOption: string) => {
    if (!battleId || !battle) {
      return;
    }

    setIsSubmitting(true);
    try {
      await submitBattleAnswer(battleId, questionId, selectedOption);
      await refreshBattle(battleId);
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

    const answeredIds = new Set(battle.answered_question_ids ?? []);
    return battle.questions.find((question) => !answeredIds.has(question.id)) ?? battle.questions[0] ?? null;
  }, [battle]);

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
        <p className="lead">Choose a subject, optionally pick a premium year, and join the next available lobby.</p>
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
            <div className="actions">
              <button className="button primary" type="button" disabled={!canJoin || isJoining} onClick={() => void handleJoinLobby()}>
                {isJoining ? 'Joining…' : 'Join lobby'}
              </button>
              <Link href="/practice" className="button secondary">Practice instead</Link>
            </div>
            {joinError ? <p className="meta alert-text" style={{ marginTop: 12 }}>{joinError}</p> : null}
            <p className="meta" style={{ marginTop: 12 }}>
              Premium-year matches are gated for Pro subscribers and will unlock once you upgrade.
            </p>
          </div>
        ) : (
          <div className="panel" style={{ marginTop: 18 }}>
            <div className="actions" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p className="eyebrow">{battle.status === 'waiting' ? 'Waiting room' : 'Live match'}</p>
                <h2 style={{ margin: '4px 0' }}>{battle.status === 'waiting' ? 'Waiting for an opponent' : 'Battle in progress'}</h2>
              </div>
              <button className="button secondary" type="button" onClick={() => setBattle(null)}>
                New battle
              </button>
            </div>
            <p className="meta" style={{ marginTop: 8 }}>
              Subject: {subjects.find((subject) => subject.id === battle.subject_id)?.name ?? 'Selected subject'} · Year:{' '}
              {battle.year ?? 'Any'}
            </p>
            <p className="meta" style={{ marginTop: 4 }}>
              {battle.status === 'waiting' ? 'You&apos;re in the queue. Another learner can join you at any time.' : 'Realtime updates are flowing in from your opponent.'}
            </p>
            <div className="panel" style={{ marginTop: 12 }}>
              <p className="meta">Scoreboard</p>
              <p className="meta">You: {battle.player_one_score + (battle.participant_role === 'player_two' ? 0 : 0)} · Opponent: {battle.player_two_score}</p>
            </div>
            {battle.status !== 'waiting' && activeQuestion ? (
              <div className="panel" style={{ marginTop: 12 }}>
                <p className="eyebrow">Current question</p>
                <h3 style={{ marginTop: 4 }}>{activeQuestion.question_text}</h3>
                <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
                  {activeQuestion.options.map((option) => (
                    <button
                      key={`${activeQuestion.id}-${option.label}`}
                      className="button secondary"
                      type="button"
                      disabled={isSubmitting || battle.answered_question_ids.includes(activeQuestion.id)}
                      onClick={() => void handleAnswer(activeQuestion.id, option.label)}
                    >
                      {option.label}. {option.text}
                    </button>
                  ))}
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
