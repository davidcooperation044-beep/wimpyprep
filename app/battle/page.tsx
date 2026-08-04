"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from '../../lib/session-bootstrap';

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

export default function BattlePage() {
  const { isAuthenticated, user, signInUrl } = useSession();
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [year, setYear] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinedLobby, setJoinedLobby] = useState<string | null>(null);

  const canJoin = useMemo(() => Boolean(isAuthenticated && user && selectedSubjectId), [isAuthenticated, selectedSubjectId, user]);

  const handleJoinLobby = async () => {
    if (!user || !canJoin) {
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      const result = await createBattleLobby(selectedSubjectId, year, user.id);
      setJoinedLobby(result?.lobbyId ?? 'joined');
    } catch (error) {
      setJoinError(error instanceof Error ? error.message : 'Unable to join a battle lobby.');
    } finally {
      setIsJoining(false);
    }
  };

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
        <div className="panel" style={{ marginTop: 18 }}>
          <label className="subject-picker-label">
            <span>Subject</span>
            <select className="option" value={selectedSubjectId} onChange={(event) => setSelectedSubjectId(event.target.value)}>
              <option value="">Choose a subject</option>
              <option value="english">English</option>
              <option value="mathematics">Mathematics</option>
              <option value="physics">Physics</option>
              <option value="biology">Biology</option>
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
          {joinedLobby ? <p className="meta" style={{ marginTop: 12 }}>Lobby ready: {joinedLobby}</p> : null}
          <p className="meta" style={{ marginTop: 12 }}>
            Premium-year matches are gated for Pro subscribers and will unlock once you upgrade.
          </p>
        </div>
      </section>
    </main>
  );
}
