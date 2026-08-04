"use client";

import { useEffect, useMemo, useRef, useState } from 'react';

export function useWalletFundingReturn({
  enabled,
  onResolved,
  accessToken,
  expectedMinimumBalance,
}: {
  enabled: boolean;
  onResolved?: () => void;
  accessToken?: string | null;
  expectedMinimumBalance?: number | null;
}) {
  const [isConfirming, setIsConfirming] = useState(false);
  const [fundingError, setFundingError] = useState<string | null>(null);
  const [fundingSucceeded, setFundingSucceeded] = useState(false);
  const timeoutRef = useRef<number | null>(null);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const fundingPending = params.get('funding') === 'pending';
    const reference = params.get('reference');

    if (!fundingPending || !reference) {
      return;
    }

    setIsConfirming(true);
    setFundingError(null);
    setFundingSucceeded(false);

    const cleanupUrl = () => {
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('funding');
      nextUrl.searchParams.delete('reference');
      window.history.replaceState({}, '', nextUrl.toString());
    };

    let settled = false;
    let attempts = 0;
    const maxAttempts = 15;

    const pollWallet = async () => {
      if (settled) {
        return;
      }

      attempts += 1;
      try {
        const response = await fetch('/api/wimpypay/wallet', {
          headers: {
            Authorization: `Bearer ${accessToken ?? ''}`,
          },
        });

        if (response.ok) {
          const data = await response.json().catch(() => null);
          const balance = Number(data?.balance ?? data?.wallet?.balance ?? 0);
          const minimumBalance = Number(expectedMinimumBalance ?? 0);
          const balanceReady = Number.isFinite(balance) && balance >= (minimumBalance > 0 ? minimumBalance : 1);
          if (balanceReady) {
            settled = true;
            cleanupUrl();
            setFundingSucceeded(true);
            setIsConfirming(false);
            onResolved?.();
            return;
          }
        }
      } catch {
        // Ignore transient polling errors and continue until timeout.
      }

      if (attempts >= maxAttempts) {
        settled = true;
        cleanupUrl();
        setFundingError('Still processing — try again in a moment.');
        setIsConfirming(false);
        return;
      }

      intervalRef.current = window.setTimeout(() => {
        void pollWallet();
      }, 2000);
    };

    void pollWallet();

    timeoutRef.current = window.setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      cleanupUrl();
      setFundingError('Still processing — try again in a moment.');
      setIsConfirming(false);
    }, 30000);

    return () => {
      settled = true;
      if (intervalRef.current) {
        window.clearTimeout(intervalRef.current);
      }
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, [accessToken, enabled, expectedMinimumBalance, onResolved]);

  return useMemo(() => ({
    isConfirming,
    fundingError,
    fundingSucceeded,
  }), [fundingError, fundingSucceeded, isConfirming]);
}
