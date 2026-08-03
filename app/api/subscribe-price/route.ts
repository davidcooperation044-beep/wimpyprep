import { NextResponse } from 'next/server';

export async function GET() {
  const wimpyPayUrl = process.env.WIMPYPAY_API_URL;
  const internalApiKey = process.env.WIMPYPAY_INTERNAL_API_KEY;

  if (!wimpyPayUrl || !internalApiKey) {
    return NextResponse.json({ error: 'WimpyPay is not configured' }, { status: 500 });
  }

  try {
    const response = await fetch(`${wimpyPayUrl}/api/external/plan?product_name=wimpyprep&plan_name=Pro`, {
      method: 'GET',
      headers: {
        'x-internal-api-key': internalApiKey,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(data, { status: response.status });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[subscribe-price]', error);
    return NextResponse.json({ error: 'Unable to fetch upgrade price' }, { status: 500 });
  }
}
