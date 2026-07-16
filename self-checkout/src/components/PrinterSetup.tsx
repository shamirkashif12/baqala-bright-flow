import { useEffect, useState } from "react";
import { Printer, RefreshCw, Wifi, AlertCircle, PrinterCheck, Usb, Loader2, Trash, CheckCircle2, Cable } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./ui/tabs";
import {
  getPrinterStatus, getReceiptPrinter, setReceiptPrinter,
  getPrinterBase, PRINTER_API_KEY, DEFAULT_PRINTER_AGENT,
  detectPrinters, activatePrinter, removePrinter, getPrintJobs, cancelAllJobs,
  getPrintMode, setPrintMode, setupInstallerUrl,
  getUsbPrinter, setUsbPrinter,
  type DetectedPrinter, type UsbPrinterSelection,
} from "../lib/api";
import {
  qzConnect, qzIsConnected, qzListPrinters,
  qzListUsbDevices, qzResolveUsbEndpoint, qzUsbTestPrint,
  type UsbDeviceInfo,
} from "../lib/qz";

/** Visible entry point on the checkout screen itself — mirrors where the staff POS
 * puts its own "Printer Setup" button (top-right of the page), rather than being
 * tucked away on the idle/welcome screen where it's easy to miss. */
export function PrinterSetupDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => setOpen(true)}>
        <Printer className="h-4 w-4" /> <span className="hidden sm:inline">Printer Setup</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="sr-only">Receipt Printer Setup</DialogTitle>
          </DialogHeader>
          <PrinterSetupStep onDone={() => setOpen(false)} onSkip={() => setOpen(false)} />
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PrinterSetupStep({ onDone, onSkip }: { onDone: () => void; onSkip?: () => void }) {
  const [selected, setSelected] = useState<string>(getReceiptPrinter() ?? "");
  const [manualName, setManualName] = useState("");
  const [printMode, setPrintModeState] = useState<"qz" | "local">(getPrintMode());

  function savePrintMode(m: "qz" | "local") {
    setPrintModeState(m);
    setPrintMode(m);
  }

  function selectPrinter(name: string) {
    setSelected(name);
    setManualName("");
  }

  // ── QZ Tray ──────────────────────────────────────────────────────────────
  const [qzConnected, setQzConnected] = useState(false);
  const [qzPrinters, setQzPrinters] = useState<string[]>([]);
  const [connectingQz, setConnectingQz] = useState(false);

  async function handleQzConnect() {
    setConnectingQz(true);
    try {
      await qzConnect();
      setQzConnected(true);
      const printers = await qzListPrinters();
      setQzPrinters(printers);
      toast.success(`QZ Tray connected — ${printers.length} printer(s) found`);
    } catch {
      setQzConnected(false);
      toast.error("Cannot connect to QZ Tray — is it installed and running?");
    } finally {
      setConnectingQz(false);
    }
  }

  // ── Direct USB (qz.usb.*) ──────────────────────────────────────────────────
  const [usbDevices, setUsbDevices] = useState<UsbDeviceInfo[]>([]);
  const [scanningUsb, setScanningUsb] = useState(false);
  const [usbSelected, setUsbSelected] = useState<UsbPrinterSelection | null>(() => getUsbPrinter());
  const [busyUsb, setBusyUsb] = useState<string | null>(null);
  const usbKey = (d: { vendorId: string; productId: string }) => `${d.vendorId}:${d.productId}`;

  async function handleScanUsb() {
    setScanningUsb(true);
    try {
      await qzConnect();
      setQzConnected(true);
      const devices = await qzListUsbDevices();
      setUsbDevices(devices);
      toast[devices.length ? "success" : "info"](
        devices.length ? `${devices.length} USB device(s) found` : "No USB devices found",
      );
    } catch {
      toast.error("Cannot scan USB — is QZ Tray running?");
    } finally {
      setScanningUsb(false);
    }
  }

  async function handleUseUsb(d: UsbDeviceInfo) {
    setBusyUsb(usbKey(d));
    try {
      const target = await qzResolveUsbEndpoint(d.vendorId, d.productId);
      if (!target) {
        toast.error("This device exposes no writable endpoint — is it really a printer?");
        return;
      }
      const sel: UsbPrinterSelection = {
        ...target,
        label: d.product || d.manufacturer || `USB ${d.vendorId}:${d.productId}`,
      };
      setUsbPrinter(sel);
      setUsbSelected(sel);
      // USB-direct takes precedence in QZ mode; clear any named selection so the
      // routing is unambiguous and the UI reflects a single active target.
      setReceiptPrinter("");
      setSelected("");
      toast.success(`Direct USB printer set: ${sel.label}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to claim USB device");
    } finally {
      setBusyUsb(null);
    }
  }

  function clearUsb() {
    setUsbPrinter(null);
    setUsbSelected(null);
    toast.success("Direct USB printer cleared");
  }

  async function handleTestUsb() {
    if (!usbSelected) return;
    setBusyUsb("test");
    try {
      await qzUsbTestPrint(usbSelected);
      toast.success("Test sent to USB printer");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test print failed");
    } finally {
      setBusyUsb(null);
    }
  }

  // ── Local Agent ──────────────────────────────────────────────────────────
  const [installed, setInstalled] = useState<string[]>([]);
  const [installedUris, setInstalledUris] = useState<Record<string, string>>({});
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent URL — the printer agent is a per-terminal HTTP service, so each kiosk needs to point
  // at its own machine/LAN address rather than assuming localhost:5008 always resolves correctly.
  const [agentUrl, setAgentUrl] = useState<string>(() => getPrinterBase());
  const [agentUrlInput, setAgentUrlInput] = useState<string>(() => getPrinterBase());
  const [testingAgent, setTestingAgent] = useState(false);
  const [agentOk, setAgentOk] = useState<boolean | null>(null);

  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedPrinter[]>([]);
  const [editNames, setEditNames] = useState<Record<string, string>>({});
  const [activating, setActivating] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  const [printJobs, setPrintJobs] = useState<string[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [clearingJobs, setClearingJobs] = useState(false);

  function saveAgentUrl(url: string) {
    const clean = url.trim().replace(/\/$/, "");
    localStorage.setItem(PRINTER_API_KEY, clean);
    setAgentUrl(clean);
    setAgentUrlInput(clean);
    setAgentOk(null);
  }

  async function testAgentConnection(url: string) {
    setTestingAgent(true);
    setAgentOk(null);
    try {
      const res = await fetch(`${url.trim().replace(/\/$/, "")}/api/printer/status`, { signal: AbortSignal.timeout(4000) });
      setAgentOk(res.ok);
      if (res.ok) toast.success("Local print agent reachable!");
      else toast.error("Agent responded but returned an error.");
    } catch {
      setAgentOk(false);
      toast.error("Cannot reach print agent — is it running?");
    } finally {
      setTestingAgent(false);
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const status = await getPrinterStatus();
      setInstalled(status.installed);
      setInstalledUris(status.installedUris ?? {});
      setDefaultPrinter(status.defaultPrinter);
      if (!selected && status.defaultPrinter) setSelected(status.defaultPrinter);
    } catch {
      setError("Couldn't reach the local print agent — make sure it's running on this terminal.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDetect() {
    setDetecting(true);
    try {
      const res = await detectPrinters();
      setDetected(res.printers);
      if (res.printers.length === 0) toast.info("No printers detected — make sure the USB cable is connected.");
      else toast.success(`${res.printers.length} printer(s) detected`);
    } catch {
      toast.error("Detection failed — is the print agent running?");
    } finally {
      setDetecting(false);
    }
  }

  async function handleActivate(p: DetectedPrinter) {
    const name = editNames[p.uri] ?? p.suggestedName;
    setActivating(p.uri);
    try {
      const res = await activatePrinter({ uri: p.uri, name });
      toast.success(res.message);
      await load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to activate printer");
    } finally {
      setActivating(null);
    }
  }

  async function handleRemove(name: string) {
    setRemoving(name);
    try {
      const res = await removePrinter(name);
      toast.success(res.message);
      await load();
    } catch {
      toast.error("Failed to remove printer");
    } finally {
      setRemoving(null);
    }
  }

  async function loadPrintJobs() {
    setLoadingJobs(true);
    try {
      const res = await getPrintJobs();
      setPrintJobs(res.jobs);
    } catch {
      setPrintJobs([]);
    } finally {
      setLoadingJobs(false);
    }
  }

  async function handleClearQueue() {
    setClearingJobs(true);
    try {
      const res = await cancelAllJobs();
      toast.success(res.message);
      setPrintJobs([]);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to clear queue");
    } finally {
      setClearingJobs(false);
    }
  }

  useEffect(() => {
    const isQz = qzIsConnected();
    setQzConnected(isQz);
    if (isQz) qzListPrinters().then(setQzPrinters).catch(() => {});
    if (printMode === "local") {
      load();
      handleDetect();
      loadPrintJobs();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function save() {
    const name = manualName.trim() || selected;
    if (name) setReceiptPrinter(name);
    onDone();
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl font-bold flex items-center gap-2">
          <Printer className="h-5 w-5 text-primary" /> Receipt Printer
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Pick the thermal receipt printer attached to this terminal — e.g. a POS-80C. Without a
          selection here, receipts print to whatever the print agent's system default is, which is
          often the wrong (office/laser) printer.
        </p>
      </div>

      <Tabs value={printMode} onValueChange={(v) => { savePrintMode(v as "qz" | "local"); if (v === "local") { load(); handleDetect(); } }}>
        <TabsList className="w-full">
          <TabsTrigger value="qz" className="flex-1 gap-1.5">
            <Printer className="h-3.5 w-3.5" /> QZ Tray <span className="text-[10px] bg-green-100 text-green-700 px-1 rounded">All Browsers</span>
          </TabsTrigger>
          <TabsTrigger value="local" className="flex-1 gap-1.5">
            <Usb className="h-3.5 w-3.5" /> Local Agent <span className="text-[10px] bg-muted text-muted-foreground px-1 rounded">Linux/LAN</span>
          </TabsTrigger>
        </TabsList>

        {/* ── QZ Tray tab ── */}
        <TabsContent value="qz" className="space-y-3 mt-3">
          <div className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${qzConnected ? "bg-green-50 border border-green-200 text-green-700" : "bg-muted/50 border text-muted-foreground"}`}>
            {qzConnected
              ? <><CheckCircle2 className="h-4 w-4 flex-shrink-0" /><span>QZ Tray connected — <strong>{qzPrinters.length}</strong> printer(s) found</span></>
              : <><AlertCircle className="h-4 w-4 flex-shrink-0" /><span>QZ Tray not connected</span></>}
            <Button size="sm" variant="outline" className="ml-auto h-7 text-xs gap-1" onClick={handleQzConnect} disabled={connectingQz}>
              {connectingQz ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              {qzConnected ? "Re-scan" : "Connect"}
            </Button>
          </div>

          {!qzConnected && (
            <div className="rounded-lg border border-dashed px-4 py-3 space-y-2.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground text-sm">Setup (one-time per terminal):</p>
              <a
                href={setupInstallerUrl()}
                download
                className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary text-primary-foreground px-3 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                <Printer className="h-4 w-4" />
                Download Setup Installer
              </a>
              <p>Installs QZ Tray silently and starts it automatically on every boot.</p>
            </div>
          )}

          {qzConnected && qzPrinters.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">Available Printers</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {qzPrinters.map((name) => {
                  const isReceipt = selected === name && !manualName;
                  return (
                    <div key={name} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isReceipt ? "border-primary bg-primary/10" : "border-border"}`}>
                      <PrinterCheck className={`h-4 w-4 flex-shrink-0 ${isReceipt ? "text-green-600" : "text-muted-foreground"}`} />
                      <span className="flex-1 font-medium truncate">{name}</span>
                      {isReceipt
                        ? <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">Receipt Printer</span>
                        : <Button size="sm" variant="outline" className="h-7 text-xs px-2 shrink-0" onClick={() => selectPrinter(name)}>Use for receipts</Button>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {qzConnected && qzPrinters.length === 0 && (
            <p className="text-xs text-muted-foreground px-1">No printers found. Make sure the printer driver is installed on this machine.</p>
          )}

          {/* ── Direct USB (driverless) ── */}
          <div className="pt-2 mt-1 border-t space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                <Cable className="h-3.5 w-3.5" /> Direct USB <span className="normal-case tracking-normal text-[10px] bg-amber-100 text-amber-700 px-1 rounded">driverless</span>
              </p>
              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={handleScanUsb} disabled={scanningUsb}>
                {scanningUsb ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Scan USB
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground leading-snug">
              Use this only when the printer refuses to show up above. Sends receipts straight to the
              printer's raw USB endpoint. On Windows the device first needs a WinUSB driver bound with Zadig.
            </p>

            {usbSelected && (
              <div className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50/60 px-3 py-2 text-sm">
                <PrinterCheck className="h-4 w-4 flex-shrink-0 text-green-600" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">{usbSelected.label}</p>
                  <p className="text-[11px] text-muted-foreground font-mono truncate">
                    {usbSelected.vendorId}:{usbSelected.productId} · iface {usbSelected.interface} · ep {usbSelected.endpoint}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs px-2 shrink-0" onClick={handleTestUsb} disabled={busyUsb === "test"}>
                  {busyUsb === "test" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test print"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive shrink-0" onClick={clearUsb}>
                  <Trash className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}

            {usbDevices.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {usbDevices.map((d) => {
                  const isSel = usbSelected?.vendorId === d.vendorId && usbSelected?.productId === d.productId;
                  return (
                    <div key={usbKey(d)} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isSel ? "border-green-300 bg-green-50/40" : "border-border"}`}>
                      <Usb className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{d.product || d.manufacturer || "Unknown USB device"}</p>
                        <p className="text-[11px] text-muted-foreground font-mono truncate">{d.vendorId}:{d.productId}</p>
                      </div>
                      {isSel
                        ? <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">Receipt Printer</span>
                        : <Button size="sm" variant="outline" className="h-7 text-xs px-2 shrink-0" disabled={busyUsb === usbKey(d)} onClick={() => handleUseUsb(d)}>
                            {busyUsb === usbKey(d) ? <Loader2 className="h-3 w-3 animate-spin" /> : "Use for receipts"}
                          </Button>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>

        {/* ── Local Agent tab ── */}
        <TabsContent value="local" className="space-y-3 mt-3">
          {error && <p className="text-sm text-destructive">{error}</p>}

          <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Printer Agent URL</p>
            <div className="flex gap-2">
              <Input
                className="h-8 text-xs flex-1 font-mono"
                placeholder={DEFAULT_PRINTER_AGENT}
                value={agentUrlInput}
                onChange={(e) => { setAgentUrlInput(e.target.value); setAgentOk(null); }}
                onBlur={() => { if (agentUrlInput !== agentUrl) { saveAgentUrl(agentUrlInput); load(); handleDetect(); } }}
              />
              <Button
                size="sm"
                className="h-8 text-xs gap-1 whitespace-nowrap"
                variant="outline"
                disabled={testingAgent}
                onClick={() => { saveAgentUrl(agentUrlInput); testAgentConnection(agentUrlInput); load(); handleDetect(); }}
              >
                {testingAgent ? <Loader2 className="h-3 w-3 animate-spin" /> : agentOk === true ? <PrinterCheck className="h-3 w-3 text-green-600" /> : agentOk === false ? <AlertCircle className="h-3 w-3 text-destructive" /> : <Wifi className="h-3 w-3" />}
                Test
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Start agent: <code className="bg-muted px-1 rounded text-[11px]">dotnet run --urls "http://0.0.0.0:5008"</code></p>
          </div>

          {installed.length > 0 && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Installed printers</Label>
              <div className="flex flex-col gap-1.5">
                {installed.map((name) => (
                  <div key={name} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                    selected === name && !manualName ? "border-primary bg-primary/10" : "border-border"
                  }`}>
                    <button
                      type="button"
                      onClick={() => selectPrinter(name)}
                      className="flex-1 text-left font-medium truncate"
                    >
                      {name}
                      {name === defaultPrinter && <span className="ml-2 text-[10px] text-muted-foreground">(agent default)</span>}
                    </button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive" disabled={removing === name} onClick={() => handleRemove(name)}>
                      {removing === name ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs text-muted-foreground">Detected devices</Label>
              <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={handleDetect} disabled={detecting}>
                <RefreshCw className={`h-3 w-3 ${detecting ? "animate-spin" : ""}`} />
                {detecting ? "Scanning…" : "Re-scan"}
              </Button>
            </div>
            {detecting && <div className="flex items-center gap-2 text-sm text-muted-foreground py-3"><Loader2 className="h-4 w-4 animate-spin" /> Detecting connected printers…</div>}
            {!detecting && detected.length === 0 && <div className="rounded-lg border border-dashed px-4 py-4 text-center text-sm text-muted-foreground">No printers detected. Connect the USB cable and click Re-scan.</div>}
            {!detecting && detected.map((p) => {
              const alreadyInstalled = Object.values(installedUris).some((u) => u === p.uri);
              const installedName = alreadyInstalled ? Object.entries(installedUris).find(([, u]) => u === p.uri)?.[0] : null;
              return (
                <div key={p.uri} className={`rounded-lg border px-3 py-2.5 mb-2 space-y-2 ${alreadyInstalled ? "border-green-200 bg-green-50/50" : ""}`}>
                  <div className="flex items-center gap-2">
                    {p.type === "usb" ? <Usb className="h-4 w-4 text-muted-foreground flex-shrink-0" /> : <Wifi className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.model}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">{p.uri}</p>
                    </div>
                    {alreadyInstalled && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full shrink-0 flex items-center gap-1"><PrinterCheck className="h-3 w-3" /> {installedName}</span>}
                  </div>
                  {!alreadyInstalled && (
                    <div className="flex gap-2">
                      <Input className="h-8 text-xs flex-1" placeholder="Printer name" value={editNames[p.uri] ?? p.suggestedName} onChange={(e) => setEditNames((prev) => ({ ...prev, [p.uri]: e.target.value }))} />
                      <Button size="sm" className="h-8 gradient-primary text-primary-foreground border-0 gap-1 whitespace-nowrap" disabled={activating === p.uri} onClick={() => handleActivate(p)}>
                        {activating === p.uri ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Activating…</> : <><PrinterCheck className="h-3.5 w-3.5" /> Activate</>}
                      </Button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-xs text-muted-foreground">Print queue</Label>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={loadPrintJobs} disabled={loadingJobs}>
                  <RefreshCw className={`h-3 w-3 ${loadingJobs ? "animate-spin" : ""}`} /> Refresh
                </Button>
                {printJobs.length > 0 && (
                  <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs text-destructive hover:text-destructive" onClick={handleClearQueue} disabled={clearingJobs}>
                    {clearingJobs ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash className="h-3 w-3" />} Clear all
                  </Button>
                )}
              </div>
            </div>
            {printJobs.length === 0
              ? <p className="text-xs text-muted-foreground px-1">No pending jobs — queue is clear.</p>
              : <div className="space-y-1 max-h-28 overflow-y-auto">{printJobs.map((job, i) => <div key={i} className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs font-mono text-amber-800 truncate">{job}</div>)}</div>}
          </div>

          <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Re-check agent status
          </Button>
        </TabsContent>
      </Tabs>

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Or type the exact printer name</Label>
        <Input
          className="h-10"
          placeholder="e.g. POS-80C"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <Button onClick={save} disabled={!manualName.trim() && !selected && !usbSelected} className="gradient-primary text-primary-foreground border-0">
          Save
        </Button>
      </div>
    </div>
  );
}
