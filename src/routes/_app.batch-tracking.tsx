import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PaginatedDataTable, type Column } from "@/components/module-placeholder";
import { Boxes, PackageCheck, CalendarClock, Download, X, Loader2, Eye, Building2, Warehouse as WarehouseIcon, ArrowDownUp, Lock } from "lucide-react";
import { toast } from "sonner";
import { api, type InventoryBatch, type Branch, type Warehouse, type StockMovement, type InventoryAdjustment } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { BatchStatusBadge } from "@/components/batch-status-badge";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { useCompanyHeader } from "@/lib/use-company-header";

// Per-branch picking strategy — mirrors BatchConsumptionService.StrategySettingKey on the backend.
// Absent/unrecognised means FEFO (the grocery-safe default), matching the service's Normalize().
const PICKING_STRATEGY_KEY = "inventory_picking_strategy";
const STRATEGIES = [
  { value: "fefo", label: "FEFO", full: "First Expired, First Out", hint: "Picks whatever spoils soonest. Best for perishables — the default." },
  { value: "fifo", label: "FIFO", full: "First In, First Out", hint: "Picks whatever was received earliest, regardless of expiry." },
] as const;

export const Route = createFileRoute("/_app/batch-tracking")({ component: BatchTracking });

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "active", label: "Active" },
  { value: "near_expiry", label: "Near Expiry" },
  { value: "expired", label: "Expired" },
  { value: "consumed", label: "Consumed" },
];

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  manual_receive: "Manual Receive",
  purchase_receive: "PO Receive",
  transfer_out: "Transfer Out",
  transfer_in: "Transfer In",
  transfer_restore: "Transfer Restore",
  sale: "Sale",
  expired: "Expiry Write-off",
};

function fmtDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtDateTime(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-SA", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function locationName(b: InventoryBatch, branches: Branch[], warehouses: Warehouse[]) {
  return b.branchId
    ? branches.find(br => br.id === b.branchId)?.name ?? "—"
    : warehouses.find(w => w.id === b.warehouseId)?.name ?? "—";
}

