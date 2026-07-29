// Shared field-format validators — several forms across the app (Employees, Warehouses, Branches,
// Suppliers, Purchase Orders) accepted a phone/CR/VAT field with no format check at all. One
// definition here so every form validates the same way instead of drifting per-file.

// Saudi mobile: 05XXXXXXXX (10 digits) or +9665XXXXXXXX/9665XXXXXXXX (12 digits with country code).
export function isValidSaudiPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
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
