import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { CalendarClock, Ban, ShieldAlert, Download, X, Plus, Loader2, PackageX, CheckCircle2 } from "lucide-react";
import {
  api,
  type InventoryBatch, type Branch, type Warehouse, type Product,
  type ProductRecall, type RecallImpact, type RecallSeverity, type RecallType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { BatchStatusBadge as StatusBadge } from "@/components/batch-status-badge";
import { useCompanyHeader } from "@/lib/use-company-header";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/batches")({ component: Batches });

const RECALL_TYPES: { value: RecallType; label: string }[] = [
  { value: "supplier_notice", label: "Supplier notice" },
  { value: "quality_issue", label: "Quality issue" },
  { value: "contamination", label: "Contamination" },
  { value: "mislabeling", label: "Mislabeling" },
  { value: "regulatory", label: "Regulatory" },
  { value: "other", label: "Other" },
];

const SEVERITIES: RecallSeverity[] = ["low", "medium", "high", "critical"];

function SeverityBadge({ severity }: { severity: RecallSeverity }) {
  const cls = severity === "critical" || severity === "high"
    ? "bg-destructive/15 text-destructive"
    : severity === "medium" ? "bg-warning/20 text-warning-foreground" : "bg-muted text-muted-foreground";
  return <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${cls}`}>{severity}</span>;
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportCSV(data: InventoryBatch[], branches: Branch[], warehouses: Warehouse[], companyHeader: string) {
  const locationName = (b: InventoryBatch) => b.branchId
    ? branches.find(br => br.id === b.branchId)?.name ?? ""
    : warehouses.find(w => w.id === b.warehouseId)?.name ?? "";
  const rows: string[][] = [
    ["Product", "SKU", "Batch #", "Location", "Location Type", "Supplier", "Received Date", "Expiry Date", "Qty Received", "Qty Remaining", "Purchase Cost (SAR)", "Status"],
    ...data.map(b => [
      b.product?.name ?? "",
      b.product?.sku ?? "",
      b.batchNumber,
      locationName(b),
      b.branchId ? "Branch" : "Warehouse",
      b.supplier?.name ?? "",
      new Date(b.receivedDate).toISOString().slice(0, 10),
      b.expiryDate ? new Date(b.expiryDate).toISOString().slice(0, 10) : "",
      String(b.quantity),
      String(b.remainingQuantity),
      b.purchaseCost != null ? b.purchaseCost.toFixed(2) : "",
      b.status,
    ]),
  ];
  const lines = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(","));
  if (companyHeader) lines.unshift(`"${companyHeader.replace(/"/g, '""')}"`, "");
  const csv = lines.join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `batches-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ─── New recall dialog ────────────────────────────────────────────────────────

// Scope is (product, batch?): no batch means every lot of the product, which is the supplier-notice
// case; naming a batch confines it to that lot, which is the far more common food-safety case and
// the reason batches are tracked at all.
function NewRecallDialog({ open, onClose, onDone, branches }: {
  open: boolean; onClose: () => void; onDone: () => void; branches: Branch[];
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    productId: "", batchId: "", branchId: "", reason: "",
    recallType: "supplier_notice" as RecallType, severity: "high" as RecallSeverity, notes: "",
  });

  useEffect(() => {
    if (!open) return;
    api.getProducts({ status: "active" }).then(setProducts).catch(() => {});
  }, [open]);

  // Only lots of the chosen product can be recalled — the backend rejects a mismatch, but offering
  // the wrong ones would be a trap.
  useEffect(() => {
    if (!form.productId) { setBatches([]); return; }
    api.getBatches({ productId: form.productId })
      .then(bs => setBatches(bs.filter(b => b.remainingQuantity > 0)))
      .catch(() => setBatches([]));
  }, [form.productId]);

  const reset = () => {
    setForm({ productId: "", batchId: "", branchId: "", reason: "", recallType: "supplier_notice", severity: "high", notes: "" });
    setError(""); setBatches([]);
  };

  const save = async () => {
    if (!form.productId) return setError("Select a product.");
    if (!form.reason.trim()) return setError("A recall reason is required.");
    setSaving(true); setError("");
    try {
      await api.createRecall({
        productId: form.productId,
        batchId: form.batchId || undefined,
        branchId: form.branchId || undefined,
        reason: form.reason.trim(),
        recallType: form.recallType,
        severity: form.severity,
        notes: form.notes || undefined,
      });
      toast.success("Recall opened — the product is now blocked from sale");
      reset(); onDone(); onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to open recall.");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Open a product recall</DialogTitle></DialogHeader>
        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Product *</Label>
            <Select value={form.productId} onValueChange={v => setForm(p => ({ ...p, productId: v, batchId: "" }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue placeholder="Select product" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Batch / lot</Label>
            <Select value={form.batchId || "all"} onValueChange={v => setForm(p => ({ ...p, batchId: v === "all" ? "" : v }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All batches of this product</SelectItem>
                {batches.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.batchNumber} · {b.remainingQuantity} left
                    {b.expiryDate ? ` · exp ${new Date(b.expiryDate).toISOString().slice(0, 10)}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Leave as "All batches" for a supplier-wide notice. Only lots with stock on hand are listed.
            </p>
          </div>

          <div>
            <Label className="text-xs">Branch</Label>
            <Select value={form.branchId || "all"} onValueChange={v => setForm(p => ({ ...p, branchId: v === "all" ? "" : v }))}>
              <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Every branch</SelectItem>
                {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Type</Label>
              <Select value={form.recallType} onValueChange={v => setForm(p => ({ ...p, recallType: v as RecallType }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RECALL_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Severity</Label>
              <Select value={form.severity} onValueChange={v => setForm(p => ({ ...p, severity: v as RecallSeverity }))}>
                <SelectTrigger className="h-9 mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SEVERITIES.map(s => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Reason *</Label>
            <Input className="h-9 mt-1" placeholder="e.g. Supplier notice — possible glass contamination"
              value={form.reason} onChange={e => { setForm(p => ({ ...p, reason: e.target.value })); setError(""); }} />
          </div>

          <div>
            <Label className="text-xs">Notes</Label>
            <Textarea className="mt-1 text-sm" rows={2} placeholder="Reference numbers, supplier contact, instructions…"
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>

          <p className="text-[11px] text-muted-foreground bg-muted/40 rounded-md p-2 leading-relaxed">
            Opening a recall blocks the product at checkout immediately and notifies branch managers.
            It does <strong>not</strong> move any stock — the goods stay on the shelf and in the count until you
            quarantine them, so the inventory stays honest.
          </p>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={saving}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Open recall
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Recall impact sheet ──────────────────────────────────────────────────────

function RecallImpactDialog({ recallId, onClose }: { recallId: string | null; onClose: () => void }) {
  const [impact, setImpact] = useState<RecallImpact | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!recallId) { setImpact(null); return; }
    setLoading(true);
    api.getRecallImpact(recallId).then(setImpact).catch(() => setImpact(null)).finally(() => setLoading(false));
  }, [recallId]);

  return (
    <Dialog open={!!recallId} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Recall impact {impact ? `· ${impact.recallNumber}` : ""}</DialogTitle></DialogHeader>
        {loading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
        ) : !impact ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Couldn't load impact.</div>
        ) : (
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg border p-3">
                <p className="text-xl font-bold tabular-nums">{impact.totalOnHand}</p>
                <p className="text-[11px] text-muted-foreground">Still on hand</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xl font-bold tabular-nums">{impact.quantityQuarantined}</p>
                <p className="text-[11px] text-muted-foreground">Quarantined</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xl font-bold tabular-nums">{impact.soldUnits}</p>
                <p className="text-[11px] text-muted-foreground">Already sold</p>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">Where the stock is</p>
              {impact.locations.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No stock on hand — nothing left to pull from shelves.</p>
              ) : (
                <div className="rounded-lg border divide-y text-xs">
                  {impact.locations.map(l => (
                    <div key={l.batchId} className="flex items-center justify-between px-3 py-2">
                      <span className="font-mono">{l.batchNumber ?? l.batchId.slice(0, 8)}</span>
                      <span className="text-muted-foreground">{l.branchName ?? l.warehouseName ?? "—"}</span>
                      <span className="font-medium tabular-nums">{l.remainingQuantity}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground mb-1.5">
                Customers who bought the recalled lot
              </p>
              {impact.affectedSales.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2 leading-relaxed">
                  No sales traced to this lot. Note that only sales rung up after batch traceability was
                  enabled record which lot they came from — older sales can't be traced.
                </p>
              ) : (
                <>
                  {impact.affectedSalesTruncated && (
                    <p className="text-[11px] text-warning-foreground bg-warning/15 rounded p-1.5 mb-1.5">
                      Showing the 500 most recent only — export from Reports for the full list.
                    </p>
                  )}
                  <div className="rounded-lg border divide-y text-xs max-h-56 overflow-y-auto">
                    {impact.affectedSales.map(s => (
                      <div key={s.orderId} className="flex items-center justify-between px-3 py-2 gap-2">
                        <span className="font-mono shrink-0">{s.orderNumber}</span>
                        <span className="truncate flex-1 text-muted-foreground">
                          {s.customerName ?? "Walk-in (untraceable)"}
                          {s.customerPhone ? ` · ${s.customerPhone}` : ""}
                        </span>
                        <span className="tabular-nums shrink-0">{s.quantity}</span>
                        <span className="text-muted-foreground shrink-0">
                          {new Date(s.soldAt).toLocaleDateString("en-SA", { day: "2-digit", month: "short" })}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function Batches() {
  const { user } = useAuth();
  const companyHeader = useCompanyHeader();
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState(lockedBranchId ?? "all");
  const [warehouseFilter, setWarehouseFilter] = useState("all");
  // This page only ever shows the wastage watch-list (near-expiry + expired) — "all" here means
  // "both of those", not every status. Active/consumed batches belong on the Inventory page.
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");

  // ─── Recalls (FRD §13) ──────────────────────────────────────────────────────
  const recallPerms = usePermission("Batches");
  const [recalls, setRecalls] = useState<ProductRecall[]>([]);
  const [recallStatusFilter, setRecallStatusFilter] = useState<"open" | "closed" | "all">("open");
  const [newRecallOpen, setNewRecallOpen] = useState(false);
  const [impactId, setImpactId] = useState<string | null>(null);
  const [busyRecallId, setBusyRecallId] = useState<string | null>(null);

  async function loadRecalls() {
    try {
      setRecalls(await api.getRecalls({
        branchId: lockedBranchId ?? undefined,
        status: recallStatusFilter === "all" ? undefined : recallStatusFilter,
      }));
    } catch { setRecalls([]); }
  }

  const quarantine = async (r: ProductRecall) => {
    setBusyRecallId(r.id);
    try {
      const res = await api.quarantineRecall(r.id);
      toast.success(`Quarantined ${res.quarantined} unit(s)`, {
        description: "Written off as damage — it will appear in the Wastage report and stock movement timeline.",
      });
      await Promise.all([loadRecalls(), loadBatches()]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Quarantine failed");
    } finally { setBusyRecallId(null); }
  };

  const close = async (r: ProductRecall) => {
    setBusyRecallId(r.id);
    try {
      await api.closeRecall(r.id, "Resolved from Batches & Expiry");
      toast.success(`Recall ${r.recallNumber} closed — the product can be sold again`);
      await loadRecalls();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to close recall");
    } finally { setBusyRecallId(null); }
  };

  async function loadBatches() {
    setLoading(true);
    try {
      const data = await api.getBatches({
        branchId: lockedBranchId ?? (branchFilter !== "all" ? branchFilter : undefined),
        warehouseId: warehouseFilter !== "all" ? warehouseFilter : undefined,
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setBatches((data ?? []).filter(b => b.status === "near_expiry" || b.status === "expired"));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  // Load metadata once on mount
  useEffect(() => {
    api.getBranches().then(setBranches).catch(() => {});
    api.getWarehouses().then(setWarehouses).catch(() => {});
  }, []);

  // Branch-scoped roles can't be switched away from their own branch
  useEffect(() => {
    if (lockedBranchId) setBranchFilter(lockedBranchId);
  }, [lockedBranchId]);

  // Re-fetch batches from BE whenever a filter changes
  useEffect(() => {
    loadBatches();
  }, [branchFilter, warehouseFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadRecalls();
  }, [recallStatusFilter, lockedBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearExpiry = batches.filter(b => b.status === "near_expiry").length;
  const expired = batches.filter(b => b.status === "expired").length;
  // Always the count of *open* recalls regardless of the tab's filter — the card is a standing
  // "how many things are blocked from sale right now" number, not a view of the current filter.
  // Derived from the list already in hand when the filter is showing open recalls; only the
  // filtered-away cases cost a request.
  const [fetchedOpenCount, setFetchedOpenCount] = useState(0);
  const openRecallCount = recallStatusFilter === "open"
    ? recalls.length
    : recallStatusFilter === "all"
      ? recalls.filter(r => r.status === "open").length
      : fetchedOpenCount;

  useEffect(() => {
    if (recallStatusFilter !== "closed") return; // the other filters already carry the answer
    api.getRecalls({ branchId: lockedBranchId ?? undefined, status: "open" })
      .then(rs => setFetchedOpenCount(rs.length))
      .catch(() => setFetchedOpenCount(0));
  }, [lockedBranchId, recallStatusFilter, recalls]);

  const q = search.toLowerCase();
  const filtered = batches.filter(b => {
    const mq = !q || b.product?.name?.toLowerCase().includes(q) || b.product?.sku?.toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q);
    const mbr = lockedBranchId ? b.branchId === lockedBranchId : (branchFilter === "all" || b.branchId === branchFilter);
    const mwh = warehouseFilter === "all" || b.warehouseId === warehouseFilter;
    const mef = !expiryFrom || (!!b.expiryDate && b.expiryDate >= expiryFrom);
    const met = !expiryTo || (!!b.expiryDate && b.expiryDate <= expiryTo + "T23:59:59");
    return mq && mbr && mwh && mef && met;
  });

  return (
    <PageShell title="Batches & Expiry" subtitle="Wastage watch-list · near-expiry, expired & recalled stock">
      {loadError && <LoadErrorBanner onRetry={loadBatches} />}
      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Near Expiry" value={String(nearExpiry)} icon={CalendarClock} accent="warning" />
        <MetricCard label="Expired" value={String(expired)} icon={Ban} accent="destructive" />
        <MetricCard label="Open Recalls" value={String(openRecallCount)} icon={ShieldAlert} accent="destructive" />
      </div>

      <Tabs defaultValue="expiry">
        <TabsList>
          <TabsTrigger value="expiry">Expiry watch-list</TabsTrigger>
          <TabsTrigger value="recalls" className="gap-1.5">
            Recalls
            {openRecallCount > 0 && (
              <Badge variant="destructive" className="h-4 px-1.5 text-[10px]">{openRecallCount}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expiry" className="space-y-4 mt-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Input placeholder="Search batch / lot / product…" className="h-9 bg-card" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {!lockedBranchId && (
          <Select value={branchFilter} onValueChange={v => { setBranchFilter(v); if (v !== "all") setWarehouseFilter("all"); }}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        {!lockedBranchId && (
          <Select value={warehouseFilter} onValueChange={v => { setWarehouseFilter(v); if (v !== "all") setBranchFilter("all"); }}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Warehouses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Warehouses</SelectItem>
              {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Near Expiry + Expired" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Near Expiry + Expired</SelectItem>
            <SelectItem value="near_expiry">Near Expiry Only</SelectItem>
            <SelectItem value="expired">Expired Only</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Expiry:</span>
          <Input type="date" className="h-9 w-36" value={expiryFrom} onChange={e => setExpiryFrom(e.target.value)} title="Expiry from" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" className="h-9 w-36" value={expiryTo} onChange={e => setExpiryTo(e.target.value)} title="Expiry to" />
          {(expiryFrom || expiryTo) && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => { setExpiryFrom(""); setExpiryTo(""); }}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => exportCSV(filtered, branches, warehouses, companyHeader)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export ({filtered.length})
        </Button>
      </div>

      {/* Table */}
      <Card className="border-border/60 shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {batches.length === 0 ? "Nothing near expiry or expired right now." : "No batches match your search."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Batch #</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Received</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expiry</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty (rem / recv)</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => {
                    const expDiff = b.expiryDate ? (new Date(b.expiryDate).getTime() - Date.now()) / 86400000 : null;
                    return (
                      <tr key={b.id} className="border-t hover:bg-muted/20 transition-colors">
                        <td className="px-4 py-3">
                          <p className="font-semibold">{b.product?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground">{b.product?.sku ?? "—"}</p>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">{b.batchNumber}</td>
                        <td className="px-4 py-3 text-xs">
                          {b.branchId ? (
                            branches.find(br => br.id === b.branchId)?.name ?? "—"
                          ) : (
                            <span className="inline-flex items-center gap-1.5">
                              {warehouses.find(w => w.id === b.warehouseId)?.name ?? "—"}
                              <span className="text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-semibold">WH</span>
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{b.supplier?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(b.receivedDate).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" })}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {b.expiryDate ? (
                            <span className={expDiff !== null && expDiff < 0 ? "text-red-600 font-medium" : expDiff !== null && expDiff <= 30 ? "text-yellow-600 font-medium" : "text-muted-foreground"}>
                              {new Date(b.expiryDate).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-4 py-3 text-right font-medium">
                          {b.remainingQuantity} / {b.quantity}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={b.status} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </CardContent>
      </Card>
        </TabsContent>

        <TabsContent value="recalls" className="space-y-4 mt-4">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={recallStatusFilter} onValueChange={v => setRecallStatusFilter(v as typeof recallStatusFilter)}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open only</SelectItem>
                <SelectItem value="closed">Closed only</SelectItem>
                <SelectItem value="all">All recalls</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            {recallPerms.canCreate && (
              <Button size="sm" className="h-9 gap-1.5" onClick={() => setNewRecallOpen(true)}>
                <Plus className="h-4 w-4" /> New recall
              </Button>
            )}
          </div>

          <Card className="border-border/60 shadow-card">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                {recalls.length === 0 ? (
                  <div className="py-16 text-center text-sm text-muted-foreground">
                    {recallStatusFilter === "open"
                      ? "No open recalls — nothing is blocked from sale."
                      : "No recalls match this filter."}
                  </div>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recall #</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scope</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reason</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Severity</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quarantined</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recalls.map(r => {
                        const busy = busyRecallId === r.id;
                        return (
                          <tr key={r.id} className="border-t hover:bg-muted/20 transition-colors">
                            <td className="px-4 py-3 font-mono text-xs">{r.recallNumber}</td>
                            <td className="px-4 py-3">
                              <p className="font-semibold">{r.product?.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground">{r.product?.sku ?? "—"}</p>
                            </td>
                            <td className="px-4 py-3 text-xs">
                              <p>{r.batch?.batchNumber ?? (r.batchId ? r.batchId.slice(0, 8) : "All batches")}</p>
                              <p className="text-muted-foreground">{r.branch?.name ?? "Every branch"}</p>
                            </td>
                            <td className="px-4 py-3 text-xs max-w-[220px]">
                              <p className="truncate" title={r.reason}>{r.reason}</p>
                              <p className="text-muted-foreground capitalize">{r.recallType.replace(/_/g, " ")}</p>
                            </td>
                            <td className="px-4 py-3"><SeverityBadge severity={r.severity} /></td>
                            <td className="px-4 py-3 text-right tabular-nums">{r.quantityQuarantined || "—"}</td>
                            <td className="px-4 py-3">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                                r.status === "open" ? "bg-destructive/15 text-destructive" : "bg-success/15 text-success"
                              }`}>{r.status}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="sm" className="h-7 text-xs"
                                  onClick={() => setImpactId(r.id)}>
                                  Impact
                                </Button>
                                {r.status === "open" && recallPerms.canEdit && (
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                                    disabled={busy} onClick={() => quarantine(r)} title="Write the recalled stock off as damage">
                                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <PackageX className="h-3 w-3" />}
                                    Quarantine
                                  </Button>
                                )}
                                {r.status === "open" && recallPerms.canApprove && (
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                                    disabled={busy} onClick={() => close(r)} title="Close the recall and allow sales again">
                                    <CheckCircle2 className="h-3 w-3" /> Close
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <NewRecallDialog open={newRecallOpen} onClose={() => setNewRecallOpen(false)}
        onDone={loadRecalls} branches={branches} />
      <RecallImpactDialog recallId={impactId} onClose={() => setImpactId(null)} />
    </PageShell>
  );
}
