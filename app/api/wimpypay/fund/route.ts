import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../../lib/auth';

export async function POST(request: Request) {
  const { userId, response } = await getVerifiedUserId(request, 'wimpypay:fund');
  if (response) {
    return response;
  }

  const body = await request.json().catch(() => ({}));
  const { amount, return_url } = body as { amount?: number | string; return_url?: string };

  if (!amount || Number(amount) <= 0) {
    return NextResponse.json({ error: 'amount is required' }, { status: 400 });
  }

  if (!return_url) {
    return NextResponse.json({ error: 'return_url is required' }, { status: 400 });
  }

  const wimpyPayUrl = process.env.WIMPYPAY_API_URL;
  const authToken = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';

  if (!wimpyPayUrl) {
    return NextResponse.json({ error: 'WimpyPay is not configured' }, { status: 500 });
  }

  const upstreamResponse = await fetch(`${wimpyPayUrl}/api/wallet/fund`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authToken,
    },
    body: JSON.stringify({
      amount: Number(amount),
      return_url: return_url,
      user_id: userId,
    }),
  });

  const payload = await upstreamResponse.json().catch(() => ({}));
  if (!upstreamResponse.ok) {
    return NextResponse.json(payload, { status: upstreamResponse.status });
  }

  const reference = payload.reference ?? null;
  const authorizationUrl = payload.authorizationUrl ?? payload.authorization_url ?? null;

  return NextResponse.json({
    authorizationUrl,
    reference,
  });
}
