import React from "react";

/** Official Saudi Riyal symbol — inline SVG, scales with surrounding text */
export function SARIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 100 111.11"
      fill="currentColor"
      className={className ?? "inline-block h-[0.85em] w-auto align-[-0.05em] mx-[0.1em]"}
      aria-label="SAR"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M 100 66.16 L 97.22 80.3 L 60.61 87.88 L 58.59 63.89 L 50 64.9 L 47.22 84.6 L 38.38 94.44 L 0 102.78 L 4.29 89.14 L 33.84 81.82 L 35.35 68.94 L 7.32 74.75 L 5.56 66.67 L 9.6 61.11 L 34.85 56.06 L 35.35 42.93 L 36.11 8.08 L 47.22 0 L 47.22 50 L 54.29 52.02 L 58.59 49.75 L 57.32 16.41 L 70.71 6.06 L 70.45 47.22 L 99.24 41.41 L 100 47.98 L 96.21 55.56 L 70.45 60.61 L 70.45 69.95 Z M 99.24 94.44 L 97.47 102.53 L 78.79 108.59 L 58.59 111.11 L 58.59 107.32 L 62.63 96.97 L 95.96 88.89 Z" />
    </svg>
  );
}

/** Format a number as SAR amount string (no symbol — pair with <SARIcon />) */
export function fmtSAR(n: number, decimals = 2): string {
  return n.toLocaleString("en-SA", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/** Inline amount with SAR icon: <SARIcon /> 1,234.56 */
export function SAR({ amount, decimals = 2, className }: { amount: number; decimals?: number; className?: string }) {
  return (
    <span className={className}>
      <SARIcon />
      {fmtSAR(amount, decimals)}
    </span>
  );
}
