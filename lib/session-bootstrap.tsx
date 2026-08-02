'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createClient, type Session, type User } from '@supabase/supabase-js';

type SessionContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signInUrl: string;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

function getCurrentAppUrl() {
  if (typeof window === 'undefined') {
    return '';
  }

  return `${window.location.origin}${window.location.pathname}${window.location.search}`;
}

function buildWimpyIdSignInUrl() {
  return `https://id.wimpy-corp.com.ng/login?redirect=${encodeURIComponent(getCurrentAppUrl())}`;
}

function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [signInUrl, setSignInUrl] = useState('');

  useEffect(() => {
    const supabase = createSupabaseClient();
    const nextSignInUrl = buildWimpyIdSignInUrl();
    setSignInUrl(nextSignInUrl);

    if (typeof window !== 'undefined') {
      const currentUrl = new URL(window.location.href);
      const referralId = currentUrl.searchParams.get('referral');
      if (referralId) {
        sessionStorage.setItem('wimpy_referral', referralId);
        currentUrl.searchParams.delete('referral');
        window.history.replaceState({}, '', currentUrl.toString());
      }
    }

    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const initializeSession = async () => {
      try {
        const hash = window.location.hash.replace(/^#/, '');
        if (hash) {
          const params = new URLSearchParams(hash);
          const accessToken = params.get('access_token');
          const refreshToken = params.get('refresh_token');

          if (accessToken && refreshToken) {
            const { error } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });

            if (!error) {
              window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`);
            }
          }
        }

        const {
          data: { session: nextSession },
          error,
        } = await supabase.auth.getSession();

        if (!error) {
          setSession(nextSession);
          setUser(nextSession?.user ?? null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    initializeSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user || typeof window === 'undefined') {
      return;
    }

    const pendingReferral = sessionStorage.getItem('wimpy_referral');
    if (!pendingReferral || pendingReferral === user.id) {
      return;
    }

    const registerReferral = async () => {
      await fetch('/api/referral', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referrerId: pendingReferral, referredId: user.id }),
      });
      sessionStorage.removeItem('wimpy_referral');
    };

    void registerReferral();
  }, [user]);

  const value = useMemo<SessionContextValue>(() => ({
    session,
    user,
    isLoading,
    isAuthenticated: Boolean(user),
    signInUrl,
  }), [isLoading, session, signInUrl, user]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);

  if (!context) {
    throw new Error('useSession must be used within a SessionProvider');
  }

  return context;
}
