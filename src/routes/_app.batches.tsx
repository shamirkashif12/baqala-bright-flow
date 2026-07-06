import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { CalendarClock, PackageCheck, Ban, ShieldAlert, Plus, Download, X } from "lucide-react";
import { toast } from "sonner";
import { api, type InventoryBatch, type Branch, type Product, type Supplier } from "@/lib/api";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/_app/batches")({ component: Batches });

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    near_expiry: "bg-yellow-100 text-yellow-700",
    expired: "bg-red-100 text-red-700",
  };
  const label: Record<string, string> = {
    active: "Active",
    near_expiry: "Near Expiry",
    expired: "Expired",
  };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "active" ? "bg-green-500" : status === "near_expiry" ? "bg-yellow-500" : "bg-red-500"}`} />
      {label[status] ?? status}
    </span>
  );
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportCSV(data: InventoryBatch[]) {
  const rows: string[][] = [
    ["Product", "SKU", "Batch #", "Supplier", "Received Date", "Expiry Date", "Qty Received", "Qty Remaining", "Purchase Cost (SAR)", "Status"],
    ...data.map(b => [
      b.product?.name ?? "",
      b.product?.sku ?? "",
      b.batchNumber,
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

// ─── Receive Batch Dialog ─────────────────────────────────────────────────────

function ReceiveBatchDialog({ branches, products, suppliers, onDone, lockedBranchId }: {
  branches: Branch[]; products: Product[]; suppliers: Supplier[]; onDone: () => void; lockedBranchId: string | null;
}) {
  const { canCreate } = usePermission("Batches");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    productId: "", branchId: lockedBranchId ?? "", supplierId: "",
    quantity: "", purchaseCost: "", expiryDate: "",
    batchNumber: "", notes: "",
  });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  function reset() {
    setForm({ productId: "", branchId: lockedBranchId ?? "", supplierId: "", quantity: "", purchaseCost: "", expiryDate: "", batchNumber: "", notes: "" });
  }

  async function handleSave() {
    if (!form.productId || !form.branchId || !form.quantity) {
      toast.error("Product, branch and quantity are required");
      return;
    }
    setSaving(true);
    try {
      await api.receiveBatch({
        productId: form.productId,
        branchId: form.branchId,
        supplierId: form.supplierId || undefined,
        quantity: Number(form.quantity),
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
        expiryDate: form.expiryDate || undefined,
        batchNumber: form.batchNumber || undefined,
        notes: form.notes || undefined,
      } as Parameters<typeof api.receiveBatch>[0]);
      toast.success("Batch received successfully");
      reset();
      setOpen(false);
      onDone();
    } catch {
      toast.error("Failed to receive batch");
    } finally {
      setSaving(false);
    }
  }

  if (!canCreate) return null;

  return (
    <>
      <Button size="sm" className="h-10 gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" /> Receive Batch
      </Button>
      <Dialog open={open} onOpenChange={v => { if (!v) reset(); setOpen(v); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Receive Batch</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={v => set("productId", v)}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} — {p.sku}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Branch *</Label>
              <Select value={form.branchId} onValueChange={v => set("branchId", v)} disabled={!!lockedBranchId}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {(lockedBranchId ? branches.filter(b => b.id === lockedBranchId) : branches).map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Supplier</Label>
              <Select value={form.supplierId} onValueChange={v => set("supplierId", v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input type="number" min="1" value={form.quantity} onChange={e => set("quantity", e.target.value)} placeholder="0" />
            </div>
            <div>
              <Label>Purchase Cost (SAR)</Label>
              <Input type="number" min="0" step="0.01" value={form.purchaseCost} onChange={e => set("purchaseCost", e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Expiry Date</Label>
              <Input type="date" value={form.expiryDate} onChange={e => set("expiryDate", e.target.value)} />
            </div>
            <div>
              <Label>Batch Number</Label>
              <Input value={form.batchNumber} onChange={e => set("batchNumber", e.target.value)} placeholder="Auto-generated if blank" />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional notes…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Receive"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function Batches() {
  const { user } = useAuth();
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState(lockedBranchId ?? "all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");

  async function loadBatches() {
    setLoading(true);
    try {
      const data = await api.getBatches({
        branchId: lockedBranchId ?? (branchFilter !== "all" ? branchFilter : undefined),
        status: statusFilter !== "all" ? statusFilter : undefined,
      });
      setBatches(data ?? []);
    } finally {
      setLoading(false);
    }
  }

  // Load metadata once on mount
  useEffect(() => {
    api.getBranches().then(setBranches).catch(() => {});
    api.getProducts().then(setProducts).catch(() => {});
    api.getSuppliers().then(setSuppliers).catch(() => {});
  }, []);

  // Branch-scoped roles can't be switched away from their own branch
  useEffect(() => {
    if (lockedBranchId) setBranchFilter(lockedBranchId);
  }, [lockedBranchId]);

  // Re-fetch batches from BE whenever a filter changes
  useEffect(() => {
    loadBatches();
  }, [branchFilter, statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const nearExpiry = batches.filter(b => b.status === "near_expiry").length;
  const expired = batches.filter(b => b.status === "expired").length;
  const active = batches.filter(b => b.status === "active").length;

  const q = search.toLowerCase();
  const filtered = batches.filter(b => {
    const mq = !q || b.product?.name?.toLowerCase().includes(q) || b.product?.sku?.toLowerCase().includes(q) || b.batchNumber.toLowerCase().includes(q);
    const mbr = lockedBranchId ? b.branchId === lockedBranchId : (branchFilter === "all" || b.branchId === branchFilter);
    const ms = statusFilter === "all" || b.status === statusFilter;
    const mef = !expiryFrom || (!!b.expiryDate && b.expiryDate >= expiryFrom);
    const met = !expiryTo || (!!b.expiryDate && b.expiryDate <= expiryTo + "T23:59:59");
    return mq && mbr && ms && mef && met;
  });

  return (
    <PageShell title="Batches & Expiry" subtitle="FIFO / FEFO tracking · auto-block expired items">
      {/* Metrics */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Active Batches" value={String(active)} icon={PackageCheck} accent="primary" />
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
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="near_expiry">Near Expiry</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
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
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export ({filtered.length})
        </Button>
        <ReceiveBatchDialog branches={branches} products={products} suppliers={suppliers} onDone={loadBatches} lockedBranchId={lockedBranchId} />
      </div>

      {/* Table */}
      <Card className="border-border/60 shadow-card">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            {loading ? (
              <div className="py-16 text-center text-sm text-muted-foreground">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="py-16 text-center text-sm text-muted-foreground">
                {batches.length === 0 ? "No batches yet. Use Receive Batch to add stock." : "No batches match your search."}
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-muted/40 border-b">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Batch #</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Branch</th>
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
                        <td className="px-4 py-3 text-xs">{branches.find(br => br.id === b.branchId)?.name ?? "—"}</td>
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
