import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// `date.toISOString().slice(0, 10)` converts to UTC first, which silently rolls the date
// back a day for any positive-UTC-offset timezone (e.g. Riyadh, UTC+3) during the early
// hours of the local day. Use the local calendar date instead for "today"/date-only fields.
export function localDateStr(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// crypto.randomUUID() only exists in secure contexts (HTTPS/localhost); on plain-HTTP
// deployments it's undefined and throws. Fall back to a Math.random-based v4 UUID there.
export function uuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
