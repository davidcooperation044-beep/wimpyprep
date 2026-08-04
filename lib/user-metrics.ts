import { type SupabaseClient } from '@supabase/supabase-js';

export type StreakRow = {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  updated_at: string;
};

export type UserMetrics = {
  streak?: StreakRow;
  accuracy: number;
  totalAttempts: number;
  totalCorrect: number;
  rank: 'Bronze' | 'Silver' | 'Gold' | 'Platinum';
};

export type LeaderboardRow = {
  user_id: string;
  current_streak: number;
  longest_streak: number;
  referralCount: number;
};

function toIsoDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  return date.toISOString().slice(0, 10);
}

export function computeRankTier(currentStreak: number, accuracy: number) {
  if (currentStreak >= 14 && accuracy >= 0.85) {
    return 'Platinum' as const;
  }
  if (currentStreak >= 10 && accuracy >= 0.75) {
    return 'Gold' as const;
  }
  if (currentStreak >= 5 && accuracy >= 0.65) {
    return 'Silver' as const;
  }
  return 'Bronze' as const;
}

export async function loadUserMetrics(supabase: SupabaseClient, userId: string): Promise<UserMetrics> {
  const { data: streakData } = await supabase
    .from('wp_streaks')
    .select('user_id,current_streak,longest_streak,last_active_date,updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  const { data: attemptsData } = await supabase
    .from('wp_attempts')
    .select('is_correct')
    .eq('user_id', userId);

  const totalAttempts = (attemptsData ?? []).length;
  const totalCorrect = (attemptsData ?? []).filter((attempt) => attempt.is_correct).length;
  const accuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : 0;

  return {
    streak: streakData ?? undefined,
    accuracy,
    totalAttempts,
    totalCorrect,
    rank: computeRankTier(streakData?.current_streak ?? 0, accuracy),
  };
}

export async function updateStreakAfterSession(supabase: SupabaseClient, userId: string) {
  const today = toIsoDate(new Date());
  const yesterday = toIsoDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

  const { data: existing, error: selectError } = await supabase
    .from('wp_streaks')
    .select('current_streak,longest_streak,last_active_date')
    .eq('user_id', userId)
    .maybeSingle();

  if (selectError && selectError.code !== 'PGRST116') {
    return null;
  }

  const currentStreak = existing?.last_active_date === today
    ? existing.current_streak
    : existing?.last_active_date === yesterday
      ? (existing.current_streak ?? 0) + 1
      : 1;

  const longestStreak = Math.max(existing?.longest_streak ?? 0, currentStreak);

  const { data: upserted } = await supabase.from('wp_streaks').upsert(
    {
      user_id: userId,
      current_streak: currentStreak,
      longest_streak: longestStreak,
      last_active_date: today,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' }
  ).select('user_id,current_streak,longest_streak,last_active_date,updated_at').single();

  return upserted as StreakRow | null;
}

export function buildReferralLink(userId: string) {
  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.origin}/?referral=${encodeURIComponent(userId)}`;
}
