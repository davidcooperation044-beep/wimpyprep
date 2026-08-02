import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const userId = url.searchParams.get('userId');

  if (!userId) {
    return NextResponse.json({ error: 'userId query parameter is required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const [{ data: streaks, error: streakError }, { data: referrals, error: referralError }] = await Promise.all([
    supabase
      .from('wp_streaks')
      .select('user_id,current_streak,longest_streak')
      .order('current_streak', { ascending: false })
      .limit(50),
    supabase
      .from('wp_referrals')
      .select('referrer_id'),
  ]);

  if (streakError || referralError) {
    return NextResponse.json({ error: 'Unable to load leaderboard' }, { status: 500 });
  }

  const referralMap = new Map<string, number>();
  (referrals ?? []).forEach((row: any) => {
    const count = referralMap.get(row.referrer_id) ?? 0;
    referralMap.set(row.referrer_id, count + 1);
  });

  const top = (streaks ?? [])
    .map((row: any) => ({
      user_id: row.user_id,
      current_streak: row.current_streak,
      longest_streak: row.longest_streak,
      referral_count: referralMap.get(row.user_id) ?? 0,
    }))
    .sort((a, b) => {
      if (b.current_streak !== a.current_streak) {
        return b.current_streak - a.current_streak;
      }
      return b.referral_count - a.referral_count;
    })
    .slice(0, 20);

  const personalRank = top.findIndex((row) => row.user_id === userId) + 1 || null;

  return NextResponse.json({ top, personalRank });
}
