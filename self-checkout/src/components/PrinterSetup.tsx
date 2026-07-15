import { useEffect, useState } from "react";
import { Printer, RefreshCw, Wifi, AlertCircle, PrinterCheck, Usb, Loader2, Trash } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  getPrinterStatus, getReceiptPrinter, setReceiptPrinter,
  getPrinterBase, PRINTER_API_KEY, DEFAULT_PRINTER_AGENT,
  detectPrinters, activatePrinter, removePrinter, getPrintJobs, cancelAllJobs,
  type DetectedPrinter,
} from "../lib/api";

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
  const [installed, setInstalled] = useState<string[]>([]);
  const [installedUris, setInstalledUris] = useState<Record<string, string>>({});
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(getReceiptPrinter() ?? "");
  const [manualName, setManualName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Agent URL — same "Local Agent" system as the staff POS: the printer agent is a
  // per-terminal HTTP service, so each kiosk needs to point at its own machine/LAN
  // address rather than assuming localhost:5008 always resolves correctly.
  const [agentUrl, setAgentUrl] = useState<string>(() => getPrinterBase());
  const [agentUrlInput, setAgentUrlInput] = useState<string>(() => getPrinterBase());
  const [testingAgent, setTestingAgent] = useState(false);
  const [agentOk, setAgentOk] = useState<boolean | null>(null);

  // USB/network printer detection
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedPrinter[]>([]);
  const [editNames, setEditNames] = useState<Record<string, string>>({});
  const [activating, setActivating] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);

  // Print queue
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
    load();
    handleDetect();
    loadPrintJobs();
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Agent URL */}
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
                  onClick={() => { setSelected(name); setManualName(""); }}
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

      {/* Detected devices */}
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

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Or type the exact printer name</Label>
        <Input
          className="h-10"
          placeholder="e.g. POS-80C"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
        />
      </div>

      {/* Print queue */}
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

      <div className="flex justify-end gap-2 pt-2">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <Button onClick={save} disabled={!manualName.trim() && !selected} className="gradient-primary text-primary-foreground border-0">
          Save
        </Button>
      </div>
    </div>
  );
}
