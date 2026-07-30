import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Pause, RotateCcw, ShoppingCart, Trash2, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SARIcon } from "@/lib/currency";
import { ModuleGate } from "@/components/role-gate";
import { getPosBranchId } from "@/lib/utils";

export const Route = createFileRoute("/_app/held-orders")({
  component: () => (
    <ModuleGate module="POS">
      <HeldOrders />
    </ModuleGate>
  ),
});

// Matches the shape POS (_app.pos.tsx) writes to `pos_holds_${branchId}` — read-only here, this
// screen never mutates a held bill itself, only resumes (hands the id back to /pos) or discards it.
type HeldOrder = {
  id: string;
  items: { name: string; sku: string; qty: number; price: number }[];
  total: number;
  at: string;
  customer: { fullName: string } | null;
  couponCode: string;
};

function HeldOrders() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [holds, setHolds] = useState<HeldOrder[]>([]);
  const [discardId, setDiscardId] = useState<string | null>(null);

  // Must resolve to the exact same branch POS itself is keying `pos_holds_${branchId}` under —
  // this used to be derived independently from the cashier's own shift, which showed 0 bills here
  // whenever POS's actual branch (an admin's manual pick, persisted separately) didn't match.
  const branchId = getPosBranchId(user);

  const reloadHolds = useCallback(() => {
    if (!branchId) { setHolds([]); return; }
    try {
      const saved = sessionStorage.getItem(`pos_holds_${branchId}`);
      setHolds(saved ? (JSON.parse(saved) as HeldOrder[]) : []);
    } catch { setHolds([]); }
  }, [branchId]);
  useEffect(reloadHolds, [reloadHolds]);

  const discard = (id: string) => {
    if (!branchId) return;
    const next = holds.filter((h) => h.id !== id);
    setHolds(next);
    sessionStorage.setItem(`pos_holds_${branchId}`, JSON.stringify(next));
    setDiscardId(null);
  };

  return (
    <PageShell title="Held Orders" subtitle="Parked bills waiting to be resumed at checkout">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">
          {holds.length} bill{holds.length === 1 ? "" : "s"} on hold
        </p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate({ to: "/pos", search: { resumeHold: undefined } })}>
          <ShoppingCart className="h-3.5 w-3.5" /> Back to Checkout
        </Button>
      </div>

      {holds.length === 0 ? (
        <Card className="p-10 border-border/60 text-center">
          <Pause className="h-8 w-8 mx-auto text-muted-foreground/50" />
          <p className="text-sm font-medium mt-3">No orders on hold</p>
          <p className="text-xs text-muted-foreground mt-1">Bills paused from POS Checkout will appear here.</p>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {holds.map((h) => (
            <Card key={h.id} className="p-4 border-border/60 shadow-card flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-bold text-primary">{h.id}</p>
                  <p className="text-[11px] text-muted-foreground">Held at {h.at}</p>
                </div>
                <Badge variant="outline" className="text-[10px]">{h.items.length} item{h.items.length === 1 ? "" : "s"}</Badge>
              </div>

              <div className="text-xs text-muted-foreground space-y-0.5">
                {h.items.slice(0, 4).map((i) => (
                  <p key={i.sku} className="truncate">{i.qty} × {i.name}</p>
                ))}
                {h.items.length > 4 && <p>+{h.items.length - 4} more</p>}
              </div>

              {h.customer && (
                <p className="text-xs flex items-center gap-1 text-muted-foreground">
                  <User className="h-3 w-3" /> {h.customer.fullName}
                </p>
              )}
              {h.couponCode && (
                <p className="text-xs text-muted-foreground">Coupon: <span className="font-medium">{h.couponCode}</span></p>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-border/60">
                <p className="text-base font-bold tabular-nums"><SARIcon />{h.total.toFixed(2)}</p>
                <div className="flex gap-1.5">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" title="Discard" onClick={() => setDiscardId(h.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" className="h-8 gap-1.5 gradient-primary text-primary-foreground border-0"
                    onClick={() => navigate({ to: "/pos", search: { resumeHold: h.id } })}>
                    <RotateCcw className="h-3.5 w-3.5" /> Resume
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!discardId} onOpenChange={(v) => !v && setDiscardId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Discard held order?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">This bill and its items will be permanently discarded — it can't be resumed after this.</p>
          <DialogFooter className="gap-2 mt-2">
            <Button variant="outline" onClick={() => setDiscardId(null)}>Cancel</Button>
            <Button variant="destructive" onClick={() => discardId && discard(discardId)}>Discard</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
