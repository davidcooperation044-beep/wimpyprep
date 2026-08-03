import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../lib/supabase';

function buildReference(userId: string) {
  return `wimpyprep-${userId}-${Date.now()}`;
}

export async function POST(request: Request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.slice(7);
    const serviceSupabase = createServiceSupabaseClient();
    if (!serviceSupabase) {
      return NextResponse.json({ error: 'Supabase service client is not configured' }, { status: 500 });
    }

    const { data: userData, error: userError } = await serviceSupabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = userData.user.id;
    const body = await request.json().catch(() => ({}));
    const productName = body.product_name ?? 'wimpyprep';
    const planName = body.plan_name ?? 'Pro';
    const reference = body.reference ?? buildReference(userId);

    const wimpyPayUrl = process.env.WIMPYPAY_API_URL;
    const internalApiKey = process.env.WIMPYPAY_INTERNAL_API_KEY;

    if (!wimpyPayUrl || !internalApiKey) {
      return NextResponse.json({ error: 'WimpyPay is not configured' }, { status: 500 });
    }

    const response = await fetch(`${wimpyPayUrl}/api/external/subscribe`, {
      method: 'POST',
      headers: {
        'x-internal-api-key': internalApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        product_name: productName,
        plan_name: planName,
        reference,
      }),
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      if (data.error === 'insufficient-funds') {
        return NextResponse.json(
          {
            error: 'insufficient-funds',
            requiredAmount: data.requiredAmount,
            currentBalance: data.currentBalance,
          },
          { status: 402 }
        );
      }

      return NextResponse.json(data, { status: response.status });
    }

    await serviceSupabase.from('subscriptions').upsert(
      {
        user_id: userId,
        product_name: productName,
        plan_name: planName,
        status: 'active',
        price: data.price ?? null,
        billing_interval: data.billing_interval ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,product_name' }
    );

    return NextResponse.json({ success: true, data }, { status: 200 });
  } catch (error) {
    console.error('[subscribe]', error);
    return NextResponse.json({ error: 'Unable to process upgrade' }, { status: 500 });
  }
}
