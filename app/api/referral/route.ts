import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const referrerId = url.searchParams.get('referrerId');

  if (!referrerId) {
    return NextResponse.json({ error: 'referrerId query parameter is required' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { data: referrals, error } = await supabase
    .from('wp_referrals')
    .select('referrer_id');

  if (error) {
    return NextResponse.json({ error: 'Unable to load referral data' }, { status: 500 });
  }

  const count = (referrals ?? []).filter((referral) => referral.referrer_id === referrerId).length;

  return NextResponse.json({ referralCount: count });
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({}));
  const { referrerId, referredId } = payload as { referrerId?: string; referredId?: string };

  if (!referrerId || !referredId) {
    return NextResponse.json({ error: 'referrerId and referredId are required' }, { status: 400 });
  }

  if (referrerId === referredId) {
    return NextResponse.json({ error: 'A user cannot refer themselves' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { error } = await supabase.from('wp_referrals').insert([{ referrer_id: referrerId, referred_id: referredId }]);

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ message: 'Referral already recorded' });
    }

    return NextResponse.json({ error: 'Unable to record referral' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Referral recorded' });
}
