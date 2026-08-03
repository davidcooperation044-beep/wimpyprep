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
  const authenticatedId = await getVerifiedUserId(request);
  if (!authenticatedId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const referrerId = url.searchParams.get('referrerId') ?? authenticatedId;

  if (referrerId !== authenticatedId) {
    return NextResponse.json({ error: 'Cannot query referral counts for another user' }, { status: 403 });
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
  const referrerBody = await request.json().catch(() => ({}));
  const { referrerId, referredId } = referrerBody as { referrerId?: string; referredId?: string };

  if (!referrerId) {
    return NextResponse.json({ error: 'referrerId is required' }, { status: 400 });
  }

  const referredUserId = await getVerifiedUserId(request);
  if (!referredUserId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (referredId && referredId !== referredUserId) {
    return NextResponse.json({ error: 'referredId must match authenticated user' }, { status: 400 });
  }

  if (referrerId === referredUserId) {
    return NextResponse.json({ error: 'A user cannot refer themselves' }, { status: 400 });
  }

  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
  }

  const { error } = await supabase.from('wp_referrals').insert([{ referrer_id: referrerId, referred_id: referredUserId }]);

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ message: 'Referral already recorded' });
    }

    return NextResponse.json({ error: 'Unable to record referral' }, { status: 500 });
  }

  return NextResponse.json({ message: 'Referral recorded' });
}
