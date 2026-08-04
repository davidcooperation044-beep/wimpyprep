'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProgressRing } from './components/progress-ring';
import { useSession } from '../lib/session-bootstrap';
import { createPublicSupabaseClient } from '../lib/supabase';
import { buildReferralLink, loadUserMetrics, type UserMetrics } from '../lib/user-metrics';

const defaultSubjects = ['English', 'Mathematics', 'Physics', 'Biology'];

export default function HomePage() {
  const { isAuthenticated, isLoading, signInUrl, user, accessToken } = useSession();
  const [signupUrl, setSignupUrl] = useState('');
  const [metrics, setMetrics] = useState<UserMetrics | null>(null);
  const [referralCount, setReferralCount] = useState<number | null>(null);
  const [referralUrl, setReferralUrl] = useState<string>('');
  const [progressValue, setProgressValue] = useState(0);
  const [focusSubjects, setFocusSubjects] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setSignupUrl(`https://id.wimpy-corp.com.ng/signup?redirect=${encodeURIComponent(window.location.href)}`);
    }
    if (!isAuthenticated || !user) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    let active = true;
    const loadMetrics = async () => {
      const loaded = await loadUserMetrics(supabase, user.id);
      if (active) {
        setMetrics(loaded);
        setReferralUrl(buildReferralLink(user.id));
        setProgressValue(Math.round(loaded.accuracy * 100));
      }

      const response = await fetch('/api/referral', {
        headers: {
          Authorization: `Bearer ${accessToken ?? ''}`,
        },
      });
      if (response.ok) {
        const data = await response.json();
        if (active) {
          setReferralCount(data.referralCount ?? 0);
        }
      }
    };

    void loadMetrics();
    return () => {
      active = false;
    };
  }, [isAuthenticated, user]);

  useEffect(() => {
    if (!isAuthenticated || !user || !accessToken) {
      setFocusSubjects([]);
      return;
    }

    let active = true;
    const loadFocusSubjects = async () => {
      const response = await fetch('/api/user-subjects', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        return;
      }

      const data = (await response.json().catch(() => ({ selections: [] }))) as { selections?: unknown };
      if (!active) {
        return;
      }

      const names: string[] = Array.isArray(data?.selections)
        ? Array.from(
            new Set(
              data.selections
                .map((item: unknown) => {
                  if (item && typeof item === 'object' && 'name' in item) {
                    const nameValue = (item as { name?: unknown }).name;
                    return typeof nameValue === 'string' ? nameValue : null;
                  }
                  return null;
                })
                .filter((value): value is string => typeof value === 'string')
            )
          )
        : [];
      setFocusSubjects(names);
    };

    void loadFocusSubjects();
    return () => {
      active = false;
    };
  }, [accessToken, isAuthenticated, user]);

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">The Sprint</p>
        <h1>Train like exam day is already ticking.</h1>
        <p className="lead">
          Practice faster, mock harder, and sharpen your weak areas with AI-guided prep built for JAMB and WAEC.
        </p>

        {isLoading ? (
          <p className="meta">Checking your WimpyID session…</p>
        ) : isAuthenticated ? (
          <div className="feedback">
            <p>Signed in as {user?.email ?? 'your Wimpy account'}.</p>
            <p>
              Streak: {metrics?.streak?.current_streak ?? 0} days · Rank: {metrics?.rank ?? 'Bronze'} · Accuracy: {metrics ? `${Math.round(metrics.accuracy * 100)}%` : '0%'}
            </p>
          </div>
        ) : (
          <div className="feedback">
            <p>Sign in to track your progress, streaks, and mock-exam history.</p>
            <div className="hero-actions">
              <a href={signInUrl} className="button primary">Sign in with WimpyID</a>
              <a href={signupUrl || 'https://id.wimpy-corp.com.ng/signup'} className="button secondary">Sign up with WimpyID</a>
            </div>
          </div>
        )}

        <div className="actions">
          {isAuthenticated ? (
            <>
              <Link href="/practice" className="button primary">Start Practice</Link>
              <Link href="/mock" className="button secondary">Take Mock Exam</Link>
              <Link href="/dashboard" className="button outline">Open Dashboard</Link>
              <Link href="/leaderboard" className="button outline">View Leaderboard</Link>
              <Link href="/battle" className="button secondary">Live Exam Battle</Link>
              <Link href="/" className="button secondary theme-toggle-placeholder">Theme</Link>
            </>
          ) : (
            <span className="meta">Practice and mock modes are locked until you sign in.</span>
          )}
        </div>

        {isAuthenticated ? (
          <div className="panel meta">
            <p>
              Invite friends to join WimpyPrep and earn leaderboard credit. Your referral link is below.
            </p>
            <p>
              <strong>Invites:</strong> {referralCount ?? 0}
            </p>
            <code className="copy-link">{referralUrl || 'Loading your referral link…'}</code>
          </div>
        ) : null}

        <ProgressRing value={progressValue} label="session progress" />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Focus subjects</h2>
          <span>Mobile-first study sprint</span>
        </div>
        <div className="subject-grid">
          {(focusSubjects.length ? focusSubjects : defaultSubjects).map((subject) => (
            <div key={subject} className="chip">{subject}</div>
          ))}
        </div>
      </section>

      <section className="stats-grid">
        <article className="stat-card">
          <strong>4.8/5</strong>
          <span>Study flow satisfaction</span>
        </article>
        <article className="stat-card">
          <strong>Adaptive review</strong>
          <span>Session-specific focus recommendations</span>
        </article>
        <article className="stat-card">
          <strong>24/7</strong>
          <span>Offline-ready practice</span>
        </article>
      </section>
    </main>
  );
}
