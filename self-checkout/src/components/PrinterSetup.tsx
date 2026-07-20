import { useEffect, useState } from "react";
import {
  Printer,
  RefreshCw,
  AlertCircle,
  PrinterCheck,
  Loader2,
  CheckCircle2,
  Info,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import {
  getReceiptPrinter,
  setReceiptPrinter,
  getPrintMode,
  setPrintMode,
  setupInstallerUrl,
  qzTrustPs1Url,
  getUsbPrinter,
} from "../lib/api";
import { qzConnect, qzIsConnected, qzListPrinters } from "../lib/qz";

/** Visible entry point on the checkout screen itself — mirrors where the staff POS
 * puts its own "Printer Setup" button (top-right of the page), rather than being
 * tucked away on the idle/welcome screen where it's easy to miss. */
export function PrinterSetupDialog() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="gap-1.5 shrink-0"
        onClick={() => setOpen(true)}
      >
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
  const [trustOpen, setTrustOpen] = useState(false);

  const trustCommand = `powershell -c "iex(irm '${qzTrustPs1Url()}')"`;

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

  useEffect(() => {
    // QZ Tray is the only supported route now that the local-agent tab is gone, so pin the
    // stored mode here — terminals provisioned before this still carry mode="local".
    if (getPrintMode() !== "qz") setPrintMode("qz");
    const isQz = qzIsConnected();
    setQzConnected(isQz);
    if (isQz)
      qzListPrinters()
        .then(setQzPrinters)
        .catch(() => {});
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

      <div className="space-y-3">
        <div
          className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm ${qzConnected ? "bg-green-50 border border-green-200 text-green-700" : "bg-muted/50 border text-muted-foreground"}`}
        >
          {qzConnected ? (
            <>
              <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
              <span>
                QZ Tray connected — <strong>{qzPrinters.length}</strong> printer(s) found
              </span>
            </>
          ) : (
            <>
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>QZ Tray not connected</span>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto h-7 text-xs gap-1"
            onClick={handleQzConnect}
            disabled={connectingQz}
          >
            {connectingQz ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
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
              Download POS Setup Installer
            </a>
            <div className="space-y-1">
              <p>
                <span className="font-medium text-foreground">Windows:</span> Double-click{" "}
                <code className="bg-muted px-1 rounded">MiMony-POS-Setup.bat</code> → click{" "}
                <strong>Run</strong> → click <strong>Yes</strong>
              </p>
              <p>
                <span className="font-medium text-foreground">macOS:</span> Double-click{" "}
                <code className="bg-muted px-1 rounded">MiMony-POS-Setup.command</code>
              </p>
              <p>
                <span className="font-medium text-foreground">Linux:</span> Open Terminal → paste
                this command:
              </p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <code className="flex-1 bg-muted px-2 py-1 rounded text-[10px] break-all select-all">
                  bash ~/Downloads/MiMony-POS-Setup.sh
                </code>
                <button
                  type="button"
                  className="shrink-0 rounded px-2 py-1 bg-muted hover:bg-muted/70 text-xs"
                  onClick={() =>
                    navigator.clipboard.writeText("bash ~/Downloads/MiMony-POS-Setup.sh")
                  }
                >
                  Copy
                </button>
              </div>
            </div>
            <p>
              Installs QZ Tray silently + creates a POS shortcut on the Desktop. QZ Tray starts
              automatically on every boot.
            </p>

            {/* After-install steps — QZ Tray only attaches to browser tabs opened *after* it's
                running, so Chrome has to be restarted before the checkout can reach it. */}
            <div className="rounded-md bg-muted/50 px-3 py-2 space-y-1">
              <p className="font-medium text-foreground">After it installs:</p>
              <ol className="list-decimal list-inside space-y-0.5">
                <li>
                  Close <strong>all</strong> Chrome / browser windows so QZ Tray can attach.
                </li>
                <li>
                  Launch <strong>QZ Tray</strong> — look for its icon in the system tray
                  (bottom-right).
                </li>
                <li>
                  Reopen this checkout, click <strong>Connect</strong> above, then{" "}
                  <strong>select your printer</strong> below.
                </li>
              </ol>
            </div>

            {/* Details → opens the "already installed / fix trust popup" instructions */}
            <Button
              size="sm"
              variant="outline"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => setTrustOpen(true)}
            >
              <Info className="h-3.5 w-3.5" /> Details — already have QZ Tray installed?
            </Button>
          </div>
        )}

        {qzConnected && qzPrinters.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">
              Available Printers
            </p>
            <div className="space-y-1.5 max-h-48 overflow-y-auto">
              {qzPrinters.map((name) => {
                const isReceipt = selected === name && !manualName;
                return (
                  <div
                    key={name}
                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${isReceipt ? "border-primary bg-primary/10" : "border-border"}`}
                  >
                    <PrinterCheck
                      className={`h-4 w-4 flex-shrink-0 ${isReceipt ? "text-green-600" : "text-muted-foreground"}`}
                    />
                    <span className="flex-1 font-medium truncate">{name}</span>
                    {isReceipt ? (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full shrink-0">
                        Receipt Printer
                      </span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2 shrink-0"
                        onClick={() => selectPrinter(name)}
                      >
                        Use for receipts
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {qzConnected && qzPrinters.length === 0 && (
          <p className="text-xs text-muted-foreground px-1">
            No printers found. Make sure the printer driver is installed on this machine.
          </p>
        )}
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

      <div className="flex justify-end gap-2 pt-2">
        {onSkip && (
          <Button variant="ghost" onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <Button
          onClick={save}
          disabled={!manualName.trim() && !selected && !getUsbPrinter()}
          className="gradient-primary text-primary-foreground border-0"
        >
          Save
        </Button>
      </div>

      {/* Windows: fix "Action Required" / "Untrusted website" popup on a machine
          that already has QZ Tray installed manually — shown from the Details button. */}
      <Dialog open={trustOpen} onOpenChange={setTrustOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="h-5 w-5 text-primary" /> Windows: already have QZ Tray installed?
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2.5 text-sm text-muted-foreground">
            <p>
              If you get an "Action Required" / "Untrusted website" popup every time you print, run
              this once (as Admin) to make QZ Tray trust this POS permanently:
            </p>
            <div className="flex items-center gap-1.5">
              <code className="flex-1 bg-muted px-2 py-1.5 rounded text-xs break-all select-all">
                {trustCommand}
              </code>
              <button
                type="button"
                className="shrink-0 rounded px-2 py-1.5 bg-muted hover:bg-muted/70 text-xs"
                onClick={() => {
                  navigator.clipboard.writeText(trustCommand);
                  toast.success("Command copied");
                }}
              >
                Copy
              </button>
            </div>
            <p>Paste into Win+R or a terminal, press Enter, and accept the Admin prompt.</p>
          </div>

          <div className="flex justify-end pt-2">
            <Button variant="outline" onClick={() => setTrustOpen(false)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
