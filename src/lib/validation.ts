// Shared field-format validators — several forms across the app (Employees, Warehouses, Branches,
// Suppliers, Purchase Orders) accepted a phone/CR/VAT field with no format check at all. One
// definition here so every form validates the same way instead of drifting per-file.

// Saudi mobile: 05XXXXXXXX (10 digits) or +9665XXXXXXXX/9665XXXXXXXX (12 digits with country code).
// Rejects anything containing letters or other stray characters outright — stripping non-digits
// before checking (the previous approach) let junk like "a0b5c1d2e3f4g5h6i7j8" through, since the
// leftover digits alone happened to form a valid-looking 10-digit number.
export function isValidSaudiPhone(phone: string): boolean {
  const trimmed = phone.trim();
  if (!/^\+?\d+$/.test(trimmed)) return false;
  const digits = trimmed.replace(/^\+/, "");
  return /^05\d{8}$/.test(digits) || /^9665\d{8}$/.test(digits);
}

// Saudi Commercial Registration number: 10 digits.
export function isValidSaudiCr(cr: string): boolean {
  return /^\d{10}$/.test(cr.trim());
}

// Saudi VAT registration number: 15 digits, starts and ends with 3 per ZATCA's format.
export function isValidSaudiVat(vat: string): boolean {
  return /^3\d{13}3$/.test(vat.trim());
}

export const PHONE_MAX_LENGTH = 15;
export const CONTACT_PERSON_MAX_LENGTH = 100;

// Letters only (Latin or Arabic script) plus the punctuation real names use (space, hyphen,
// apostrophe, dot) — the `u` flag is required for the \p{Script=...} Unicode property escape.
const NAME_REGEX = /^[A-Za-z\p{Script=Arabic}][A-Za-z\p{Script=Arabic} .'-]{1,99}$/u;
const NAME_STRIP_REGEX = /[^A-Za-z\p{Script=Arabic} .'-]/gu;

// Contact person: a human name — mirrors ContactValidation.IsValidContactPersonName server-side.
// No digits, no other special characters.
export function isValidContactPersonName(name: string): boolean {
  return NAME_REGEX.test(name.trim());
}

// Strips anything but digits, capped at PHONE_MAX_LENGTH — used to sanitize phone input as-typed.
export function sanitizePhoneInput(value: string): string {
  return value.replace(/\D/g, "").slice(0, PHONE_MAX_LENGTH);
}

// Strips digits/other special characters from a name field as-typed, keeping it letters-only.
export function sanitizeNameInput(value: string): string {
  return value.replace(NAME_STRIP_REGEX, "").slice(0, CONTACT_PERSON_MAX_LENGTH);
}

// Saudi National ID / Iqama number: 10 digits.
export function isValidSaudiNationalId(id: string): boolean {
  return /^\d{10}$/.test(id.trim());
}

export const NATIONAL_ID_MAX_LENGTH = 10;

// Generic digits-only sanitizer for numeric-only fields (National ID, bank account number, …)
// that don't have a fixed Saudi format of their own — strips non-digits, caps at maxLength.
export function sanitizeDigitsInput(value: string, maxLength: number): string {
  return value.replace(/\D/g, "").slice(0, maxLength);
}

// Saudi IBAN: "SA" followed by 22 digits (24 characters total, ignoring spaces).
export function isValidSaudiIban(iban: string): boolean {
  return /^SA\d{22}$/.test(iban.replace(/\s/g, "").toUpperCase());
}

export const IBAN_MAX_LENGTH = 24;

// Uppercases and strips anything but letters/digits, capped at IBAN_MAX_LENGTH.
export function sanitizeIbanInput(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, IBAN_MAX_LENGTH);
}

export const BANK_ACCOUNT_MAX_LENGTH = 34;

// Bank account numbers vary in length by bank — no fixed Saudi format, just digits-only,
// a sane minimum, and IBAN_MAX_LENGTH as a generous upper bound.
export function isValidBankAccountNumber(value: string): boolean {
  return /^\d{5,34}$/.test(value.trim());
}
