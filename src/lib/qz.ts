// QZ Tray integration — browser-to-USB printer bridge
// Works on Chrome, Firefox, Safari, Edge.
// Cashier machine needs QZ Tray installed: https://qz.io/download/

import qz from "qz-tray";
import { buildEscPos, type ReceiptData } from "./escpos";
import { api } from "./api";

// Cert-signed mode. The server cert fingerprint is added to ~/.qz/allowed.dat
// by the installer, so QZ Tray auto-allows with no dialog on every machine.
qz.security.setCertificatePromise((resolve) => {
  fetch(api.qzCertificateUrl())
    .then(r => r.ok ? r.text() : Promise.reject(r.statusText))
    .then(resolve)
    .catch(() => resolve(null));
});
qz.security.setSignaturePromise((toSign) => (resolve) => {
  api.qzSign(toSign).then(resolve).catch(() => resolve(null));
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

// ── Direct USB printing (qz.usb.*) ──────────────────────────────────────────
// For thermal printers that won't appear as a named OS printer (no driver, or a
// driver that mangles raw ESC/POS). We claim the printer's raw USB endpoint and
// push ESC/POS bytes straight to it — no Windows/CUPS printer object involved.
// Windows prerequisite: the device needs a WinUSB-compatible driver bound (via
// Zadig). On Linux/macOS libusb can usually claim the device directly.

export interface UsbDeviceInfo {
  vendorId: string;      // hex, e.g. "0x0483"
  productId: string;     // hex, e.g. "0x5743"
  hub: boolean;
  manufacturer?: string;
  product?: string;
}

export interface UsbPrinterTarget {
  vendorId: string;
  productId: string;
  interface: string;     // hex interface id on the device
  endpoint: string;      // hex OUT endpoint address to write to
}

// Lists connected USB devices (hubs excluded). QZ Tray must be running.
export async function qzListUsbDevices(): Promise<UsbDeviceInfo[]> {
  await qzConnect();
  const devices = await qz.usb.listDevices(false);
  return (Array.isArray(devices) ? devices : []).filter((d) => !d.hub);
}

// Finds the first interface that exposes a writable (OUT) endpoint — the one a
// printer receives data on. USB endpoint addresses set the 0x80 bit for IN
// (device→host) and clear it for OUT (host→device); a printer's data sink is an
// OUT endpoint. Returns null if the device exposes none (i.e. it's not a printer).
export async function qzResolveUsbEndpoint(
  vendorId: string,
  productId: string,
): Promise<UsbPrinterTarget | null> {
  await qzConnect();
  const interfaces = await qz.usb.listInterfaces({ vendorId, productId });
  for (const iface of Array.isArray(interfaces) ? interfaces : []) {
    const endpoints = await qz.usb.listEndpoints({ vendorId, productId, interface: iface });
    const out = (Array.isArray(endpoints) ? endpoints : []).find(
      (ep) => (parseInt(ep, 16) & 0x80) === 0,
    );
    if (out) return { vendorId, productId, interface: iface, endpoint: out };
  }
  return null;
}

// Claim → write → release. Always releases in finally so the next print (or any
// other app) can claim the device; a lingering claim otherwise locks the printer.
async function usbSendBytes(target: UsbPrinterTarget, bytes: Uint8Array | number[]): Promise<void> {
  const { vendorId, productId, interface: iface, endpoint } = target;
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const base64 = btoa(binary);

  const alreadyClaimed = await qz.usb.isClaimed({ vendorId, productId }).catch(() => false);
  if (!alreadyClaimed) await qz.usb.claimDevice({ vendorId, productId, interface: iface });
  try {
    // Pass data as an object so QZ Tray honours BASE64; a bare string is forced to PLAIN.
    await qz.usb.sendData({ vendorId, productId, endpoint, data: { data: base64, type: "BASE64" } });
  } finally {
    await qz.usb.releaseDevice({ vendorId, productId }).catch(() => {});
  }
}

export async function qzPrintReceiptUsb(receipt: ReceiptData, target: UsbPrinterTarget): Promise<void> {
  await qzConnect();
  await usbSendBytes(target, buildEscPos(receipt));
}

// A tiny standalone print used by "Test print" in Printer Setup — lets an operator
// confirm the raw USB endpoint works without ringing up a real sale.
export async function qzUsbTestPrint(target: UsbPrinterTarget): Promise<void> {
  await qzConnect();
  const text = new TextEncoder().encode("USB DIRECT TEST\nQZ Tray raw endpoint OK\n");
  const bytes = [
    0x1b, 0x40,             // ESC @  — initialise
    0x1b, 0x61, 0x01,       // ESC a 1 — center
    ...text,
    0x0a, 0x0a, 0x0a,       // feed
    0x1d, 0x56, 0x42, 0x00, // GS V B 0 — partial cut
  ];
  await usbSendBytes(target, bytes);
}
