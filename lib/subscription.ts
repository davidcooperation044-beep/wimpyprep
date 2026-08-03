import { type SupabaseClient } from '@supabase/supabase-js';

export const FREE_PRACTICE_DAILY_LIMIT = 15;

export async function getSubscriptionStatus(supabase: SupabaseClient, userId: string) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('user_id', userId)
    .eq('status', 'active')
    .limit(1)
    .single();

  if (error) {
    return { active: false, error };
  }

  return { active: Boolean(data), error: null };
}

export async function getTodayPracticeCount(supabase: SupabaseClient, userId: string) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(startOfDay.getDate() + 1);

  const { count, error } = await supabase
    .from('wp_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('created_at', startOfDay.toISOString())
    .lt('created_at', endOfDay.toISOString());

  if (error) {
    return { count: 0, error };
  }

  return { count: count ?? 0, error: null };
}
