export const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:5008";
export const PRINTER_API_KEY = "selfcheckout_printer_api_url";
export const RECEIPT_PRINTER_KEY = "selfcheckout_receipt_printer";
export const DEFAULT_PRINTER_AGENT = "http://localhost:5008";

export function getPrinterBase(): string {
  return localStorage.getItem(PRINTER_API_KEY) ?? DEFAULT_PRINTER_AGENT;
}

// Staff pick this once during kiosk setup (see SetupScreen) so receipts print to the
// attached thermal receipt printer rather than whatever the print agent's OS default is
// (which, left unset, is often a general-purpose office/laser printer).
export function getReceiptPrinter(): string | null {
  return localStorage.getItem(RECEIPT_PRINTER_KEY);
}

export function setReceiptPrinter(name: string) {
  localStorage.setItem(RECEIPT_PRINTER_KEY, name);
}

const PRINT_MODE_KEY = "selfcheckout_print_mode";

export function getPrintMode(): "qz" | "local" {
  return (localStorage.getItem(PRINT_MODE_KEY) as "qz" | "local") ?? "local";
}

export function setPrintMode(mode: "qz" | "local") {
  localStorage.setItem(PRINT_MODE_KEY, mode);
}

// Direct-USB printer selection (QZ Tray qz.usb.* path). When set, it takes
// precedence over the named printer in QZ mode — used for thermal printers that
// won't show up as a named OS printer. Stores the resolved vendor/product/
// interface/endpoint plus a human label. See qz.ts qzPrintReceiptUsb.
const USB_PRINTER_KEY = "selfcheckout_usb_printer";

export interface UsbPrinterSelection {
  vendorId: string;
  productId: string;
  interface: string;
  endpoint: string;
  label: string;
}

export function getUsbPrinter(): UsbPrinterSelection | null {
  const raw = localStorage.getItem(USB_PRINTER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as UsbPrinterSelection;
  } catch {
    return null;
  }
}

export function setUsbPrinter(sel: UsbPrinterSelection | null) {
  if (sel) localStorage.setItem(USB_PRINTER_KEY, JSON.stringify(sel));
  else localStorage.removeItem(USB_PRINTER_KEY);
}

// Returns the direct URL to download the OS-specific one-click setup installer (installs QZ
// Tray + creates a kiosk shortcut) — same installer/endpoint the staff POS uses. Passes this
// page's own origin explicitly so the installer's Chrome policy (which lifts the insecure-
// origin/local-network-access restrictions QZ Tray needs) covers self-checkout's actual
// origin, not just the POS app's configured URL the endpoint otherwise defaults to.
export function setupInstallerUrl(): string {
  return `${BASE}/api/printer/setup-installer?origin=${encodeURIComponent(window.location.origin)}`;
}

// Fixes the "Action Required" QZ Tray popup on Windows when QZ Tray is already installed
// manually. Must read from THIS terminal's local agent, not the remote server — the cert
// embedded needs to match what's actually paired with the QZ Tray running on this machine.
export function qzTrustPs1Url(): string {
  return `${getPrinterBase()}/api/printer/qz-trust-ps1`;
}

// QZ Tray's cert/sign challenge must be answered by the local agent on this machine (same
// reasoning as above) — routing these through the remote server would return whatever cert
// that server happens to have on disk, which can silently mismatch what's trusted in this
// machine's QZ Tray allowed.dat and leave every print request unsigned.
export function qzCertificateUrl(): string {
  return `${getPrinterBase()}/api/printer/qz-certificate`;
}

