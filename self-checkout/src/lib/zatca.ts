// ZATCA Phase 1-style TLV QR encoder — same implementation as the staff POS
// (src/routes/_app.pos.tsx). Used as a fallback when the order response doesn't carry a
// real Phase 2-signed QR (e.g. the branch isn't onboarded yet).
export function buildZatcaTlv(
  sellerName: string,
  vatNumber: string,
  timestamp: string,
  total: number,
  vatAmount: number,
): string {
  const encode = (tag: number, value: string): Uint8Array => {
    const bytes = new TextEncoder().encode(value);
    return new Uint8Array([tag, bytes.length, ...bytes]);
  };
  const fields = [
    encode(1, sellerName),
    encode(2, vatNumber),
    encode(3, timestamp),
    encode(4, total.toFixed(2)),
    encode(5, vatAmount.toFixed(2)),
  ];
  const totalLen = fields.reduce((s, f) => s + f.length, 0);
  const buf = new Uint8Array(totalLen);
  let offset = 0;
  fields.forEach((f) => {
    buf.set(f, offset);
    offset += f.length;
  });
  return btoa(String.fromCharCode(...buf));
}
