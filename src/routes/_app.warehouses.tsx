import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, CheckCircle, XCircle, Truck, Info, Package, ClipboardList, Warehouse } from "lucide-react";
import { api, type WarehouseRequest } from "@/lib/api";

export const Route = createFileRoute("/_app/warehouses")({ component: Warehouses });

const APPROVAL_LABEL: Record<string, string> = {
  pending: "Request Generated",
  approved: "Approved",
  rejected: "Unapproved",
};

const APPROVAL_CLASS: Record<string, string> = {
  pending: "bg-warning/20 text-warning-foreground border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

const DELIVERY_LABEL: Record<string, string> = {
  pending: "Pending",
  in_transit: "On Way",
  delivered: "Delivered",
  failed: "Failed",
};

const DELIVERY_CLASS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  in_transit: "bg-primary/15 text-primary border-primary/20",
  delivered: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

function ApprovalBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`text-xs ${APPROVAL_CLASS[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {APPROVAL_LABEL[status] ?? status}
    </Badge>
  );
}

function DeliveryBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={`text-xs ${DELIVERY_CLASS[status] ?? "bg-muted text-muted-foreground border-border"}`}>
      {DELIVERY_LABEL[status] ?? status}
    </Badge>
  );
}

function F({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function Warehouses() {
  const [requests, setRequests] = useState<WarehouseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [viewReq, setViewReq] = useState<WarehouseRequest | null>(null);

  useEffect(() => {
    api.getWarehouseRequests().then(setRequests).finally(() => setLoading(false));
  }, []);

  const filtered = requests.filter(r =>
    !q
    || r.requestNumber?.toLowerCase().includes(q.toLowerCase())
    || r.sourceBranch?.name?.toLowerCase().includes(q.toLowerCase())
    || r.destinationBranch?.name?.toLowerCase().includes(q.toLowerCase())
    || r.supplier?.name?.toLowerCase().includes(q.toLowerCase())
  );

  const pendingCount = requests.filter(r => r.approvalStatus === "pending").length;
  const approvedCount = requests.filter(r => r.approvalStatus === "approved").length;
  const onWayCount = requests.filter(r => r.deliveryStatus === "in_transit").length;
  const deliveredCount = requests.filter(r => r.deliveryStatus === "delivered").length;

  return (
    <PageShell
      title="Warehouse Requests"
      subtitle="Inter-branch and supplier stock transfer requests"
      actions={
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow">
          + New Request
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pending Approval" value={String(pendingCount)} icon={ClipboardList} accent="warning" />
        <MetricCard label="Approved" value={String(approvedCount)} icon={CheckCircle} accent="success" />
        <MetricCard label="On Way" value={String(onWayCount)} icon={Truck} accent="primary" />
        <MetricCard label="Delivered" value={String(deliveredCount)} icon={Warehouse} accent="success" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search request #, branch, supplier…"
          className="h-9 w-64 flex-shrink-0"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Request ID</th>
                  <th className="px-3 py-3 font-semibold">Source</th>
                  <th className="px-3 py-3 font-semibold">Destination</th>
                  <th className="px-3 py-3 font-semibold">Items</th>
                  <th className="px-3 py-3 font-semibold">Requested By</th>
                  <th className="px-3 py-3 font-semibold">Approval</th>
                  <th className="px-3 py-3 font-semibold">Delivery</th>
                  <th className="px-3 py-3 font-semibold">Created</th>
                  <th className="px-3 py-3 font-semibold">Notes</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs font-bold">{r.requestNumber}</td>
                    <td className="px-3 py-3 text-xs">{r.sourceBranch?.name ?? r.supplier?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{r.destinationBranch?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <Package className="h-3 w-3" />
                        {r.items?.length ?? 0} item{(r.items?.length ?? 0) !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">—</td>
                    <td className="px-3 py-3"><ApprovalBadge status={r.approvalStatus} /></td>
                    <td className="px-3 py-3"><DeliveryBadge status={r.deliveryStatus} /></td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString("en-SA")}
                    </td>
                    <td className="px-3 py-3 text-xs max-w-[120px] truncate text-muted-foreground">
                      {r.notes ?? "—"}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewReq(r)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {r.approvalStatus === "pending" && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-success">
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                              <XCircle className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">
                      No requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={!!viewReq} onOpenChange={v => !v && setViewReq(null)}>
        <SheetContent className="w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              {viewReq?.requestNumber}
            </SheetTitle>
          </SheetHeader>
          {viewReq && (
            <div className="mt-4 space-y-4">
              <div className="flex gap-2">
                <ApprovalBadge status={viewReq.approvalStatus} />
                <DeliveryBadge status={viewReq.deliveryStatus} />
              </div>

              <Tabs defaultValue="items">
                <TabsList>
                  <TabsTrigger value="items" className="gap-1.5">
                    <Package className="h-3.5 w-3.5" />Items
                  </TabsTrigger>
                  <TabsTrigger value="notes" className="gap-1.5">
                    <Info className="h-3.5 w-3.5" />Notes
                  </TabsTrigger>
                  <TabsTrigger value="tracking" className="gap-1.5">
                    <Truck className="h-3.5 w-3.5" />Tracking
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="items" className="mt-4 space-y-3">
                  <F label="Source" value={viewReq.sourceBranch?.name ?? viewReq.supplier?.name ?? "—"} />
                  <F label="Destination" value={viewReq.destinationBranch?.name ?? "—"} />
                  <F label="Created" value={new Date(viewReq.createdAt).toLocaleDateString("en-SA")} />
                  {viewReq.items && viewReq.items.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                        Requested Items
                      </p>
                      <div className="space-y-2">
                        {viewReq.items.map((item, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between rounded-xl border border-border/40 p-3 text-sm"
                          >
                            <div>
                              <p className="font-medium">{item.product?.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground font-mono">{item.product?.sku ?? ""}</p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <p>Req: <span className="font-semibold text-foreground">{item.requestedQuantity}</span></p>
                              {item.approvedQuantity != null && (
                                <p>Approved: <span className="font-semibold text-success">{item.approvedQuantity}</span></p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No items attached.</p>
                  )}
                </TabsContent>

                <TabsContent value="notes" className="mt-4">
                  {viewReq.notes ? (
                    <p className="text-sm">{viewReq.notes}</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">No notes for this request.</p>
                  )}
                </TabsContent>

                <TabsContent value="tracking" className="mt-4 space-y-4">
                  {[
                    { label: "Request Generated", done: true },
                    { label: "Approved", done: viewReq.approvalStatus === "approved" },
                    { label: "On Way", done: viewReq.deliveryStatus === "in_transit" || viewReq.deliveryStatus === "delivered" },
                    { label: "Delivered", done: viewReq.deliveryStatus === "delivered" },
                  ].map((step, i) => (
                    <div key={i} className="flex items-center gap-3 text-sm">
                      <div
                        className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                          step.done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <span className={step.done ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
                    </div>
                  ))}
                  {viewReq.approvalStatus === "pending" && (
                    <div className="flex gap-2 pt-4 border-t border-border/40">
                      <Button size="sm" className="gradient-primary text-primary-foreground border-0 flex-1">
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive flex-1">
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />Reject
                      </Button>
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