function exportCSV(fileTag: string, data: InventoryBatch[], branches: Branch[], warehouses: Warehouse[], companyHeader: string) {
  const rows: string[][] = [
    ["Product", "SKU", "Batch #", "Location", "Supplier", "Received Date", "Expiry Date", "Qty Received", "Qty Remaining", "Purchase Cost (SAR)", "Status"],
    ...data.map(b => [
      b.product?.name ?? "",
      b.product?.sku ?? "",
      b.batchNumber,
      locationName(b, branches, warehouses),
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
  a.download = `batch-tracking-${fileTag}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ─── Batch detail drawer (shared by both tabs) ─────────────────────────────────

function BatchDetailSheet({ batch, branches, warehouses, onClose }: {
  batch: InventoryBatch | null;
  branches: Branch[];
  warehouses: Warehouse[];
  onClose: () => void;
}) {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [adjustments, setAdjustments] = useState<InventoryAdjustment[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!batch) return;
    let cancelled = false;
    setLoading(true);
    // Reset immediately (not just on arrival) so a slow request for a previously-open batch can
    // never land after this one starts and get mistaken for this batch's own history.
    setMovements([]);
    setAdjustments([]);
    Promise.all([
      api.getStockMovements({ batchId: batch.id, limit: 100 }),
      api.getAdjustments({ batchId: batch.id }),
    ])
      .then(([m, a]) => {
        if (cancelled) return;
        setMovements(m);
        setAdjustments(a);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [batch]);

  if (!batch) return null;

  // Signed net of EVERY ledger entry tied to this batch, including the batch's own creation
  // event (manual_receive/purchase_receive/transfer_in, whichever created it, always logs the
  // full starting quantity) — so this sum alone is what remainingQuantity SHOULD be if the
  // ledger explains every change since. Additions (manual receive, increase-type adjustments
  // crediting stock back) and removals (waste/damage, transfer-out) both net out correctly here
  // regardless of direction. Any gap between this and the ACTUAL remainingQuantity is stock that
  // left the batch outside the ledger entirely — in practice, FEFO consumption at POS checkout,
  // which decrements a batch's remainingQuantity directly without writing a per-batch movement.
  const expectedRemaining = movements.reduce((s, m) => s + m.quantity, 0);
  const unaccountedGap = expectedRemaining - batch.remainingQuantity;
  const consumed = batch.quantity - batch.remainingQuantity;

  return (
    <Sheet open={!!batch} onOpenChange={v => !v && onClose()}>
      <SheetContent style={{ width: 520, maxWidth: "100vw" }} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Batch {batch.batchNumber}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6 text-sm">
          {/* Header block */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-lg border border-border/60 p-3">
            <div><p className="text-xs text-muted-foreground">Product</p><p className="font-medium">{batch.product?.name ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">SKU</p><p className="font-medium">{batch.product?.sku ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Location</p><p className="font-medium">{locationName(batch, branches, warehouses)}{!batch.branchId && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-primary/10 text-primary font-semibold">WH</span>}</p></div>
            <div><p className="text-xs text-muted-foreground">Supplier</p><p className="font-medium">{batch.supplier?.name ?? "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Received</p><p className="font-medium">{fmtDate(batch.receivedDate)}</p></div>
            <div><p className="text-xs text-muted-foreground">Expiry</p><p className="font-medium">{fmtDate(batch.expiryDate)}</p></div>
            <div><p className="text-xs text-muted-foreground">Purchase Cost</p><p className="font-medium">{batch.purchaseCost != null ? `﷼${batch.purchaseCost.toFixed(2)}` : "—"}</p></div>
            <div><p className="text-xs text-muted-foreground">Qty (remaining / received)</p><p className="font-medium">{batch.remainingQuantity} / {batch.quantity}</p></div>
            <div><p className="text-xs text-muted-foreground">Status</p><BatchStatusBadge status={batch.status} /></div>
          </div>

          {loading && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading history…
            </div>
          )}

          {!loading && (
            <>
              {/* Movement history */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Movement History</h4>
                {movements.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No recorded movements for this batch.</p>
                ) : (
                  <div className="space-y-1.5">
                    {movements.map(m => (
                      <div key={m.id} className="flex items-center justify-between border-b border-border/30 pb-1.5 text-xs">
                        <div>
                          <p className="font-medium">{MOVEMENT_TYPE_LABELS[m.movementType] ?? m.movementType}</p>
                          <p className="text-muted-foreground">{fmtDateTime(m.createdAt)}{m.referenceNumber ? ` · ${m.referenceNumber}` : ""}</p>
                        </div>
                        <span className={m.quantity < 0 ? "text-destructive font-medium" : "text-success font-medium"}>
                          {m.quantity > 0 ? "+" : ""}{m.quantity}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Adjustments */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Adjustments</h4>
                {adjustments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No adjustments recorded for this batch.</p>
                ) : (
                  <div className="space-y-1.5">
                    {adjustments.map(a => {
                      // InventoryAdjustment.quantity is always a positive magnitude — direction
                      // comes from the type, matching InventoryController.Adjust's own isIncrease
                      // check. Every adjustment here was rendered as a negative red "-N" before,
                      // which was simply wrong for additions/corrections that add stock back.
                      const isIncrease = a.adjustmentType === "addition" || a.adjustmentType === "return_to_supplier" || a.adjustmentType === "transfer_in";
                      return (
                        <div key={a.id} className="flex items-center justify-between border-b border-border/30 pb-1.5 text-xs">
                          <div>
                            <p className="font-medium capitalize">{a.adjustmentType.replace(/_/g, " ")}</p>
                            <p className="text-muted-foreground">{fmtDateTime(a.createdAt)}{a.reason ? ` · ${a.reason}` : ""}</p>
                          </div>
                          <span className={isIncrease ? "text-success font-medium" : "text-destructive font-medium"}>
                            {isIncrease ? "+" : "-"}{Math.abs(a.quantity)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Reconciliation note */}
              {unaccountedGap > 0 && (
                <p className="text-xs text-muted-foreground italic border-t border-dashed border-border/40 pt-2">
                  {unaccountedGap} of {consumed} consumed unit(s) are not accounted for in the movement/adjustment history
                  above — likely sold through point-of-sale orders, which deplete a batch's remaining quantity without
                  recording a per-batch ledger entry.
                </p>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Picking-strategy control (FIFO / FEFO) ───────────────────────────────────
// Replaces the raw "PUT /api/settings/tenant/{branchId}" workaround with an in-app toggle.
// Edit is gated on the Settings module's canEdit flag — the same permission the backend's
// [RequirePermission("Settings", Edit)] enforces on the underlying endpoint — so only higher
// roles can flip a branch's strategy; everyone else sees it read-only.
function PickingStrategyCard({ branchId, branchName, canEdit }: {
  branchId: string | null;
  branchName: string;
  canEdit: boolean;
}) {
  const [strategy, setStrategy] = useState<string>("fefo");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    // No branch resolved yet (e.g. admin viewing "All Branches") — nothing to load; the card
    // still renders with a "select a branch" prompt so users can see where the control lives.
    if (!branchId) { setStrategy("fefo"); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    api.getTenantSettings(branchId)
      .then(s => { if (!cancelled) setStrategy((s[PICKING_STRATEGY_KEY] ?? "fefo").toLowerCase() === "fifo" ? "fifo" : "fefo"); })
      .catch(() => { if (!cancelled) setStrategy("fefo"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [branchId]);

  async function choose(next: string) {
    if (!branchId || !canEdit || next === strategy || saving) return;
    const prev = strategy;
    setStrategy(next); // optimistic
    setSaving(next);
    try {
      await api.updateTenantSettings(branchId, { [PICKING_STRATEGY_KEY]: next });
      toast.success(`${branchName}: picking strategy set to ${next.toUpperCase()}`);
    } catch (e) {
      setStrategy(prev); // revert on failure
      toast.error(e instanceof Error ? e.message : "Failed to update picking strategy");
    } finally {
      setSaving(null);
    }
  }

  const active = STRATEGIES.find(s => s.value === strategy) ?? STRATEGIES[0];
  // Buttons are inert until a branch is picked AND the user may edit — but the toggle stays
  // visible in both cases so the control is always discoverable.
  const disabled = !branchId || !canEdit || saving !== null;

  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="mt-0.5 rounded-lg bg-primary/10 p-2 text-primary"><ArrowDownUp className="h-4 w-4" /></div>
          <div>
            <p className="text-sm font-semibold flex items-center gap-1.5">
              Picking Strategy
              {branchId && !canEdit && <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground"><Lock className="h-3 w-3" /> View only</span>}
            </p>
            <p className="text-xs text-muted-foreground">
              {branchId
                ? <>How stock is drawn from batches at <span className="font-medium text-foreground">{branchName}</span> for sales, returns &amp; transfers.</>
                : <>Controls whether stock is drawn First-Expired (FEFO) or First-In (FIFO) at a branch — for sales, returns &amp; transfers.</>}
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…</div>
        ) : (
          <div className={`inline-flex rounded-lg border bg-muted/40 p-0.5 ${!branchId ? "opacity-60" : ""}`} role="group" aria-label="Picking strategy">
            {STRATEGIES.map(s => {
              const isActive = branchId ? s.value === strategy : false;
              return (
                <button
                  key={s.value}
                  type="button"
                  disabled={disabled}
                  title={`${s.full} — ${s.hint}`}
                  onClick={() => choose(s.value)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    isActive ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  } ${disabled ? "cursor-not-allowed" : ""}`}
                >
                  {saving === s.value && <Loader2 className="h-3 w-3 animate-spin" />}
                  {s.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <p className="mt-2 text-[11px] text-muted-foreground border-t border-dashed border-border/50 pt-2">
        {!branchId
          ? <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Select a branch below to view or change its picking strategy.</span>
          : !loading
            ? <><span className="font-medium text-foreground">{active.label}</span> — {active.full}. {active.hint}{!canEdit && " Ask an admin/manager to change it."}</>
            : null}
      </p>
    </div>
  );
}

// ─── Per-location-type panel (one for Branches, one for Warehouses) ───────────

function BatchLocationPanel({
  locationType, locations, lockedLocationId, branches, warehouses, onView,
}: {
  locationType: "branch" | "warehouse";
  locations: { id: string; name: string }[];
  lockedLocationId: string | null;
  branches: Branch[];
  warehouses: Warehouse[];
  onView: (b: InventoryBatch) => void;
}) {
  const { canEdit: canEditStrategy } = usePermission("Settings");
  const companyHeader = useCompanyHeader();
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [locationFilter, setLocationFilter] = useState<string[]>(lockedLocationId ? [lockedLocationId] : []);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");

  async function load() {
    setLoading(true);
    try {
      const locationIds = lockedLocationId ? [lockedLocationId] : (locationFilter.length ? locationFilter : undefined);
      const data = await api.getBatches({
        branchId: locationType === "branch" ? locationIds : undefined,
        warehouseId: locationType === "warehouse" ? locationIds : undefined,
        status: statusFilter.length ? statusFilter : undefined,
        locationType,
      });
      setBatches(data ?? []);
      setLoadError(false);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (lockedLocationId) setLocationFilter([lockedLocationId]);
  }, [lockedLocationId]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locationFilter, statusFilter]);

  const total = batches.length;
  const active = batches.filter(b => b.status === "active").length;
  const wastageRisk = batches.filter(b => b.status === "near_expiry" || b.status === "expired").length;

  const q = search.toLowerCase();
  const filtered = batches.filter(b => {
    const mq = !q || b.product?.name?.toLowerCase().includes(q) || b.product?.sku?.toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q);
    const mef = !expiryFrom || (!!b.expiryDate && b.expiryDate >= expiryFrom);
    const met = !expiryTo || (!!b.expiryDate && b.expiryDate <= expiryTo + "T23:59:59");
    return mq && mef && met;
  });

  const columns: Column[] = useMemo(() => [
    {
      key: "product", label: "Product",
      render: (b: InventoryBatch) => (
        <div>
          <p className="font-semibold">{b.product?.name ?? "—"}</p>
          <p className="text-xs text-muted-foreground">{b.product?.sku ?? "—"}</p>
        </div>
      ),
    },
    { key: "batchNumber", label: "Batch #", className: "font-mono text-xs", render: (b: InventoryBatch) => b.batchNumber },
    { key: "location", label: locationType === "branch" ? "Branch" : "Warehouse", render: (b: InventoryBatch) => locationName(b, branches, warehouses) },
    { key: "supplier", label: "Supplier", render: (b: InventoryBatch) => b.supplier?.name ?? "—" },
    { key: "received", label: "Received", className: "text-xs text-muted-foreground", render: (b: InventoryBatch) => fmtDate(b.receivedDate) },
    {
      key: "expiry", label: "Expiry",
      render: (b: InventoryBatch) => {
        const days = b.expiryDate ? (new Date(b.expiryDate).getTime() - Date.now()) / 86400000 : null;
        return b.expiryDate ? (
          <span className={days !== null && days < 0 ? "text-destructive font-medium" : days !== null && days <= 30 ? "text-warning-foreground font-medium" : "text-muted-foreground"}>
            {fmtDate(b.expiryDate)}
          </span>
        ) : "—";
      },
    },
    { key: "qty", label: "Qty (rem / recv)", className: "text-right font-medium", render: (b: InventoryBatch) => `${b.remainingQuantity} / ${b.quantity}` },
    { key: "status", label: "Status", render: (b: InventoryBatch) => <BatchStatusBadge status={b.status} /> },
    {
      key: "actions", label: "", className: "text-right",
      render: (b: InventoryBatch) => (
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onView(b)}>
          <Eye className="h-4 w-4" />
        </Button>
      ),
    },
  ], [branches, warehouses, locationType, onView]);

  const locationLabel = locationType === "branch" ? "Branch" : "Warehouse";

  // Picking strategy is a per-branch setting (a warehouse has no tenant_settings row to hang it off,
  // matching GetStrategyAsync on the backend), so the card only appears for a single, resolved branch.
  const resolvedBranchId = locationType === "branch"
    ? (lockedLocationId ?? (locationFilter.length === 1 ? locationFilter[0] : null))
    : null;
  const resolvedBranchName = resolvedBranchId ? locations.find(l => l.id === resolvedBranchId)?.name ?? "this branch" : "";

  return (
    <div className="space-y-4">
      {loadError && <LoadErrorBanner onRetry={load} />}
      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Total Batches" value={String(total)} icon={Boxes} accent="default" />
        <MetricCard label="Active" value={String(active)} icon={PackageCheck} accent="success" />
        <MetricCard label="Near Expiry / Expired" value={String(wastageRisk)} icon={CalendarClock} accent="warning" />
      </div>

      {/* Per-branch FIFO / FEFO picking strategy — always shown on the Branches tab so the control
          is discoverable; it prompts to pick a branch when none is resolved (e.g. admin on "All"). */}
      {locationType === "branch" && (
        <PickingStrategyCard branchId={resolvedBranchId} branchName={resolvedBranchName} canEdit={canEditStrategy} />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Input placeholder="Search batch / lot / product…" className="h-9 bg-card" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {!lockedLocationId && (
          <div className="w-48">
            <SearchableMultiSelect
              placeholder={`All ${locationLabel}es`}
              options={locations.map(l => ({ id: l.id, label: l.name }))}
              selected={locationFilter}
              onChange={setLocationFilter}
            />
          </div>
        )}
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={STATUS_OPTIONS.filter(o => o.value !== "all").map(o => ({ id: o.value, label: o.label }))}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
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
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => exportCSV(locationType, filtered, branches, warehouses, companyHeader)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export ({filtered.length})
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={columns}
          rows={filtered}
          emptyMessage={batches.length === 0 ? `No batches found at any ${locationLabel.toLowerCase()}.` : "No batches match your search."}
        />
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function BatchTracking() {
  const { user } = useAuth();
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const [tab, setTab] = useState<"branches" | "warehouses">("branches");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [detailBatch, setDetailBatch] = useState<InventoryBatch | null>(null);

  useEffect(() => {
    api.getBranches().then(setBranches).catch(() => {});
    api.getWarehouses().then(setWarehouses).catch(() => {});
  }, []);

  return (
    <PageShell title="Batch Tracking" subtitle="Every batch/lot across branches & warehouses — search, filter, and drill in">
      <Tabs value={tab} onValueChange={v => setTab(v as "branches" | "warehouses")}>
        <TabsList className="grid grid-cols-2 w-64">
          <TabsTrigger value="branches" className="gap-1.5"><Building2 className="h-3.5 w-3.5" />Branches</TabsTrigger>
          <TabsTrigger value="warehouses" className="gap-1.5"><WarehouseIcon className="h-3.5 w-3.5" />Warehouses</TabsTrigger>
        </TabsList>

        <TabsContent value="branches" className="mt-4">
          <BatchLocationPanel
            locationType="branch"
            locations={branches}
            lockedLocationId={lockedBranchId}
            branches={branches}
            warehouses={warehouses}
            onView={setDetailBatch}
          />
        </TabsContent>

        <TabsContent value="warehouses" className="mt-4">
          <BatchLocationPanel
            locationType="warehouse"
            locations={warehouses}
            lockedLocationId={null}
            branches={branches}
            warehouses={warehouses}
            onView={setDetailBatch}
          />
        </TabsContent>
      </Tabs>

      <BatchDetailSheet batch={detailBatch} branches={branches} warehouses={warehouses} onClose={() => setDetailBatch(null)} />
    </PageShell>
  );
}
