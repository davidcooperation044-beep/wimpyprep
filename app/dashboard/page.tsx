'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from '../../lib/session-bootstrap';
import { createPublicSupabaseClient } from '../../lib/supabase';

type TrendPoint = { id: string; label: string; percentage: number; mode: string; };
type SubjectAccuracy = { subjectId: string; subjectName: string; accuracy: number; total: number; correct: number; };
type IncompleteSession = { id: string; mode: string; subject_ids: string[]; started_at: string; };

type DashboardPayload = {
  scoreTrends: TrendPoint[];
  accuracyBySubject: SubjectAccuracy[];
  percentileRank: number;
  incompleteSession: IncompleteSession | null;
};

function ScoreTrendChart({ points }: { points: TrendPoint[] }) {
  if (!points.length) {
    return <p className="meta">Complete sessions appear here once you finish a practice or mock exam.</p>;
  }

  const maxPercent = Math.max(...points.map((point) => point.percentage), 100);
  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 400 220" preserveAspectRatio="none" className="chart-svg">
        <defs>
          <linearGradient id="trendGradient" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#C4F135" />
            <stop offset="100%" stopColor="#D4AF37" />
          </linearGradient>
        </defs>
        <path
          d={points.map((point, index) => {
            const x = 20 + (360 * index) / Math.max(points.length - 1, 1);
            const y = 200 - (point.percentage / maxPercent) * 160;
            return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
          }).join(' ')}
          fill="none"
          stroke="url(#trendGradient)"
          strokeWidth="4"
          strokeLinecap="round"
        />
        {points.map((point, index) => {
          const x = 20 + (360 * index) / Math.max(points.length - 1, 1);
          const y = 200 - (point.percentage / maxPercent) * 160;
          return (
            <circle key={point.id} cx={x} cy={y} r="5" fill="#C4F135" />
          );
        })}
        {points.map((point, index) => {
          const x = 20 + (360 * index) / Math.max(points.length - 1, 1);
          const y = 200 - (point.percentage / maxPercent) * 160;
          return (
            <text key={`${point.id}-label`} x={x} y={y - 12} textAnchor="middle" className="chart-label">
              {Math.round(point.percentage)}%
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function SubjectAccuracyChart({ accuracy }: { accuracy: SubjectAccuracy[] }) {
  if (!accuracy.length) {
    return <p className="meta">Accuracy by subject will appear after you complete attempts across multiple subjects.</p>;
  }

  const maxValue = Math.max(...accuracy.map((item) => item.accuracy), 100);
  return (
    <div className="chart-wrap">
      <svg viewBox="0 0 400 240" preserveAspectRatio="none" className="chart-svg">
        {accuracy.map((item, index) => {
          const barWidth = 28;
          const x = 26 + index * 50;
          const height = (item.accuracy / maxValue) * 160;
          return (
            <g key={item.subjectId}>
              <rect x={x} y={200 - height} width={barWidth} height={height} fill="rgba(196,241,53,0.7)" rx="8" />
              <text x={x + barWidth / 2} y={216} textAnchor="middle" className="chart-label">
                {item.subjectName}
              </text>
              <text x={x + barWidth / 2} y={190 - height} textAnchor="middle" className="chart-label small">
                {Math.round(item.accuracy)}%
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function DashboardPage() {
  const { user, accessToken, isAuthenticated, isLoading, signInUrl } = useSession();
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [subjectSelectionCount, setSubjectSelectionCount] = useState(0);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    let active = true;
    const loadDashboard = async () => {
      const response = await fetch('/api/dashboard', {
        headers: {
          Authorization: `Bearer ${accessToken ?? ''}`,
        },
      });
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (active) {
        setDashboard(data);
        setSubjectSelectionCount(data.subjectSelectionCount ?? 0);
      }
    };

    void loadDashboard();
    return () => {
      active = false;
    };
  }, [isAuthenticated, user]);

  if (isLoading) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="meta">Loading dashboard…</p>
        </section>
      </main>
    );
  }

  if (!isAuthenticated) {
    return (
      <main className="shell">
        <section className="panel">
          <p className="eyebrow">Dashboard locked</p>
          <h1>Sign in to view your progress dashboard</h1>
          <p className="lead">Your score trends, subject breakdown, and leaderboard percentile live behind WimpyID.</p>
          <a href={signInUrl} className="button primary">Sign in with WimpyID</a>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Dashboard</p>
        <h1>Track your prep progress with clear performance insights.</h1>
        <p className="lead">Score history, subject accuracy, percentile rank, and unfinished sessions help you continue smarter.</p>
        <div className="hero-actions">
          <Link href="/settings" className="button secondary">Edit subject selection</Link>
        </div>
        <div className="stats-grid" style={{ marginTop: '20px' }}>
          <article className="stat-card">
            <strong>{dashboard?.scoreTrends.length ?? 0}</strong>
            <span>Completed sessions</span>
          </article>
          <article className="stat-card">
            <strong>{dashboard?.percentileRank ?? 0}%</strong>
            <span>Percentile vs. all users</span>
          </article>
          <article className="stat-card">
            <strong>{subjectSelectionCount}</strong>
            <span>Selected subjects</span>
          </article>
        </div>
      </section>

      {dashboard?.incompleteSession ? (
        <section className="panel">
          <div className="panel-header">
            <h2>Continue where you left off</h2>
            <span>Unfinished session</span>
          </div>
          <p className="lead">You have an incomplete {dashboard.incompleteSession.mode === 'mock_exam' ? 'mock exam' : 'practice'} session started on {new Date(dashboard.incompleteSession.started_at).toLocaleDateString()}.</p>
          <a href={dashboard.incompleteSession.mode === 'mock_exam' ? '/mock' : '/practice'} className="button primary">Resume session</a>
        </section>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <h2>Score trends</h2>
          <span>Performance over time</span>
        </div>
        <ScoreTrendChart points={dashboard?.scoreTrends ?? []} />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Subject accuracy</h2>
          <span>Topic-by-topic correctness</span>
        </div>
        <SubjectAccuracyChart accuracy={dashboard?.accuracyBySubject ?? []} />
      </section>
    </main>
  );
}
