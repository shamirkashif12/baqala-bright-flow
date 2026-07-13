import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";

const AUTO_RETURN_SECONDS = 10;

export function CompleteDialog({ open, onNewOrder }: { open: boolean; onNewOrder: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(AUTO_RETURN_SECONDS);

  useEffect(() => {
    if (!open) return;
    setSecondsLeft(AUTO_RETURN_SECONDS);
    const interval = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    const timeout = setTimeout(onNewOrder, AUTO_RETURN_SECONDS * 1000);
    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
    // onNewOrder is stable (identity doesn't need to reset the countdown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open}>
      <DialogContent className="max-w-sm text-center [&>button]:hidden">
        <DialogTitle className="sr-only">Order complete</DialogTitle>
        <div className="flex flex-col items-center gap-4 py-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-success/15">
            <CheckCircle2 className="h-9 w-9 text-success" />
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold">Thank you for shopping!</h2>
            <p className="mt-1 text-sm text-muted-foreground">Your receipt has been printed. Have a great day.</p>
          </div>
          <Button
            className="h-12 w-full text-base gradient-primary text-primary-foreground border-0 shadow-glow"
            onClick={onNewOrder}
          >
            Start New Order
          </Button>
          <p className="text-xs text-muted-foreground">Returning to start in {secondsLeft}s…</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
