"use client";

import { useEffect, useMemo, useState } from 'react';
import { useSession } from '../../lib/session-bootstrap';

export type UpgradePlan = {
  product_name?: string;
  plan_name?: string;
  price?: number | string;
  billing_interval?: string;
  currency?: string;
};

type UpgradeModalProps = {
  open: boolean;
  onClose: () => void;
  onSuccess?: () => void;
};

export function UpgradeModal({ open, onClose, onSuccess }: UpgradeModalProps) {
  const [plan, setPlan] = useState<UpgradePlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const { accessToken } = useSession();

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;
    const loadPlan = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch('/api/subscribe-price');
        const data = await response.json().catch(() => null);
        if (!cancelled) {
          if (!response.ok) {
            setError(data?.error ?? 'Unable to load pricing right now.');
          } else {
            setPlan(data as UpgradePlan);
          }
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadPlan();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const priceLabel = useMemo(() => {
    if (!plan?.price) {
      return 'Loading price…';
    }

    const amount = Number(plan.price);
    if (Number.isNaN(amount)) {
      return String(plan.price);
    }

    return `${plan.currency ?? 'NGN'} ${amount.toFixed(0)}`;
  }, [plan]);

  const handleUpgrade = async () => {
    setIsProcessing(true);
    setError(null);
    try {
      const response = await fetch('/api/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken ?? ''}`,
        },
        body: JSON.stringify({ product_name: plan?.product_name ?? 'wimpyprep', plan_name: plan?.plan_name ?? 'Pro' }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (data?.error === 'insufficient-funds') {
          setError('Your wallet balance is too low. Fund your wallet and try again.');
        } else {
          setError(data?.error ?? 'Unable to complete your upgrade right now.');
        }
        return;
      }

      setIsSuccess(true);
      onSuccess?.();
    } finally {
      setIsProcessing(false);
    }
  };

  if (!open) {
    return null;
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Upgrade to Pro">
      <div className="modal-card">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Upgrade</p>
            <h3>Unlock WimpyPrep Pro</h3>
          </div>
          <button className="button ghost" onClick={onClose} type="button">
            Close
          </button>
        </div>

        <p className="lead">Get unlimited mock exams, priority AI guidance, and full access to Pro features.</p>

        {isLoading ? <p className="meta">Loading pricing…</p> : null}
        {error ? <p className="meta danger">{error}</p> : null}
        {isSuccess ? <p className="meta success">Upgrade completed successfully.</p> : null}

        {!isLoading && !error ? (
          <div className="upgrade-card">
            <div className="upgrade-price-row">
              <span className="eyebrow">Plan</span>
              <strong>{plan?.plan_name ?? 'Pro'}</strong>
            </div>
            <div className="upgrade-price-row">
              <span className="eyebrow">Price</span>
              <strong>{priceLabel}</strong>
            </div>
            <div className="upgrade-price-row">
              <span className="eyebrow">Billing</span>
              <strong>{plan?.billing_interval ?? 'monthly'}</strong>
            </div>
          </div>
        ) : null}

        <div className="modal-actions">
          <button className="button primary" onClick={() => void handleUpgrade()} disabled={isProcessing || isLoading} type="button">
            {isProcessing ? 'Processing…' : 'Upgrade now'}
          </button>
        </div>
      </div>
    </div>
  );
}
