import { NextResponse } from 'next/server';

export async function GET() {
  const token = process.env.ALOC_ACCESS_TOKEN;

  if (!token) {
    return NextResponse.json({ error: 'ALOC access token is not configured.' }, { status: 500 });
  }

  return NextResponse.json({
    message: 'ALOC ingestion hook is ready.',
    tokenConfigured: true,
  });
}
