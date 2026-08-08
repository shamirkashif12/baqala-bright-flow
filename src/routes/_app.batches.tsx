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
import { CalendarClock, Ban, ShieldAlert, Download, X, Plus, Loader2, PackageX, CheckCircle2, AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import {
  api, excludeDisabledBranches,
  type InventoryBatch, type Branch, type Warehouse, type Product,
  type ProductRecall, type RecallImpact, type RecallSeverity, type RecallType,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { BatchStatusBadge as StatusBadge } from "@/components/batch-status-badge";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { useCompanyHeader } from "@/lib/use-company-header";
import { toast } from "sonner";
import { RtsSheet, type RtsInitialBatch } from "@/routes/_app.supplier-returns";

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
  const { user, canViewModule } = useAuth();
  const canViewSupplierReturns = canViewModule("Supplier Returns");
  const companyHeader = useCompanyHeader();
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [warehouseFilter, setWarehouseFilter] = useState<string[]>([]);
  // This page only ever shows the wastage watch-list (near-expiry + expired) — empty here means
  // "both of those", not every status. Active/consumed batches belong on the Inventory page.
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");
  const [activeTab, setActiveTab] = useState<"expiry" | "recalls">("expiry");
  const [discardBatch, setDiscardBatch] = useState<InventoryBatch | null>(null);
  const [reclaimBatch, setReclaimBatch] = useState<InventoryBatch | null>(null);

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
      // Always fetch the FULL near-expiry+expired watch-list from the server, regardless of
      // statusFilter — that selection (whether from the dropdown or a quick-filter card click)
      // is applied client-side in `filtered` below instead, so the Near Expiry / Expired card
      // counts stay accurate even while one of them is the active filter.
      const data = await api.getBatches({
        branchId: lockedBranchId ? [lockedBranchId] : (branchFilter.length ? branchFilter : undefined),
        warehouseId: warehouseFilter.length ? warehouseFilter : undefined,
      });
      setBatches((data ?? []).filter(b => b.status === "near_expiry" || b.status === "expired"));
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  // A Reclaim only inserts a draft StockTransfer — RemainingQuantity isn't deducted until it's
  // later approved AND dispatched (in_transit), so the batch row looks completely unchanged right
  // after creating one and the button would otherwise stay clickable for a duplicate reclaim.
  // There's no per-batch FK to lean on at this stage (StockTransferItem.BatchId is only filled in
  // once dispatch actually moves stock), so pending reclaims are tracked by product + location —
  // the same granularity Reclaim itself is created at.
  const [openReclaimKeys, setOpenReclaimKeys] = useState<Set<string>>(new Set());
  // Once a reclaim is dispatched (in_transit) or completed, DeductSourceAsync backfills the exact
  // InventoryBatch.Id onto the StockTransferItem — so at that point a real per-batch match is
  // possible, and a batch that hit RemainingQuantity 0 this way should read "Reclaimed", not
  // "Already written off" (that label is reserved for the wastage/Discard path).
  const [reclaimedBatchIds, setReclaimedBatchIds] = useState<Set<string>>(new Set());
  async function loadOpenReclaims() {
    if (!canViewSupplierReturns) { setOpenReclaimKeys(new Set()); setReclaimedBatchIds(new Set()); return; }
    try {
      const transfers = await api.getStockTransfers({ status: ["draft", "pending_approval", "approved", "in_transit", "completed"] });
      const rts = (transfers ?? []).filter(t => t.transferType === "warehouse_to_supplier" || t.transferType === "branch_to_supplier");
      setOpenReclaimKeys(new Set(
        rts.filter(t => t.status === "draft" || t.status === "pending_approval" || t.status === "approved")
          .flatMap(t => (t.items ?? []).map(i => `${i.productId}:${t.sourceBranchId ?? t.sourceWarehouseId}`))
      ));
      setReclaimedBatchIds(new Set(
        rts.filter(t => t.status === "in_transit" || t.status === "completed")
          .flatMap(t => (t.items ?? []).map(i => i.batchId)).filter((id): id is string => !!id)
      ));
    } catch {
      setOpenReclaimKeys(new Set());
      setReclaimedBatchIds(new Set());
    }
  }

  // FEFO enforcement warnings (soft, non-blocking): on a branch not using FEFO picking, flags
  // near-expiry batches sitting behind stock received more recently. Only meaningful per-branch
  // (the setting and the pick order are both branch-scoped), so this is skipped entirely when
  // "all branches" is selected rather than guessing which branch a warning belongs to.
  const [fefoWarnings, setFefoWarnings] = useState<Awaited<ReturnType<typeof api.getFefoWarnings>>>([]);
  useEffect(() => {
    const effectiveBranchIds = lockedBranchId ? [lockedBranchId] : branchFilter;
    if (effectiveBranchIds.length !== 1) { setFefoWarnings([]); return; }
    api.getFefoWarnings(effectiveBranchIds[0]).then(setFefoWarnings).catch(() => setFefoWarnings([]));
  }, [lockedBranchId, branchFilter]);

  // Load metadata once on mount
  useEffect(() => {
    api.getBranches().then((b) => setBranches(excludeDisabledBranches(b))).catch(() => {});
    api.getWarehouses().then(setWarehouses).catch(() => {});
  }, []);

  // Branch-scoped roles can't be switched away from their own branch
  useEffect(() => {
    if (lockedBranchId) setBranchFilter([lockedBranchId]);
  }, [lockedBranchId]);

  // Re-fetch batches from BE whenever a server-side filter changes — statusFilter is applied
  // client-side (see loadBatches' comment) so it's deliberately not a dependency here.
  useEffect(() => {
    loadBatches();
  }, [branchFilter, warehouseFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadRecalls();
  }, [recallStatusFilter, lockedBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    loadOpenReclaims();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    const mbr = lockedBranchId ? b.branchId === lockedBranchId : (branchFilter.length === 0 || branchFilter.includes(b.branchId ?? ""));
    const mwh = warehouseFilter.length === 0 || warehouseFilter.includes(b.warehouseId ?? "");
    const mef = !expiryFrom || (!!b.expiryDate && b.expiryDate >= expiryFrom);
    const met = !expiryTo || (!!b.expiryDate && b.expiryDate <= expiryTo + "T23:59:59");
    const ms = statusFilter.length === 0 || statusFilter.includes(b.status);
    return mq && mbr && mwh && mef && met && ms;
  });

  const hasFilters = !!search || (!lockedBranchId && (branchFilter.length > 0 || warehouseFilter.length > 0))
    || statusFilter.length > 0 || !!expiryFrom || !!expiryTo;
  const clearFilters = () => {
    setSearch("");
    if (!lockedBranchId) { setBranchFilter([]); setWarehouseFilter([]); }
    setStatusFilter([]); setExpiryFrom(""); setExpiryTo("");
  };

  return (
    <PageShell title="Batches & Expiry" subtitle="Wastage watch-list · near-expiry, expired & recalled stock">
      {loadError && <LoadErrorBanner onRetry={loadBatches} />}
      {/* Metrics */}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard
          label="Near Expiry" value={String(nearExpiry)} icon={CalendarClock} accent="warning"
          onClick={() => { setActiveTab("expiry"); setStatusFilter(v => v.length === 1 && v[0] === "near_expiry" ? [] : ["near_expiry"]); }}
          active={activeTab === "expiry" && statusFilter.length === 1 && statusFilter[0] === "near_expiry"}
        />
        <MetricCard
          label="Expired" value={String(expired)} icon={Ban} accent="destructive"
          onClick={() => { setActiveTab("expiry"); setStatusFilter(v => v.length === 1 && v[0] === "expired" ? [] : ["expired"]); }}
          active={activeTab === "expiry" && statusFilter.length === 1 && statusFilter[0] === "expired"}
        />
        <MetricCard
          label="Open Recalls" value={String(openRecallCount)} icon={ShieldAlert} accent="destructive"
          onClick={() => setActiveTab("recalls")}
          active={activeTab === "recalls"}
        />
      </div>

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as "expiry" | "recalls")}>
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
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Branches"
              options={branches.map(b => ({ id: b.id, label: b.name }))}
              selected={branchFilter}
              onChange={v => { setBranchFilter(v); if (v.length) setWarehouseFilter([]); }}
            />
          </div>
        )}
        {!lockedBranchId && (
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Warehouses"
              options={warehouses.map(w => ({ id: w.id, label: w.name }))}
              selected={warehouseFilter}
              onChange={v => { setWarehouseFilter(v); if (v.length) setBranchFilter([]); }}
            />
          </div>
        )}
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="Near Expiry + Expired"
            options={[
              { id: "near_expiry", label: "Near Expiry Only" },
              { id: "expired", label: "Expired Only" },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <DateRangeField from={expiryFrom} to={expiryTo} onFromChange={setExpiryFrom} onToChange={setExpiryTo} prefixLabel="Expiry:" className="h-9 w-36" />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => exportCSV(filtered, branches, warehouses, companyHeader)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export ({filtered.length})
        </Button>
      </div>

      {/* FEFO enforcement warnings — this branch isn't picking First-Expired-First-Out, so
          near-expiry stock can sit unpicked behind more recently received stock. */}
      {fefoWarnings.length > 0 && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800/60 p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-sm font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-4 w-4" /> FEFO not enforced — {fefoWarnings.length} near-expiry item(s) at risk
          </div>
          <ul className="text-xs text-amber-800/90 dark:text-amber-300/90 space-y-1 pl-6 list-disc">
            {fefoWarnings.map((w, i) => <li key={i}>{w.message}</li>)}
          </ul>
        </div>
      )}

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
                    <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Batch #</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Received</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Expiry</th>
                    <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty (rem / recv)</th>
                    <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                    <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => {
                    const expDiff = b.expiryDate ? (new Date(b.expiryDate).getTime() - Date.now()) / 86400000 : null;
                    // A batch that's already past its expiry date gets auto-written-off by the
                    // background sweep the moment it crosses that date (OperationalAlertsService) —
                    // its RemainingQuantity is already 0 by the time it shows "Expired" here, so
                    // there's nothing left to Discard or Reclaim. Both actions only make sense while
                    // stock is still actually on hand: a near-expiry batch (proactive write-off before
                    // it lapses), or the rare already-expired batch the sweep hasn't reached yet.
                    const hasStockLeft = b.remainingQuantity > 0;
                    // Discard (wastage write-off) goes through /api/inventory/adjustments, which is
                    // branch-only end to end — it upserts InventoryStock by BranchId, so it can never
                    // touch WarehouseStock. Reclaim (return-to-supplier) now supports both
                    // warehouse_to_supplier and branch_to_supplier transfers, so it's available either
                    // way, as long as a supplier is actually known for the batch.
                    const canDiscard = hasStockLeft && !!b.branchId;
                    const canReclaim = hasStockLeft && !!b.supplierId;
                    const hasOpenReclaim = openReclaimKeys.has(`${b.productId}:${b.branchId ?? b.warehouseId}`);
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
                            warehouses.find(w => w.id === b.warehouseId)?.name ?? "—"
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
                        <td className="px-4 py-3 text-end font-medium">
                          {b.remainingQuantity} / {b.quantity}
                        </td>
                        <td className="px-4 py-3">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {!hasStockLeft ? (
                              reclaimedBatchIds.has(b.id) ? (
                                <span className="text-[10px] text-muted-foreground italic" title="This batch's remaining stock was returned to its supplier via a reclaim.">
                                  Reclaimed
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted-foreground italic" title="Remaining quantity is 0 — this batch was already written off automatically when it expired.">
                                  Already written off
                                </span>
                              )
                            ) : (
                              <>
                                {recallPerms.canEdit && canDiscard && (
                                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                                    onClick={() => setDiscardBatch(b)} title="Write this batch off as expired wastage">
                                    <Trash2 className="h-3 w-3" /> Discard
                                  </Button>
                                )}
                                {recallPerms.canEdit && canReclaim && (
                                  hasOpenReclaim ? (
                                    <span className="text-[10px] text-muted-foreground italic"
                                      title="A return to supplier for this product at this location has already been created and is awaiting approval">
                                      Reclaimed
                                    </span>
                                  ) : (
                                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
                                      disabled={!canViewSupplierReturns}
                                      onClick={() => setReclaimBatch(b)}
                                      title={canViewSupplierReturns
                                        ? "Return this batch to its supplier"
                                        : "You don't have permission to view Supplier Returns, so you can't track this reclaim once created — ask an admin to grant access"}>
                                      <RotateCcw className="h-3 w-3" /> Reclaim
                                    </Button>
                                  )
                                )}
                              </>
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
                        <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Recall #</th>
                        <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                        <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Scope</th>
                        <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Reason</th>
                        <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Severity</th>
                        <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase tracking-wider">Quarantined</th>
                        <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                        <th className="px-4 py-3 text-end text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
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
                            <td className="px-4 py-3 text-end tabular-nums">{r.quantityQuarantined || "—"}</td>
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

      <DiscardBatchDialog batch={discardBatch} onClose={() => setDiscardBatch(null)}
        onDone={() => { setDiscardBatch(null); loadBatches(); }} />

      <RtsSheet
        open={!!reclaimBatch}
        onOpenChange={(v) => { if (!v) setReclaimBatch(null); }}
        onCreated={() => { setReclaimBatch(null); toast.success("Return to supplier created"); loadBatches(); loadOpenReclaims(); }}
        initialBatch={reclaimBatch ? {
          productId: reclaimBatch.productId,
          productName: reclaimBatch.product?.name ?? "Unknown product",
          sourceMode: reclaimBatch.branchId ? "branch" : "warehouse",
          locationId: (reclaimBatch.branchId ?? reclaimBatch.warehouseId)!,
          locationName: reclaimBatch.branchId
            ? (branches.find(br => br.id === reclaimBatch.branchId)?.name ?? "Branch")
            : (warehouses.find(w => w.id === reclaimBatch.warehouseId)?.name ?? "Warehouse"),
          supplierId: reclaimBatch.supplierId!,
          supplierName: reclaimBatch.supplier?.name ?? "Supplier",
          quantity: reclaimBatch.remainingQuantity,
          unitCost: reclaimBatch.purchaseCost,
        } : null}
      />
    </PageShell>
  );
}

// ─── Discard (wastage write-off) dialog — pre-filled from an already-known expired/near-expiry
// batch, so unlike the Stocks → Wastage tab's version there's no product/branch/batch picker:
// just confirm the quantity and reason, then it goes through the same maker-checker approval
// queue every other wastage adjustment does. ──────────────────────────────────────────────────
function DiscardBatchDialog({ batch, onClose, onDone }: {
  batch: InventoryBatch | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (batch) { setQuantity(String(batch.remainingQuantity)); setReason(""); }
  }, [batch]);

  if (!batch) return null;

  const handleSave = async () => {
    const qty = Number(quantity);
    if (!qty || qty <= 0 || qty > batch.remainingQuantity) {
      toast.error(`Enter a quantity between 1 and ${batch.remainingQuantity}`);
      return;
    }
    setSaving(true);
    try {
      await api.adjustInventory({
        productId: batch.productId,
        // DiscardBatchDialog is only ever opened for a branch-held batch (see canDiscard) — a
        // warehouse batch gets "Reclaim" instead, since this endpoint can't touch WarehouseStock.
        branchId: batch.branchId!,
        quantity: qty,
        adjustmentType: "expired",
        reason: reason || "Discarded from Batches & Expiry watch-list",
        adjustedBy: user?.id,
        batchId: batch.id,
      });
      toast.success("Discard recorded — pending approval before stock is updated");
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record the write-off");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Discard expired batch</DialogTitle></DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm">
            <span className="font-semibold">{batch.product?.name ?? "Product"}</span> — batch {batch.batchNumber}
          </p>
          <div>
            <Label className="text-xs">Quantity to write off *</Label>
            <Input type="number" min={1} max={batch.remainingQuantity} className="h-9 mt-1"
              value={quantity} onChange={e => setQuantity(e.target.value)} />
            <p className="text-[11px] text-muted-foreground mt-1">{batch.remainingQuantity} remaining on this batch</p>
          </div>
          <div>
            <Label className="text-xs">Reason / Notes</Label>
            <Textarea rows={2} value={reason} onChange={e => setReason(e.target.value)} placeholder="Optional — e.g. past expiry, damaged carton…" />
          </div>
          <p className="text-xs text-muted-foreground">
            Recorded as <span className="font-medium">Pending Approval</span> — stock isn't deducted until an approver signs it off.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Discard
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
