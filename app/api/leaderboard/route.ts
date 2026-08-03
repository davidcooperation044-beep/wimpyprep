import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';

async function getVerifiedUserId(request: Request) {
  const authorization = request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    return null;
  }

  const token = match[1];
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

export async function GET(request: Request) {
  const userId = await getVerifiedUserId(request);
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
