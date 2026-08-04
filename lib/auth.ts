import { NextResponse } from 'next/server';
import { createServiceSupabaseClient } from './supabase';

export async function getVerifiedUserId(request: Request, context = 'request') {
  const authorization = request.headers.get('authorization') ?? request.headers.get('Authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const isLocalRequest = request.url.includes('localhost') || request.url.includes('127.0.0.1');
  const isDevelopment = process.env.NODE_ENV !== 'production';

  if (!match) {
    if (isDevelopment && isLocalRequest) {
      return { userId: 'local-dev-user', response: null };
    }

    console.error(`[auth] Missing bearer token for ${context}`);
    return {
      userId: null as string | null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  const token = match[1];
  const supabase = createServiceSupabaseClient();
  if (!supabase) {
    if (isDevelopment && isLocalRequest) {
      return { userId: 'local-dev-user', response: null };
    }

    console.error(`[auth] Missing Supabase service role key while verifying ${context}`);
    return {
      userId: null as string | null,
      response: NextResponse.json({ error: 'Server misconfigured' }, { status: 500 }),
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    if (isDevelopment && isLocalRequest) {
      return { userId: 'local-dev-user', response: null };
    }

    console.error(`[auth] Unable to verify user for ${context}`, error);
    return {
      userId: null as string | null,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  return { userId: data.user.id, response: null };
}
