import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Toolbar, StatusBadge } from "@/components/module-placeholder";
import { Eye, CheckCircle, XCircle, Truck, Info, Package } from "lucide-react";
import { api, type WarehouseRequest } from "@/lib/api";

export const Route = createFileRoute("/_app/warehouses")({ component: Warehouses });

function F({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function ApprovalBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-success/15 text-success",
    pending: "bg-warning/20 text-warning-foreground",
    rejected: "bg-destructive/15 text-destructive",
  };
  return <Badge className={`${map[status] ?? "bg-muted"} border-0 text-xs capitalize`}>{status}</Badge>;
}

function DeliveryBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    in_transit: "bg-primary/15 text-primary",
    delivered: "bg-success/15 text-success",
    failed: "bg-destructive/15 text-destructive",
  };
  return <Badge className={`${map[status] ?? "bg-muted"} border-0 text-xs`}>{status.replace("_", " ")}</Badge>;
}

function Warehouses() {
  const [requests, setRequests] = useState<WarehouseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [viewReq, setViewReq] = useState<WarehouseRequest | null>(null);

  useEffect(() => {
    api.getWarehouseRequests()
      .then(setRequests)
      .finally(() => setLoading(false));
  }, []);

  const filtered = requests.filter(r => {
    return !q
      || r.requestNumber?.toLowerCase().includes(q.toLowerCase())
      || r.sourceBranch?.name?.toLowerCase().includes(q.toLowerCase())
      || r.destinationBranch?.name?.toLowerCase().includes(q.toLowerCase())
      || r.supplier?.name?.toLowerCase().includes(q.toLowerCase());
  });

  return (
    <PageShell title="Warehouse Requests" subtitle="Inter-branch and supplier stock transfer requests">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search request#, branch, supplier…" className="h-9 w-64 flex-shrink-0" />
        <div className="flex-1" />
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow h-9">+ New Request</Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Request#</th>
                  <th className="px-3 py-3 font-semibold">Source</th>
                  <th className="px-3 py-3 font-semibold">Destination</th>
                  <th className="px-3 py-3 font-semibold">Supplier</th>
                  <th className="px-3 py-3 font-semibold">Approval</th>
                  <th className="px-3 py-3 font-semibold">Delivery</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs font-bold">{r.requestNumber}</td>
                    <td className="px-3 py-3 text-xs">{r.sourceBranch?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{r.destinationBranch?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{r.supplier?.name ?? "—"}</td>
                    <td className="px-3 py-3"><ApprovalBadge status={r.approvalStatus} /></td>
                    <td className="px-3 py-3"><DeliveryBadge status={r.deliveryStatus} /></td>
                    <td className="px-3 py-3 text-xs">{new Date(r.createdAt).toLocaleDateString("en-SA")}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewReq(r)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {r.approvalStatus === "pending" && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-success"><CheckCircle className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive"><XCircle className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">No requests found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Detail sheet */}
      <Sheet open={!!viewReq} onOpenChange={v => !v && setViewReq(null)}>
        <SheetContent className="w-[480px]">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              {viewReq?.requestNumber}
            </SheetTitle>
          </SheetHeader>
          {viewReq && (
            <Tabs defaultValue="items" className="mt-4">
              <TabsList>
                <TabsTrigger value="items" className="gap-1.5"><Package className="h-3.5 w-3.5" />Items</TabsTrigger>
                <TabsTrigger value="notes" className="gap-1.5"><Info className="h-3.5 w-3.5" />Notes</TabsTrigger>
                <TabsTrigger value="tracking" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Tracking</TabsTrigger>
              </TabsList>

              <TabsContent value="items" className="mt-4 space-y-3">
                <F label="Source" value={viewReq.sourceBranch?.name ?? "—"} />
                <F label="Destination" value={viewReq.destinationBranch?.name ?? "—"} />
                <F label="Supplier" value={viewReq.supplier?.name ?? "—"} />
                <F label="Approval" value={viewReq.approvalStatus} />
                <F label="Delivery" value={viewReq.deliveryStatus ?? "—"} />
                {viewReq.items && viewReq.items.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Items</p>
                    <div className="space-y-2">
                      {viewReq.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between rounded-xl border border-border/40 p-3 text-sm">
                          <div>
                            <p className="font-medium">{item.product?.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground font-mono">{item.product?.sku ?? ""}</p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>Req: {item.requestedQuantity}</p>
                            {item.approvedQuantity != null && <p>Approved: {item.approvedQuantity}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="notes" className="mt-4">
                <p className="text-xs text-muted-foreground">No notes for this request.</p>
              </TabsContent>

              <TabsContent value="tracking" className="mt-4 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${viewReq.approvalStatus !== "pending" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <span>Approval: <strong className="capitalize">{viewReq.approvalStatus}</strong></span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div className={`h-8 w-8 rounded-full flex items-center justify-center ${viewReq.deliveryStatus === "delivered" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                    <Truck className="h-4 w-4" />
                  </div>
                  <span>Delivery: <strong className="capitalize">{viewReq.deliveryStatus?.replace("_", " ") ?? "Pending"}</strong></span>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
