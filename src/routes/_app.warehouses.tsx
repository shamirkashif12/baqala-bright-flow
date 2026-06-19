import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, CheckCircle, XCircle, Truck, Info, Package, ClipboardList, Warehouse, Plus, Trash2, X } from "lucide-react";
import { api, type WarehouseRequest, type Warehouse as WarehouseType, type Branch, type Product } from "@/lib/api";

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

type RequestItem = { productId: string; product: Product; requestedQuantity: number };

function NewRequestSheet({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [destinationBranchId, setDestinationBranchId] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<RequestItem[]>([]);

  const [pickProductId, setPickProductId] = useState("");
  const [pickQty, setPickQty] = useState("1");
  const [productSearch, setProductSearch] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api.getWarehouses().then(setWarehouses);
    api.getBranches("active").then(setBranches);
    api.getProducts().then(setProducts);
  }, [open]);

  const filteredProducts = products.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addItem = () => {
    const product = products.find(p => p.id === pickProductId);
    if (!product) return;
    const qty = parseInt(pickQty) || 1;
    setItems(prev => {
      const existing = prev.findIndex(i => i.productId === pickProductId);
      if (existing >= 0) {
        return prev.map((i, idx) => idx === existing ? { ...i, requestedQuantity: i.requestedQuantity + qty } : i);
      }
      return [...prev, { productId: product.id, product, requestedQuantity: qty }];
    });
    setPickProductId("");
    setPickQty("1");
    setProductSearch("");
  };

  const removeItem = (productId: string) =>
    setItems(prev => prev.filter(i => i.productId !== productId));

  const updateQty = (productId: string, qty: number) =>
    setItems(prev => prev.map(i => i.productId === productId ? { ...i, requestedQuantity: Math.max(1, qty) } : i));

  const handleSubmit = async () => {
    if (!destinationBranchId) { setError("Destination branch is required."); return; }
    if (items.length === 0) { setError("Add at least one item."); return; }
    setSaving(true);
    setError(null);
    try {
      const sourceBranch = sourceWarehouseId
        ? warehouses.find(w => w.id === sourceWarehouseId)?.branchWarehouses?.[0]?.branchId
        : undefined;
      await api.createWarehouseRequest({
        sourceBranchId: sourceBranch,
        destinationBranchId,
        notes: notes || undefined,
        items: items.map(i => ({ productId: i.productId, requestedQuantity: i.requestedQuantity })) as never,
      });
      onCreated();
      onOpenChange(false);
      setSourceWarehouseId(""); setDestinationBranchId(""); setNotes(""); setItems([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit request.");
    } finally {
      setSaving(false);
    }
  };

  const totalUnits = items.reduce((s, i) => s + i.requestedQuantity, 0);

  return (
    <Sheet open={open} onOpenChange={v => { onOpenChange(v); if (!v) { setError(null); } }}>
      <SheetContent className="w-[520px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <Warehouse className="h-5 w-5 text-primary" />
            New Warehouse Request
          </SheetTitle>
        </SheetHeader>

        <div className="mt-5 space-y-5">
          {/* Source & Destination */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Source Warehouse</Label>
              <Select value={sourceWarehouseId} onValueChange={setSourceWarehouseId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select warehouse…" />
                </SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => (
                    <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Destination Branch <span className="text-destructive">*</span></Label>
              <Select value={destinationBranchId} onValueChange={setDestinationBranchId}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select branch…" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map(b => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Add Items */}
          <div className="space-y-3">
            <Label className="text-xs font-medium">Items <span className="text-destructive">*</span></Label>

            {/* Product picker */}
            <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-muted/20">
              <Input
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
                placeholder="Search product name or SKU…"
                className="h-8 text-xs"
              />
              <div className="flex gap-2">
                <Select value={pickProductId} onValueChange={setPickProductId}>
                  <SelectTrigger className="h-8 flex-1 text-xs">
                    <SelectValue placeholder="Select product…" />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredProducts.slice(0, 50).map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-medium">{p.name}</span>
                        {p.sku && <span className="ml-2 text-muted-foreground text-xs font-mono">{p.sku}</span>}
                      </SelectItem>
                    ))}
                    {filteredProducts.length === 0 && (
                      <div className="px-3 py-2 text-xs text-muted-foreground">No products found.</div>
                    )}
                  </SelectContent>
                </Select>
                <Input
                  type="number"
                  min={1}
                  value={pickQty}
                  onChange={e => setPickQty(e.target.value)}
                  className="h-8 w-20 text-xs"
                  placeholder="Qty"
                />
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 gap-1"
                  onClick={addItem}
                  disabled={!pickProductId}
                >
                  <Plus className="h-3.5 w-3.5" />Add
                </Button>
              </div>
            </div>

            {/* Items list */}
            {items.length > 0 ? (
              <div className="space-y-1.5">
                {items.map(item => (
                  <div
                    key={item.productId}
                    className="flex items-center justify-between rounded-xl border border-border/40 px-3 py-2.5 bg-background"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      {item.product.sku && (
                        <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <Input
                        type="number"
                        min={1}
                        value={item.requestedQuantity}
                        onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)}
                        className="h-7 w-16 text-xs text-center"
                      />
                      <span className="text-xs text-muted-foreground">units</span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => removeItem(item.productId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-right pt-1">
                  {items.length} product{items.length !== 1 ? "s" : ""} · {totalUnits} unit{totalUnits !== 1 ? "s" : ""} total
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">No items added yet.</p>
            )}
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Reason for request, urgency, special handling…"
              rows={3}
              className="resize-none text-sm"
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-2 border-t border-border/60">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              className="flex-1 gradient-primary text-primary-foreground border-0"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? "Submitting…" : "Submit Request"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Warehouses() {
  const [requests, setRequests] = useState<WarehouseRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [deliveryFilter, setDeliveryFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [viewReq, setViewReq] = useState<WarehouseRequest | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const load = () => {
    api.getWarehouseRequests().then(setRequests).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = requests.filter(r => {
    const mq = !q
      || r.requestNumber?.toLowerCase().includes(q.toLowerCase())
      || r.sourceBranch?.name?.toLowerCase().includes(q.toLowerCase())
      || r.destinationBranch?.name?.toLowerCase().includes(q.toLowerCase())
      || r.supplier?.name?.toLowerCase().includes(q.toLowerCase());
    const ma = approvalFilter === "all" || r.approvalStatus === approvalFilter;
    const md = deliveryFilter === "all" || r.deliveryStatus === deliveryFilter;
    const mdf = !dateFrom || (!!r.createdAt && r.createdAt >= dateFrom);
    const mdt = !dateTo || (!!r.createdAt && r.createdAt <= dateTo + "T23:59:59");
    return mq && ma && md && mdf && mdt;
  });

  const pendingCount = requests.filter(r => r.approvalStatus === "pending").length;
  const approvedCount = requests.filter(r => r.approvalStatus === "approved").length;
  const onWayCount = requests.filter(r => r.deliveryStatus === "in_transit").length;
  const deliveredCount = requests.filter(r => r.deliveryStatus === "delivered").length;

  const handleApprove = async (id: string, approved: boolean) => {
    await api.approveWarehouseRequest(id, approved, "current-user");
    load();
  };

  return (
    <PageShell
      title="Warehouse Requests"
      subtitle="Inter-branch and supplier stock transfer requests"
      actions={
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setNewOpen(true)}>
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
        <Select value={approvalFilter} onValueChange={setApprovalFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Approvals</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Delivery" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Delivery</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_transit">On Way</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Date:</span>
          <Input type="date" className="h-9 w-36" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" className="h-9 w-36" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          {(dateFrom || dateTo) && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => { setDateFrom(""); setDateTo(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
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
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-success"
                              onClick={() => handleApprove(r.id, true)}
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                              onClick={() => handleApprove(r.id, false)}
                            >
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
                    <td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">
                      No requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <NewRequestSheet
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={() => { setLoading(true); load(); }}
      />

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
                          <div key={i} className="flex items-center justify-between rounded-xl border border-border/40 p-3 text-sm">
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
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${step.done ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                        <CheckCircle className="h-4 w-4" />
                      </div>
                      <span className={step.done ? "font-medium" : "text-muted-foreground"}>{step.label}</span>
                    </div>
                  ))}
                  {viewReq.approvalStatus === "pending" && (
                    <div className="flex gap-2 pt-4 border-t border-border/40">
                      <Button
                        size="sm"
                        className="gradient-primary text-primary-foreground border-0 flex-1"
                        onClick={() => { handleApprove(viewReq.id, true); setViewReq(null); }}
                      >
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5" />Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive flex-1"
                        onClick={() => { handleApprove(viewReq.id, false); setViewReq(null); }}
                      >
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
