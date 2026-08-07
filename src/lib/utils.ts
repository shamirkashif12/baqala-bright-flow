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

// Mirrors api/Services/QuantityValidation.ValidateWholeUnit server-side — a count-based
// product (weightBased === false, the default, e.g. "piece") has no meaningful fractional
// unit; only a weight/volume-based product can legitimately move a fractional quantity.
// Client-side check so the UI can reject before the round-trip, not just show the 400 toast.
export function wholeUnitQuantityError(product: { weightBased: boolean; name: string } | null | undefined, quantity: number): string | null {
  if (!product || product.weightBased) return null;
  if (!Number.isFinite(quantity) || Number.isInteger(quantity)) return null;
  return `${product.name} is tracked by piece — quantity must be a whole number.`;
}

// sessionStorage key POS (_app.pos.tsx) persists an admin's manually-picked branch under, and
// the key every `pos_holds_${branchId}` bill is filed under for that admin. Held Orders and the
// Cashier Workspace tile must resolve to the exact same branchId POS itself is using, or they
// show a different (often empty) set of held bills than POS's own badge — this previously
// happened because each screen re-derived "the current branch" from the cashier's shift instead
// of reading what POS actually persisted.
export const POS_ADMIN_BRANCH_KEY = "pos_admin_branch_id";

// Mirrors POS's own branch resolution for other screens that need to know which branch POS is
// currently keying its cart/holds under: non-admins are always locked to their own assigned
// branch (POS never lets them switch), while an admin's choice lives in sessionStorage — set as
// soon as POS resolves a branch for them, which is guaranteed to have happened already if a held
// bill exists to look up in the first place.
export function getPosBranchId(user: { role?: string | null; branchId?: string | null } | null | undefined): string | undefined {
  if (!user) return undefined;
  if (user.role !== "tenant_admin") return user.branchId ?? undefined;
  try { return sessionStorage.getItem(POS_ADMIN_BRANCH_KEY) || undefined; } catch { return undefined; }
}

// Handoff key: set by the Branches page right after creating a branch (when the admin accepts
// the "add a terminal now?" prompt) and consumed once by the Terminals page on mount to
// auto-open its "Add Terminal" sheet pre-scoped to that branch.
export const PENDING_TERMINAL_BRANCH_KEY = "pending_terminal_branch_id";

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
