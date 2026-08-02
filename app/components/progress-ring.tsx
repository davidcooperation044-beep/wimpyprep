'use client';

import { useMemo } from 'react';

type ProgressRingProps = {
  value: number;
  label: string;
  size?: number;
};

export function ProgressRing({ value, label, size = 108 }: ProgressRingProps) {
  const safeValue = Math.max(0, Math.min(100, value));

  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (safeValue / 100) * circumference;
  const milestone = useMemo(() => {
    if (safeValue >= 100) return '100%';
    if (safeValue >= 75) return '75%';
    if (safeValue >= 50) return '50%';
    if (safeValue >= 25) return '25%';
    return '0%';
  }, [safeValue]);

  return (
    <div className="progress-ring-wrap" aria-label={label}>
      <svg width={size} height={size} viewBox="0 0 120 120" className="progress-ring-svg">
        <circle cx="60" cy="60" r={radius} className="ring-track" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          className="ring-progress"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="ring-center">
        <strong>{Math.round(safeValue)}%</strong>
        <span>{milestone}</span>
      </div>
    </div>
  );
}