export function qzSign(toSign: string): Promise<string> {
  return fetch(`${getPrinterBase()}/api/printer/qz-sign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ toSign }),
  }).then((r) => r.text());
}

async function printerRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${getPrinterBase()}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    let msg = text;
    try {
      const p = JSON.parse(text) as { message?: string; title?: string };
      msg = p.message ?? p.title ?? text;
    } catch {
      /* not JSON */
    }
    throw new Error(msg || res.statusText);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("json")) return undefined as T;
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

const TOKEN_KEY = "selfcheckout_token";
const TERMINAL_CODE_KEY = "selfcheckout_terminal_code";
const PAIRING_SECRET_KEY = "selfcheckout_pairing_secret";

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function getStoredPairing(): { terminalCode: string; pairingSecret: string } | null {
  const terminalCode = localStorage.getItem(TERMINAL_CODE_KEY);
  const pairingSecret = localStorage.getItem(PAIRING_SECRET_KEY);
  return terminalCode && pairingSecret ? { terminalCode, pairingSecret } : null;
}

export function storePairing(terminalCode: string, pairingSecret: string, token: string) {
  localStorage.setItem(TERMINAL_CODE_KEY, terminalCode);
  localStorage.setItem(PAIRING_SECRET_KEY, pairingSecret);
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearPairing() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(TERMINAL_CODE_KEY);
  localStorage.removeItem(PAIRING_SECRET_KEY);
}

class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit, retryOn401 = true, sendAuth = true): Promise<T> {
  const token = sendAuth ? getStoredToken() : null;
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (res.status === 401 && retryOn401) {
    // Kiosk tokens expire every 24h — silently re-pair with the stored secret
    // rather than making staff type it in again, then retry once.
    const pairing = getStoredPairing();
    if (pairing) {
      const paired = await pairKiosk(pairing.terminalCode, pairing.pairingSecret);
      storePairing(pairing.terminalCode, pairing.pairingSecret, paired.token);
      return request<T>(path, init, false);
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    throw new ApiError(body.message ?? "Request failed", res.status);
  }
  return res.json();
}

export interface KioskPairResponse {
  token: string;
  expiresAt: string;
  branchId: string;
  branchName: string;
  terminalName: string;
}

export function pairKiosk(terminalCode: string, pairingSecret: string): Promise<KioskPairResponse> {
  // Pairing is anonymous — never attach a stale/foreign token here. If this device is
  // already paired to a different terminal, sending its old kiosk JWT alongside a
  // re-pair request trips the backend's kiosk-endpoint allowlist middleware, which
  // doesn't (and shouldn't) expect a kiosk-authenticated call to this endpoint.
  return request<KioskPairResponse>(
    "/api/kiosk/pair",
    { method: "POST", body: JSON.stringify({ terminalCode, pairingSecret }) },
    false,
    false,
  );
}

export interface Product {
  id: string;
  sku: string;
  barcode?: string;
  name: string;
  nameAr?: string;
  categoryId?: string;
  basePrice: number;
  taxPercentage: number;
  customFee: number;
  isTobacco: boolean;
  allowSelfCheckout: boolean;
  status: string;
  // Static per-product discount configured in Inventory — separate from the
  // branch/category-wide "Discount" rules below.
  discount?: number;
  discountType?: "percentage" | "fixed";
}

export function getProductByBarcode(barcode: string): Promise<Product> {
  return request<Product>(`/api/products/barcode/${encodeURIComponent(barcode)}`);
}

// Preloaded once per session (see ScanScreen) so both the type-to-search dropdown and the
// global scanner listener can match instantly against an in-memory list, the same way the
// staff POS does, instead of a network round trip per keystroke/scan.
export function listActiveProducts(): Promise<Product[]> {
  return request<Product[]>("/api/products?status=active");
}

// ─── Resolved pricing (FRD §12) ──────────────────────────────────────────────
//
// The kiosk must charge exactly what the staffed till charges. Both now source their unit price
// from the same server-side resolution (branch / customer-tier / scheduled rules, falling back to
// Product.BasePrice when no rule matches) rather than each reading basePrice directly — otherwise
// setting a branch price would silently make the kiosk sell at the old price.
export interface KioskPackOption {
  priceListId: string;
  label?: string | null;
  packSize: number;
  packPrice: number;
  unitPrice: number;
  packBarcode?: string | null;
}

export interface ResolvedPrice {
  productId: string;
  unitPrice: number;
  basePrice: number;
  priceListId?: string | null;
  source: string;
  packs: KioskPackOption[];
}

export function resolvePrices(branchId: string | null, customerTier?: string | null): Promise<ResolvedPrice[]> {
  const q = new URLSearchParams();
  if (branchId) q.set("branchId", branchId);
  if (customerTier) q.set("customerTier", customerTier);
  const qs = q.toString();
  return request<ResolvedPrice[]>(`/api/pricing/resolve${qs ? `?${qs}` : ""}`);
}

export interface Coupon {
  id: string;
  code: string;
  type: "percentage" | "fixed" | "buy_one_get_one" | "combo" | "chance_to_win";
  value: number;
  minOrderAmount?: number;
  maxDiscountAmount?: number;
}

export function validateCoupon(code: string): Promise<Coupon> {
  return request<Coupon>(`/api/finance/coupons/validate/${encodeURIComponent(code)}`);
}

export interface Discount {
  id: string;
  name: string;
  appliesTo: "all" | "branch" | "product" | "category";
  productId?: string;
  categoryId?: string;
  branchId?: string;
  discountType: "percentage" | "fixed";
  value: number;
  isActive: boolean;
  startDate?: string;
  endDate?: string;
  requiresCustomer: boolean;
  minCustomerTier?: "standard" | "silver" | "gold" | "platinum";
  excludedProductIdsJson?: string;
}

export function getActiveDiscounts(): Promise<Discount[]> {
  return request<Discount[]>("/api/discounts?isActive=true");
}

export interface Offer {
  id: string;
  name: string;
  offerType: "bogo" | "combo" | "buy_a_get_b" | "product_offer" | "lucky_draw";
  branchId?: string;
  triggerProductId?: string;
  triggerBarcode?: string; // when set, the offer only fires for this exact barcode
  getProductId?: string;
  triggerQuantity: number;
  getQuantity: number;
  offerPrice?: number;
  discountPercentage?: number;
  itemsDescription?: string;
  minBasketAmount?: number;
  isActive: boolean;
  startDate: string;
  endDate: string;
}

export function getActiveOffers(): Promise<Offer[]> {
  return request<Offer[]>("/api/offers/active");
}

export interface TaxFeeRule {
  id: string;
  ruleName: string;
  ruleType: "vat" | "custom_fee" | "tobacco_excise";
  applicableTo: "all_products" | "all_orders" | "category" | "specific_product" | "branch";
  applicableId?: string;
  branchId?: string;
  vatPercentage: number;
  customFeeAmount: number;
  excisePercentage: number;
  status: "active" | "inactive";
}

export function getTaxRules(): Promise<TaxFeeRule[]> {
  return request<TaxFeeRule[]>("/api/finance/tax-rules");
}

export interface Customer {
  id: string;
  customerCode?: string;
  fullName: string;
  phone: string;
  email?: string;
  loyaltyBalance: number;
  totalSpend: number;
  visitCount: number;
  tier: "standard" | "silver" | "gold" | "platinum";
}

export function getCustomerByPhone(phone: string): Promise<Customer> {
  return request<Customer>(`/api/customers/by-phone/${encodeURIComponent(phone)}`);
}

export function createCustomer(data: { fullName: string; phone: string }): Promise<Customer> {
  return request<Customer>("/api/customers", { method: "POST", body: JSON.stringify(data) });
}

export interface OrderItemInput {
  productId: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export interface OrderPaymentInput {
  paymentMethod: "card";
  amount: number;
  status: "completed";
}

export interface CreateOrderInput {
  branchId: string;
  customerId?: string;
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  customFeeAmount: number;
  totalAmount: number;
  paymentStatus: "paid";
  orderStatus: "completed";
  couponId?: string;
  items: OrderItemInput[];
  payments: OrderPaymentInput[];
}

export interface Order {
  id: string;
  orderNumber: string;
  source: string;
  totalAmount: number;
  paymentStatus: string;
  createdAt: string;
  zatcaQrCode?: string;
}

export function createOrder(order: CreateOrderInput): Promise<Order> {
  return request<Order>("/api/orders", { method: "POST", body: JSON.stringify(order) });
}

export interface ZatcaSettings {
  vatRegistrationNumber?: string;
  sellerName?: string;
}

export function getZatcaSettings(branchId: string): Promise<ZatcaSettings> {
  return request<ZatcaSettings>(`/api/compliance/zatca/settings/${branchId}`);
}

export interface PrintReceiptInput {
  orderNumber: string;
  createdAt: string;
  sellerName: string;
  branchName: string;
  vatNumber?: string;
  paymentMethod?: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  tobaccoExcise?: number;
  vat: number;
  total: number;
  taxLabel: string;
  printerName?: string;
  zatcaQrCode?: string;
}

export function printReceipt(invoice: PrintReceiptInput): Promise<{ message: string; jobId?: string }> {
  const printerName = invoice.printerName ?? getReceiptPrinter() ?? undefined;
  return printerRequest("/api/printer/print-receipt", { method: "POST", body: JSON.stringify({ ...invoice, printerName }) });
}

export interface PrinterStatus {
  defaultPrinter: string | null;
  installed: string[];
  installedUris: Record<string, string>;
}

export function getPrinterStatus(): Promise<PrinterStatus> {
  return printerRequest("/api/printer/status");
}

export interface DetectedPrinter {
  uri: string;
  model: string;
  type: "usb" | "network";
  suggestedName: string;
}

export function detectPrinters(): Promise<{ printers: DetectedPrinter[] }> {
  return printerRequest("/api/printer/detect");
}

export function activatePrinter(data: { uri: string; name: string }): Promise<{ message: string; name: string; kioskReady: boolean }> {
  return printerRequest("/api/printer/activate", { method: "POST", body: JSON.stringify(data) });
}

export function removePrinter(name: string): Promise<{ message: string }> {
  return printerRequest(`/api/printer/${name}`, { method: "DELETE" });
}

export function getPrintJobs(printer?: string): Promise<{ jobs: string[] }> {
  return printerRequest(`/api/printer/jobs${printer ? `?printer=${encodeURIComponent(printer)}` : ""}`);
}

export function cancelAllJobs(printer?: string): Promise<{ message: string }> {
  return printerRequest(`/api/printer/jobs${printer ? `?printer=${encodeURIComponent(printer)}` : ""}`, { method: "DELETE" });
}

export { ApiError };
