import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock, Ban, ShieldAlert, Download, X } from "lucide-react";
import { api, type InventoryBatch, type Branch, type Warehouse } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { BatchStatusBadge as StatusBadge } from "@/components/batch-status-badge";

export const Route = createFileRoute("/_app/batches")({ component: Batches });

// ─── Export ───────────────────────────────────────────────────────────────────

function exportCSV(data: InventoryBatch[], branches: Branch[], warehouses: Warehouse[]) {
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
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `batches-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ─── Main page ────────────────────────────────────────────────────────────────

function Batches() {
  const { user } = useAuth();
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

  const nearExpiry = batches.filter(b => b.status === "near_expiry").length;
  const expired = batches.filter(b => b.status === "expired").length;

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
    <PageShell title="Batches & Expiry" subtitle="Wastage watch-list · near-expiry & expired batches only">
      {loadError && <LoadErrorBanner onRetry={loadBatches} />}
      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Near Expiry" value={String(nearExpiry)} icon={CalendarClock} accent="warning" />
        <MetricCard label="Expired" value={String(expired)} icon={Ban} accent="destructive" />
        <MetricCard label="Recall Flags" value="—" icon={ShieldAlert} accent="destructive" />
      </div>

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
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => exportCSV(filtered, branches, warehouses)} disabled={filtered.length === 0}>
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
    </PageShell>
  );
}
