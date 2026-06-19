import React from "react";

/** Official Saudi Riyal symbol — inline SVG, scales with surrounding text */
export function SARIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 26"
      fill="currentColor"
      className={className ?? "inline-block h-[0.85em] w-auto align-[-0.05em] mx-[0.1em]"}
      aria-label="SAR"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left vertical stroke with Arabic-style curved base */}
      <path d="M4.5 1 L3.5 15 Q3 19.5 7 20 L11 20 L11 18.5 L7.5 18.5 Q5.5 18.2 5.5 15.5 L6.5 1 Z" />
      {/* Right vertical stroke */}
      <path d="M10.5 1 L9.5 18.5 L11 18.5 L12 1 Z" />
      {/* Top diagonal bar */}
      <path d="M3 9 L26 3 L26 4.8 L3 10.8 Z" />
      {/* Middle diagonal bar */}
      <path d="M3 12.5 L26 6.5 L26 8.3 L3 14.3 Z" />
      {/* Bottom diagonal bar */}
      <path d="M6 16 L26 10 L26 11.8 L6 17.8 Z" />
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
