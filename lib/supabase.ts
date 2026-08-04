import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let publicSupabaseClient: SupabaseClient | null = null;
let serviceSupabaseClient: SupabaseClient | null = null;

export function createPublicSupabaseClient() {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  if (!publicSupabaseClient) {
    publicSupabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }

  return publicSupabaseClient;
}

export function createServiceSupabaseClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  if (!serviceSupabaseClient) {
    serviceSupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return serviceSupabaseClient;
}

export type SupabaseClientLike = SupabaseClient | null;
