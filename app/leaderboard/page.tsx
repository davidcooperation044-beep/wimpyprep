'use client';

import { useEffect, useState } from 'react';
import { useSession } from '../../lib/session-bootstrap';
import { createPublicSupabaseClient } from '../../lib/supabase';

type LeaderboardRow = {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  referral_count: number;
};

export default function LeaderboardPage() {
  const { user, isAuthenticated, isLoading, signInUrl } = useSession();
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [personalRank, setPersonalRank] = useState<number | null>(null);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    const supabase = createPublicSupabaseClient();
    if (!supabase) {
      return;
    }

    let active = true;
    const loadLeaderboard = async () => {
      const response = await fetch(`/api/leaderboard?userId=${encodeURIComponent(user.id)}`);
      if (!response.ok) {
        return;
      }

      const data = await response.json();
      if (active) {
        setLeaderboard(data.top || []);
        setPersonalRank(data.personalRank ?? null);
      }
    };

    void loadLeaderboard();
    return () => {
      active = false;
    };
  }, [isAuthenticated, user]);

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
          <p className="eyebrow">Leaderboard locked</p>
          <h1>Sign in to view your rank</h1>
          <p className="lead">Only signed-in users can see streak leadership and referral rankings.</p>
          <a href={signInUrl} className="button primary">Sign in with WimpyID</a>
        </section>
      </main>
    );
  }

  return (
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">Leaderboard</p>
        <h1>See who is leading the WimpyPrep challenge.</h1>
        <p className="lead">Sorted by streak and referral power, this leaderboard highlights the most consistent exam preppers.</p>
        {personalRank ? (
          <p className="meta">Your current position: #{personalRank}</p>
        ) : (
          <p className="meta">Keep studying to enter the top ranks.</p>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Top streak leaders</h2>
          <span>Built-in leaderboard</span>
        </div>
        <div className="leaderboard-list">
          {leaderboard.length === 0 ? (
            <p className="lead">No ranked streaks available yet.</p>
          ) : (
            <ol>
              {leaderboard.map((row, index) => (
                <li key={row.user_id} className={row.user_id === user?.id ? 'active' : ''}>
                  <div>
                    <strong>#{index + 1}</strong> {row.user_id.slice(0, 8)}
                  </div>
                  <div className="leaderboard-meta">
                    <span>{row.current_streak} day streak</span>
                    <span>Best {row.longest_streak}</span>
                    <span>{row.referral_count} referrals</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>
    </main>
  );
}
