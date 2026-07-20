import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "./ui/dialog";
import { Button } from "./ui/button";

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"];

export function PinPadDialog({
  open,
  title,
  pinLength,
  error,
  verifying,
  onSubmit,
  onCancel,
}: {
  open: boolean;
  title: string;
  // Exact digit count for the configured PIN — the pad shows exactly this many slots and
  // won't accept more, rather than always assuming the 6-digit maximum a PIN can be.
  pinLength: number;
  error: string | null;
  verifying: boolean;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    if (open) setPin("");
  }, [open]);

  // A wrong PIN would otherwise sit there fully typed with the Enter button still enabled,
  // inviting a pointless resubmit of the same wrong value — clear it so retyping is obvious.
  useEffect(() => {
    if (error) setPin("");
  }, [error]);

  function press(key: string) {
    if (verifying) return;
    if (key === "⌫") { setPin((p) => p.slice(0, -1)); return; }
    if (key === "" || pin.length >= pinLength) return;
    setPin((p) => p + key);
  }

  // Lets staff type the PIN on a physical keyboard too, not just tap the pad — and
  // swallows those keydowns before Scan.tsx's global barcode-scanner listener can treat
  // stray digits as scan input (see kiosk-lockdown.tsx for why capture+stopImmediatePropagation).
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (verifying) return;
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        e.stopImmediatePropagation();
        press(e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        e.stopImmediatePropagation();
        press("⌫");
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopImmediatePropagation();
        if (pin.length === pinLength) onSubmit(pin);
      }
    }
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, verifying, pin, pinLength]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
      <DialogContent className="max-w-xs">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{pinLength}-digit staff PIN required.</DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-2.5 py-1">
          {Array.from({ length: pinLength }).map((_, i) => (
            <span
              key={i}
              className={`h-3.5 w-3.5 rounded-full border border-primary/50 ${i < pin.length ? "bg-primary" : "bg-transparent"}`}
            />
          ))}
        </div>

        {error && <p className="text-center text-sm font-medium text-destructive">{error}</p>}

        <div className="grid grid-cols-3 gap-2">
          {PAD_KEYS.map((key, i) =>
            key === "" ? (
              <div key={i} />
            ) : (
              <Button
                key={i}
                type="button"
                variant="outline"
                className="h-14 text-xl font-semibold"
                disabled={verifying}
                onClick={() => press(key)}
              >
                {key}
              </Button>
            ),
          )}
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="ghost" className="flex-1" disabled={verifying} onClick={onCancel}>
            Cancel
          </Button>
          <Button
            className="flex-1 gradient-primary text-primary-foreground border-0"
            disabled={pin.length !== pinLength || verifying}
            onClick={() => onSubmit(pin)}
          >
            {verifying ? "Checking…" : "Enter"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
