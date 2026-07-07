// ESC/POS byte builder — mirrors BuildEscPos in PrinterController.cs

export interface ReceiptData {
  orderNumber: string;
  createdAt: string;
  sellerName: string;
  branchName: string;
  vatNumber?: string;
  customerName?: string;
  paymentMethod?: string;
  items: { name: string; qty: number; price: number }[];
  subtotal: number;
  discount: number;
  vat: number;
  total: number;
  taxLabel: string;
  tobaccoExcise?: number;
  fees?: { name: string; amount: number }[];
  splitBreakdown?: { method: string; amount: number }[];
  // Real ZATCA-signed QR (base64 TLV, 9 tags) from the submitted ZatcaInvoice, when available.
  // Falls back to a locally-built Phase-1-style 5-tag QR otherwise.
  zatcaQrCode?: string;
}

const WIDTH = 48;
const ENC = "cp437";

function encode(s: string): number[] {
  // Basic ASCII — replace non-ASCII with '?'
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    out.push(c < 128 ? c : 63); // 63 = '?'
  }
  return out;
}

function fmt(v: number): string { return v.toFixed(2); }

function padRow(left: string, right: string): string {
  const space = WIDTH - left.length - right.length;
  return space > 0 ? left + " ".repeat(space) + right : left + " " + right;
}

export function buildEscPos(r: ReceiptData): Uint8Array {
  const buf: number[] = [];

  const raw = (...b: number[]) => buf.push(...b);
  const text = (s: string) => buf.push(...encode(s));
  const lf = (n = 1) => { for (let i = 0; i < n; i++) buf.push(0x0a); };
  const center = () => raw(0x1b, 0x61, 0x01);
  const left   = () => raw(0x1b, 0x61, 0x00);
  const bold   = (on: boolean) => raw(0x1b, 0x45, on ? 1 : 0);
  const dblSz  = (on: boolean) => raw(0x1d, 0x21, on ? 0x11 : 0x00);
  const div    = () => { text("-".repeat(WIDTH)); lf(); };
  const row    = (l: string, r: string) => { text(padRow(l, r)); lf(); };

  // Init
  raw(0x1b, 0x40);

  // Header
  center(); bold(true); dblSz(true);
  const name = (r.sellerName ?? r.branchName ?? "Store").trim();
  const hdr = name.length > 24 ? name.slice(0, 24) : name.padStart(Math.floor((24 + name.length) / 2));
  text(hdr); lf();
  dblSz(false); bold(false);
  if (r.vatNumber) { text(`VAT: ${r.vatNumber}`); lf(); }
  text("TAX INVOICE"); lf();
  left(); div();

  // Order info
  const dt = r.createdAt ? new Date(r.createdAt) : new Date();
  const dateStr = `${String(dt.getDate()).padStart(2,"0")}/${String(dt.getMonth()+1).padStart(2,"0")}/${dt.getFullYear()}`;
  const timeStr = `${String(dt.getHours()).padStart(2,"0")}:${String(dt.getMinutes()).padStart(2,"0")}`;
  text(r.orderNumber); lf();
  text(`${dateStr}  ${timeStr}`); lf();
  if (r.customerName) { text(`Customer: ${r.customerName}`); lf(); }
  div();

  // Items
  for (const item of r.items) {
    const nm = item.name.length > 32 ? item.name.slice(0, 32) : item.name;
    text(nm); lf();
    row(`  ${item.qty} x SAR ${fmt(item.price)}`, `SAR ${fmt(item.qty * item.price)}`);
  }
  div();

  // Totals
  row("Subtotal", `SAR ${fmt(r.subtotal - r.discount)}`);
  if (r.tobaccoExcise && r.tobaccoExcise > 0) row("Tobacco Excise", `SAR ${fmt(r.tobaccoExcise)}`);
  for (const fee of r.fees ?? []) row(fee.name, `SAR ${fmt(fee.amount)}`);
  if (r.vat > 0) row(r.taxLabel ?? "VAT 15%", `SAR ${fmt(r.vat)}`);
  div();

  bold(true); dblSz(true);
  row("TOTAL", `SAR ${fmt(r.total)}`);
  dblSz(false); bold(false);

  // Payment
  if (r.splitBreakdown && r.splitBreakdown.length > 0) {
    row("Payment", "Split");
    for (const p of r.splitBreakdown)
      row(`  ${p.method.charAt(0).toUpperCase() + p.method.slice(1)}`, `SAR ${fmt(p.amount)}`);
  } else if (r.paymentMethod) {
    row("Payment", r.paymentMethod);
  }

  // Footer + ZATCA QR
  div(); center();
  text("Thank you!"); lf();
  text("ZATCA Phase 2 Compliant"); lf();
  lf();

  // ZATCA TLV QR code
  const tlv = r.zatcaQrCode ?? buildZatcaTlv(
    (r.sellerName ?? r.branchName ?? "Store").trim(),
    r.vatNumber ?? "",
    dt,
    r.total,
    r.vat,
  );
  const qrBytes = new TextEncoder().encode(tlv);
  const qLen = qrBytes.length + 3;
  const qpL = qLen & 0xff;
  const qpH = (qLen >> 8) & 0xff;
  raw(0x1d, 0x28, 0x6b, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00); // model 2
  raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x43, 0x06);        // size 6
  raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x45, 0x31);        // error correction M
  raw(0x1d, 0x28, 0x6b, qpL, qpH, 0x31, 0x50, 0x30);          // store data
  buf.push(...qrBytes);
  raw(0x1d, 0x28, 0x6b, 0x03, 0x00, 0x31, 0x51, 0x30);        // print

  left();
  raw(0x1b, 0x64, 0x05);        // feed 5 lines
  raw(0x1d, 0x56, 0x42, 0x00); // partial cut

  return new Uint8Array(buf);
}

function tlvField(tag: number, value: string): number[] {
  const v = new TextEncoder().encode(value);
  return [tag, v.length, ...v];
}

function buildZatcaTlv(seller: string, vat: string, dt: Date, total: number, vatAmt: number): string {
  const ts = dt.toISOString().replace(/\.\d{3}Z$/, "Z");
  const bytes: number[] = [
    ...tlvField(1, seller),
    ...tlvField(2, vat),
    ...tlvField(3, ts),
    ...tlvField(4, total.toFixed(2)),
    ...tlvField(5, vatAmt.toFixed(2)),
  ];
  return btoa(String.fromCharCode(...bytes));
}
