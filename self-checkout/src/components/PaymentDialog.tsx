import { useEffect, useState } from "react";
import { CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { SARIcon } from "../lib/currency";
import { useSession } from "../lib/session";

type Status = "idle" | "waiting" | "success" | "failed";

function CardMachineStatus({ status }: { status: Status }) {
  const map: Record<Status, { c: string; l: string }> = {
    idle: { c: "bg-success/15 text-success", l: "Connected · Ready" },
    waiting: { c: "bg-warning/20 text-warning-foreground", l: "Waiting for payment…" },
    success: { c: "bg-success/15 text-success", l: "Payment Approved" },
    failed: { c: "bg-destructive/15 text-destructive", l: "Payment Failed" },
  };
  const { c, l } = map[status];
  return (
    <div className={`rounded-xl p-4 flex items-center gap-3 ${c}`}>
      {status === "success" ? (
        <CheckCircle2 className="h-5 w-5" />
      ) : status === "waiting" ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : (
        <CreditCard className="h-5 w-5" />
      )}
      <span className="font-semibold">{l}</span>
    </div>
  );
}

export function PaymentDialog({
  open,
  onOpenChange,
  total,
  onCharge,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  total: number;
  /** Charges the card and creates the order — throw to signal failure. */
  onCharge: () => Promise<void>;
  onDone: () => void;
}) {
  const { terminalName } = useSession();
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus("idle");
      setErrorMsg(null);
    }
  }, [open]);

  async function charge() {
    setStatus("waiting");
    try {
      await onCharge();
      setStatus("success");
      setTimeout(onDone, 800);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Payment failed. Please try again.");
      setStatus("failed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setStatus("idle"); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            Take Payment — <SARIcon />
            {total.toFixed(2)}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <CardMachineStatus status={status} />
          <div className="rounded-lg bg-muted/40 p-3 text-sm">
            Card machine: <strong>{terminalName ?? "Self-Checkout Terminal"}</strong>
          </div>
          <p className="text-center text-sm text-muted-foreground">Tap, insert, or swipe your card to pay.</p>
        </div>

        {status === "failed" && (
          <p className="text-sm text-destructive text-center">{errorMsg ?? "Payment failed. Please try again."}</p>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={status === "waiting"}>
            Cancel
          </Button>
          <Button
            className="gradient-primary text-primary-foreground border-0"
            disabled={status === "waiting" || status === "success"}
            onClick={charge}
          >
            {status === "waiting" ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                Processing…
              </>
            ) : status === "success" ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-1" />
                Done
              </>
            ) : (
              "Confirm Payment"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
