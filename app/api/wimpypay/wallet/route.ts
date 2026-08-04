import { NextResponse } from 'next/server';
import { getVerifiedUserId } from '../../../../lib/auth';

export async function GET(request: Request) {
  const { userId, response } = await getVerifiedUserId(request, 'wimpypay:wallet');
  if (response) {
    return response;
  }

  const wimpyPayUrl = process.env.WIMPYPAY_API_URL;
  const authToken = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';

  if (!wimpyPayUrl) {
    return NextResponse.json({ error: 'WimpyPay is not configured' }, { status: 500 });
  }

  const upstreamResponse = await fetch(`${wimpyPayUrl}/api/wallet`, {
    method: 'GET',
    headers: {
      Authorization: authToken,
    },
  });

  const payload = await upstreamResponse.json().catch(() => ({}));
  if (!upstreamResponse.ok) {
    return NextResponse.json(payload, { status: upstreamResponse.status });
  }

  return NextResponse.json({
    userId,
    ...payload,
  });
}
