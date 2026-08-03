"use client";

import { useEffect, useState } from 'react';
import { SubjectSelection } from '../components/subject-selection';
import { useSession } from '../../lib/session-bootstrap';

export default function SettingsPage() {
  const { user, accessToken, isAuthenticated, isLoading, signInUrl } = useSession();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!saved) {
      return;
    }

    const timer = window.setTimeout(() => setSaved(false), 2400);
    return () => window.clearTimeout(timer);
  }, [saved]);

  if (isLoading) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="meta">Loading your settings…</p>
        </section>
      </main>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Settings locked</p>
          <h1>Sign in to manage your study plan</h1>
          <p className="lead">Your subject selection is personal to your account.</p>
          <a href={signInUrl} className="button primary">Sign in with WimpyID</a>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Settings</p>
        <h1>Adjust your exam prep focus</h1>
        <p className="lead">Update the subjects you’re offering so practice, mock exams, and your dashboard stay aligned.</p>
        {saved ? <p className="meta success">Your subject selection was updated.</p> : null}
      </section>
      <SubjectSelection onComplete={() => setSaved(true)} />
    </main>
  );
}
