"use client";

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useSession } from '../../lib/session-bootstrap';

export default function BattlePage() {
  const { isAuthenticated, user, signInUrl } = useSession();
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const [year, setYear] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const canJoin = useMemo(() => Boolean(isAuthenticated && user && selectedSubjectId), [isAuthenticated, selectedSubjectId, user]);

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
            <button className="button primary" type="button" disabled={!canJoin || isJoining} onClick={() => setIsJoining(true)}>
              {isJoining ? 'Joining…' : 'Join lobby'}
            </button>
            <Link href="/practice" className="button secondary">Practice instead</Link>
          </div>
          <p className="meta" style={{ marginTop: 12 }}>
            Premium-year matches are gated for Pro subscribers and will unlock once you upgrade.
          </p>
        </div>
      </section>
    </main>
  );
}
