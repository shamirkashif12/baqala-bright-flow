// QZ Tray integration — browser-to-USB printer bridge
// Works on Chrome, Firefox, Safari, Edge.
// Cashier machine needs QZ Tray installed: https://qz.io/download/

import qz from "qz-tray";
import { buildEscPos, type ReceiptData } from "./escpos";

// Anonymous mode — QZ Tray asks "Allow" once when connecting.
// After that one click, all prints in the session are silent.
qz.security.setCertificatePromise((resolve) => { resolve(null); });
qz.security.setSignaturePromise(() => (resolve) => { resolve(null); });

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
  const result = await qz.printers.find();
  return Array.isArray(result) ? result : [result as string];
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
