import { useEffect, useState } from "react";
import { Printer, RefreshCw } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { getPrinterStatus, getReceiptPrinter, setReceiptPrinter } from "../lib/api";

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
        <DialogContent className="max-w-md">
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
  const [defaultPrinter, setDefaultPrinter] = useState<string | null>(null);
  const [selected, setSelected] = useState<string>(getReceiptPrinter() ?? "");
  const [manualName, setManualName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const status = await getPrinterStatus();
      setInstalled(status.installed);
      setDefaultPrinter(status.defaultPrinter);
      if (!selected && status.defaultPrinter) setSelected(status.defaultPrinter);
    } catch {
      setError("Couldn't reach the local print agent — make sure it's running on this terminal.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
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

      {installed.length > 0 && (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Detected printers</Label>
          <div className="flex flex-col gap-1.5">
            {installed.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => { setSelected(name); setManualName(""); }}
                className={`text-left rounded-lg border px-3 py-2 text-sm transition-colors ${
                  selected === name && !manualName
                    ? "border-primary bg-primary/10 font-semibold"
                    : "border-border hover:bg-muted/50"
                }`}
              >
                {name}
                {name === defaultPrinter && <span className="ml-2 text-[10px] text-muted-foreground">(agent default)</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">Or type the exact printer name</Label>
        <Input
          className="h-10"
          placeholder="e.g. POS-80C"
          value={manualName}
          onChange={(e) => setManualName(e.target.value)}
        />
      </div>

      <Button variant="outline" size="sm" className="gap-1.5" onClick={load} disabled={loading}>
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Re-scan printers
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
