import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from '../../../../lib/supabase';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { product_name, plan_name, reference } = body as {
      product_name?: string;
      plan_name?: string;
      reference?: string;
    };

    // Validate required fields
    if (!product_name || !plan_name || !reference) {
      return NextResponse.json(
        { error: 'product_name, plan_name, and reference are required' },
        { status: 400 }
      );
    }

    // Get authenticated user from authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'Unauthorized: missing or invalid Bearer token' },
        { status: 401 }
      );
    }

    const token = authHeader.slice(7);
    const supabase = createServiceSupabaseClient();
    if (!supabase) {
      return NextResponse.json(
        { error: 'Supabase service client is not configured' },
        { status: 500 }
      );
    }

    // Verify user from token
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) {
      return NextResponse.json(
        { error: 'Unauthorized: invalid token' },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // Call WimpyPay to subscribe
    const wimpyPayUrl = process.env.WIMPYPAY_API_URL;
    const internalApiKey = process.env.WIMPYPAY_INTERNAL_API_KEY;

    if (!wimpyPayUrl || !internalApiKey) {
      return NextResponse.json(
        { error: 'WimpyPay is not configured' },
        { status: 500 }
      );
    }

    const subscribeResponse = await fetch(`${wimpyPayUrl}/api/external/subscribe`, {
      method: 'POST',
      headers: {
        'x-internal-api-key': internalApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        product_name,
        plan_name,
        reference,
      }),
    });

    if (!subscribeResponse.ok) {
      const error = await subscribeResponse.json().catch(() => ({
        error: 'Unknown WimpyPay error',
      }));

      // If insufficient funds, return that specific error
      if (error.error === 'insufficient-funds') {
        return NextResponse.json(
          {
            error: 'insufficient-funds',
            requiredAmount: error.requiredAmount,
            currentBalance: error.currentBalance,
          },
          { status: 402 }
        );
      }

      return NextResponse.json(error, { status: subscribeResponse.status });
    }

    const subscriptionData = await subscribeResponse.json();

    // Upsert subscription in local database
    const { error: upsertError } = await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id: userId,
          product_name,
          plan_name,
          status: 'active',
          price: subscriptionData.price,
          billing_interval: subscriptionData.billing_interval,
          started_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,product_name',
        }
      );

    if (upsertError) {
      console.error('[Subscription Upsert Error]', upsertError);
      // Still return success to WimpyPay even if local sync fails
      // The subscription is active on WimpyPay side
      return NextResponse.json(
        { success: true, warning: 'Subscription created but local sync failed' },
        { status: 200 }
      );
    }

    return NextResponse.json(
      { success: true, subscription: subscriptionData },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Subscribe Error]', error);
    return NextResponse.json(
      { error: 'Failed to process subscription' },
      { status: 500 }
    );
  }
}
