import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const productName = searchParams.get('product_name');
  const planName = searchParams.get('plan_name');

  if (!productName || !planName) {
    return NextResponse.json(
      { error: 'product_name and plan_name query parameters are required' },
      { status: 400 }
    );
  }

  const wimpyPayUrl = process.env.WIMPYPAY_API_URL;
  const internalApiKey = process.env.WIMPYPAY_INTERNAL_API_KEY;

  if (!wimpyPayUrl || !internalApiKey) {
    return NextResponse.json(
      { error: 'WimpyPay is not configured' },
      { status: 500 }
    );
  }

  try {
    const response = await fetch(`${wimpyPayUrl}/api/external/plan?product_name=${encodeURIComponent(productName)}&plan_name=${encodeURIComponent(planName)}`, {
      method: 'GET',
      headers: {
        'x-internal-api-key': internalApiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      return NextResponse.json(error, { status: response.status });
    }

    const data = await response.json();
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('[WimpyPay Plan Error]', error);
    return NextResponse.json(
      { error: 'Failed to fetch plan details from WimpyPay' },
      { status: 500 }
    );
  }
}
