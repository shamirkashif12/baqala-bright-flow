// QZ Tray integration — browser-to-USB printer bridge
// Works on Chrome, Firefox, Safari, Edge.
// Terminal needs QZ Tray installed: https://qz.io/download/

import qz from "qz-tray";
import { buildEscPos, type ReceiptData } from "./escpos";
import { qzCertificateUrl, qzSign } from "./api";

// Cert-signed mode. The server cert fingerprint is added to ~/.qz/allowed.dat
// by the installer, so QZ Tray auto-allows with no dialog on every machine.
qz.security.setCertificatePromise((resolve) => {
  fetch(qzCertificateUrl())
    .then(r => r.ok ? r.text() : Promise.reject(r.statusText))
    .then(resolve)
    .catch(() => resolve(null));
});
qz.security.setSignaturePromise((toSign) => (resolve) => {
  qzSign(toSign).then(resolve).catch(() => resolve(null));
});

let connectPromise: Promise<void> | null = null;

export async function qzConnect(): Promise<void> {
  if (qz.websocket.isActive()) return;
  if (connectPromise) return connectPromise;
  connectPromise = qz.websocket
    .connect({ retries: 2, delay: 1 })
    .finally(() => { connectPromise = null; });
  return connectPromise;
}

export async function qzDisconnect(): Promise<void> {
  if (qz.websocket.isActive()) await qz.websocket.disconnect();
}

export function qzIsConnected(): boolean {
  return qz.websocket.isActive();
}

export async function qzListPrinters(): Promise<string[]> {
  await qzConnect();
  // QZ Tray's printer list comes from Java's PrintServiceLookup, which can return a
  // stale/empty list on the first call right after the print spooler state changes
  // (a printer added/removed, or QZ Tray itself just restarted) — retry briefly
  // before concluding there really are no printers.
  for (let attempt = 0; attempt < 5; attempt++) {
    const result = await qz.printers.find();
    const printers = Array.isArray(result) ? result : [result as string].filter(Boolean);
    if (printers.length > 0 || attempt === 4) return printers;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  return [];
}

export async function qzGetDefaultPrinter(): Promise<string> {
  await qzConnect();
  return qz.printers.getDefault();
}

export async function qzPrintReceipt(receipt: ReceiptData, printerName?: string): Promise<void> {
  await qzConnect();
  const printer = printerName || await qz.printers.getDefault();
  if (!printer) throw new Error("No printer selected. Open Printer Setup and choose a printer.");
  const bytes = buildEscPos(receipt);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);
  const config = qz.configs.create(printer, { raw: true });
  await qz.print(config, [{
    type: "raw",
    format: "base64",
    data: base64,
  }]);
}
