import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { RotateCcw, Loader2, Plus, Search, ChevronDown, Check, X } from "lucide-react";
import { api, type StockTransfer, type Warehouse, type Supplier, type StockTransferItem } from "@/lib/api";
import { SARIcon } from "@/lib/currency";

export const Route = createFileRoute("/_app/supplier-returns")({ component: SupplierReturns });

const STATUS_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-warning/20 text-warning-foreground",
  approved: "bg-primary/15 text-primary",
  in_transit: "bg-primary/15 text-primary",
  completed: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

const RETURN_REASONS = [
  { value: "expired", label: "Expired" },
  { value: "damaged", label: "Damaged" },
  { value: "quality_issue", label: "Quality Issue" },
  { value: "overstock", label: "Overstock" },
  { value: "other", label: "Other" },
];

// ─── Inline multi-select (same pattern as warehouses) ─────────────────────────
function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
}: {
  options: { id: string; label: string }[];
  value: string[];
  onChange: (v: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  const label =
    value.length === 0 ? placeholder
    : value.length === 1 ? (options.find(o => o.id === value[0])?.label ?? placeholder)
    : `${value.length} selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
        >
          <span className={value.length === 0 ? "text-muted-foreground" : ""}>{label}</span>
          <ChevronDown className="h-4 w-4 opacity-50 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-2 max-h-60 overflow-y-auto">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() => toggle(opt.id)}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted text-left"
          >
            <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${value.includes(opt.id) ? "bg-primary border-primary" : "border-input"}`}>
              {value.includes(opt.id) && <Check className="h-3 w-3 text-primary-foreground" />}
            </div>
            <span className="font-medium truncate">{opt.label}</span>
          </button>
        ))}
        {options.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">No options</p>}
      </PopoverContent>
    </Popover>
  );
}

// ─── RTS item row ──────────────────────────────────────────────────────────────
interface RtsItem { productId: string; productName: string; requestedQuantity: number; unitCost: string }

// ─── RTS Sheet — step 1: lookup, step 2: configure ────────────────────────────
function RtsSheet({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Step 1
  const [orderNumber, setOrderNumber] = useState("");
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState("");

  // Fetched — carried to step 2
  const [fetchedSupplierId, setFetchedSupplierId] = useState("");
  const [fetchedSupplierName, setFetchedSupplierName] = useState("");
  // all warehouse IDs from the original order (may be 1 or many)
  const [allWhOptions, setAllWhOptions] = useState<{ id: string; label: string }[]>([]);

  // Step 2
  const [selectedWhIds, setSelectedWhIds] = useState<string[]>([]);
  const [returnReason, setReturnReason] = useState("");
  const [items, setItems] = useState<RtsItem[]>([]);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    api.getWarehouses().then(setWarehouses);
    api.getSuppliers().then(setSuppliers);
  }, [open]);

  const resetForm = () => {
    setStep(1);
    setOrderNumber(""); setFetchError("");
    setFetchedSupplierId(""); setFetchedSupplierName("");
    setAllWhOptions([]); setSelectedWhIds([]);
    setReturnReason(""); setItems([]); setNotes(""); setError("");
  };

  const lookupOrder = async () => {
    const num = orderNumber.trim();
    if (!num) return;
    setFetching(true); setFetchError("");

    try {
      // ── Try warehouse request lookup first (covers multi-destination batch case) ──
      const allReqs = await api.getWarehouseRequests();
      const matches = allReqs.filter(r => r.requestNumber?.toLowerCase() === num.toLowerCase());

      if (matches.length > 0) {
        const first = matches[0];

        // Expand batch: find all sibling requests tagged with the same batch ID
        const batchMatch = first.notes?.match(/\[BATCH-([A-Z0-9]+)\]/);
        let related = matches;
        if (batchMatch) {
          const tag = `[BATCH-${batchMatch[1]}]`;
          related = allReqs.filter(r => r.notes?.includes(tag));
        }

        // Map each destinationBranchId → warehouse
        const destBranchIds = [...new Set(related.map(r => r.destinationBranchId).filter(Boolean) as string[])];
        const whPairs = destBranchIds
          .map(branchId => {
            const wh = warehouses.find(w =>
              w.branchWarehouses?.some((bw: { branchId: string }) => bw.branchId === branchId)
            );
            return wh ? { id: wh.id, label: wh.name } : null;
          })
          .filter(Boolean) as { id: string; label: string }[];

        // Resolve supplier
        const supplierId = first.supplierId ?? "";
        const supplier = suppliers.find(s => s.id === supplierId);

        setFetchedSupplierId(supplierId);
        setFetchedSupplierName(supplier?.name ?? "");
        setAllWhOptions(whPairs);
        setSelectedWhIds(whPairs.map(w => w.id)); // all pre-selected

        // Items from the first matching request
        if (first.items?.length) {
          setItems(first.items
            .filter(i => i.product)
            .map(i => ({
              productId: i.productId,
              productName: i.product!.name,
              requestedQuantity: i.approvedQuantity ?? i.requestedQuantity,
              unitCost: i.product?.costPrice ? String(i.product.costPrice) : "",
            }))
          );
        }
        setStep(2);
        return;
      }

      // ── Fallback: PO number (supports single or batch) ──
      try {
        const po = await api.getPurchaseOrderByNumber(num);
        if (po) {
          const supplier = suppliers.find(s => s.id === po.supplierId);
          setFetchedSupplierId(po.supplierId);
          setFetchedSupplierName(supplier?.name ?? po.supplier?.name ?? "");

          let whPairs: { id: string; label: string }[] = [];
          if (po.batchId) {
            // Batch PO — collect all sibling warehouses
            const siblings = await api.getPurchaseOrdersByBatch(po.batchId);
            const seen = new Set<string>();
            whPairs = siblings
              .filter(p => p.warehouseId)
              .map(p => {
                const wh = warehouses.find(w => w.id === p.warehouseId);
                return wh ? { id: wh.id, label: wh.name } : null;
              })
              .filter((p): p is { id: string; label: string } => p !== null && !seen.has(p.id) && !!seen.add(p.id));
          } else {
            const wh = warehouses.find(w => w.id === po.warehouseId);
            whPairs = wh ? [{ id: wh.id, label: wh.name }] : [];
          }

          setAllWhOptions(whPairs);
          setSelectedWhIds(whPairs.map(w => w.id));

          if (po.items?.length) {
            setItems(po.items.map((i: { productId: string; product?: { name: string; costPrice?: number }; orderedQuantity: number; unitCost: number }) => ({
              productId: i.productId,
              productName: i.product?.name ?? i.productId,
              requestedQuantity: i.orderedQuantity,
              unitCost: String(i.unitCost ?? i.product?.costPrice ?? ""),
            })));
          }
          setStep(2);
          return;
        }
      } catch { /* PO not found, fall through */ }

      setFetchError(`Order "${num}" not found. Try a warehouse request number (WR-...) or PO number.`);
    } catch {
      setFetchError("Failed to look up order.");
    } finally { setFetching(false); }
  };

  const validItems = items.filter(i => i.productId && i.requestedQuantity > 0);
  const costPerWarehouse = validItems.reduce((s, i) => s + i.requestedQuantity * (parseFloat(i.unitCost) || 0), 0);
  const selectedCount = selectedWhIds.length;
  const grandTotal = costPerWarehouse * Math.max(selectedCount, 1);

  const handleSubmit = async () => {
    if (selectedWhIds.length === 0) { setError("Select at least one warehouse to return from."); return; }
    if (!returnReason) { setError("Select a return reason."); return; }
    if (validItems.length === 0) { setError("No valid items to return."); return; }
    setSaving(true); setError("");
    try {
      const batchId = selectedWhIds.length > 1 ? crypto.randomUUID() : undefined;
      for (const whId of selectedWhIds) {
        await api.createStockTransfer({
          transferType: "warehouse_to_supplier",
          status: "draft",
          sourceWarehouseId: whId,
          destSupplierId: fetchedSupplierId || undefined,
          returnReason,
          notes: notes || undefined,
          batchId,
          items: validItems.map(i => ({
            productId: i.productId,
            requestedQuantity: i.requestedQuantity,
            unitCost: i.unitCost ? Number(i.unitCost) : undefined,
          })) as StockTransferItem[],
        });
      }
      onCreated();
      onOpenChange(false);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create RTS.");
    } finally { setSaving(false); }
  };

  const isMultiWh = allWhOptions.length > 1;

  return (
    <Sheet open={open} onOpenChange={v => { onOpenChange(v); if (!v) resetForm(); }}>
      <SheetContent className="w-[540px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-primary" />
            New Return to Supplier (RTS)
          </SheetTitle>
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-xs mt-1">
            <span className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold ${step === 1 ? "bg-primary text-primary-foreground" : "bg-success text-success-foreground"}`}>
              {step === 1 ? "1" : "✓"}
            </span>
            <span className={step === 1 ? "font-semibold" : "text-muted-foreground"}>Lookup Order</span>
            <div className="h-px w-6 bg-border" />
            <span className={`flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold ${step === 2 ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>2</span>
            <span className={step === 2 ? "font-semibold" : "text-muted-foreground"}>Configure Return</span>
          </div>
        </SheetHeader>

        {/* ── Step 1: Order number lookup ── */}
        {step === 1 && (
          <div className="mt-5 space-y-5">
            <div className="space-y-2">
              <Label className="text-xs font-medium">Order / Request Number *</Label>
              <p className="text-xs text-muted-foreground">
                Enter the original supply request number (WR-...) or purchase order number (PO-...) to auto-populate the return.
              </p>
              <div className="flex gap-2">
                <Input
                  value={orderNumber}
                  onChange={e => { setOrderNumber(e.target.value); setFetchError(""); }}
                  onKeyDown={e => e.key === "Enter" && lookupOrder()}
                  placeholder="e.g. WR-2024-001 or PO-2024-001"
                  className="h-9 text-sm flex-1 font-mono"
                  autoFocus
                />
                <Button
                  onClick={lookupOrder}
                  disabled={fetching || !orderNumber.trim()}
                  className="gradient-primary text-primary-foreground border-0 gap-1.5"
                >
                  {fetching
                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    : <Search className="h-3.5 w-3.5" />}
                  Fetch
                </Button>
              </div>
              {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}
            </div>
          </div>
        )}

        {/* ── Step 2: Configure return ── */}
        {step === 2 && (
          <div className="mt-5 space-y-5">

            {/* Summary bar */}
            <div className="rounded-lg bg-muted/50 border border-border/60 px-3 py-2 text-xs space-y-0.5">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Order</span>
                <span className="font-mono font-semibold">{orderNumber}</span>
              </div>
              {fetchedSupplierName && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Supplier</span>
                  <span className="font-semibold">{fetchedSupplierName}</span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Original destinations</span>
                <span className="font-semibold">{allWhOptions.length} warehouse{allWhOptions.length !== 1 ? "s" : ""}</span>
              </div>
              <button
                type="button"
                className="text-primary text-[11px] hover:underline pt-0.5"
                onClick={() => setStep(1)}
              >
                ← Change order number
              </button>
            </div>

            {/* ── Warehouse selection: multi-select only when > 1 original destination ── */}
            {isMultiWh ? (
              <div className="space-y-2">
                <Label className="text-xs font-medium">
                  Warehouses Returning Stock *
                  <span className="ml-1.5 text-primary font-normal">
                    ({selectedCount} of {allWhOptions.length} selected)
                  </span>
                </Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Original order went to {allWhOptions.length} warehouses. Deselect any that are not returning.
                </p>
                <MultiSelect
                  options={allWhOptions}
                  value={selectedWhIds}
                  onChange={setSelectedWhIds}
                  placeholder="Select warehouses returning…"
                />
                {/* Chips */}
                {selectedWhIds.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedWhIds.map(id => {
                      const lbl = allWhOptions.find(o => o.id === id)?.label ?? id;
                      return (
                        <span key={id} className="inline-flex items-center gap-1 text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
                          {lbl}
                          <button
                            type="button"
                            onClick={() => setSelectedWhIds(prev => prev.filter(v => v !== id))}
                            className="hover:text-destructive ml-0.5"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : allWhOptions.length === 1 ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Source Warehouse</Label>
                <div className="h-9 flex items-center px-3 rounded-md bg-muted/50 border border-border/60 text-sm font-medium">
                  {allWhOptions[0].label}
                </div>
              </div>
            ) : null}

            {/* Return Reason */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Return Reason *</Label>
              <Select value={returnReason} onValueChange={setReturnReason}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select reason…" /></SelectTrigger>
                <SelectContent>
                  {RETURN_REASONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Items table */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">
                Items
                <span className="ml-1.5 text-muted-foreground font-normal">(per warehouse)</span>
              </Label>
              <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                {/* Header */}
                <div className="grid grid-cols-[1fr_56px_80px] gap-2 px-1 text-[10px] text-muted-foreground uppercase tracking-wider">
                  <span>Product</span><span className="text-center">Qty</span><span className="text-right">Unit Cost</span>
                </div>
                {items.map((item, idx) => (
                  <div key={idx} className="grid grid-cols-[1fr_56px_80px] gap-2 items-center">
                    <span className="text-sm truncate" title={item.productName}>{item.productName}</span>
                    <Input
                      type="number"
                      min={1}
                      value={item.requestedQuantity}
                      onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, requestedQuantity: Math.max(1, parseInt(e.target.value) || 1) } : it))}
                      className="h-8 text-xs text-center px-1"
                    />
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={item.unitCost}
                      onChange={e => setItems(prev => prev.map((it, i) => i === idx ? { ...it, unitCost: e.target.value } : it))}
                      className="h-8 text-xs text-right px-2"
                      placeholder="0.00"
                    />
                  </div>
                ))}
                {items.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-3">No items loaded from order.</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-right">
                {validItems.length} item{validItems.length !== 1 ? "s" : ""} · {validItems.reduce((s, i) => s + i.requestedQuantity, 0)} units per warehouse
              </p>
            </div>

            {/* Cost / total summary */}
            {costPerWarehouse > 0 && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">
                    {isMultiWh ? "Credit per warehouse" : "Total credit value"}
                  </span>
                  <span className="font-semibold flex items-center gap-0.5">
                    <SARIcon />{costPerWarehouse.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  </span>
                </div>
                {isMultiWh && selectedCount > 0 && (
                  <div className="flex justify-between items-center border-t border-primary/20 pt-1.5">
                    <span className="text-primary font-semibold">
                      {selectedCount} warehouse{selectedCount !== 1 ? "s" : ""} returning — Grand Total
                    </span>
                    <span className="font-bold text-sm flex items-center gap-0.5 text-primary">
                      <SARIcon />{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
                {isMultiWh && selectedCount < allWhOptions.length && (
                  <p className="text-muted-foreground text-[11px]">
                    {allWhOptions.length - selectedCount} warehouse{allWhOptions.length - selectedCount !== 1 ? "s" : ""} not returning — excluded from total
                  </p>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Notes</Label>
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Condition details, batch info, reference…"
                rows={2}
                className="resize-none text-sm"
              />
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}

            <div className="flex gap-2 pt-2 border-t border-border/60">
              <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                className="flex-1 gradient-primary text-primary-foreground border-0"
                onClick={handleSubmit}
                disabled={saving || selectedWhIds.length === 0}
              >
                {saving
                  ? <><Loader2 className="h-4 w-4 animate-spin mr-1.5" />Creating…</>
                  : selectedCount > 1
                  ? `Create ${selectedCount} RTS Transfers`
                  : "Create RTS"}
              </Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────
function SupplierReturns() {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [rtsOpen, setRtsOpen] = useState(false);

  const load = () => {
    setLoading(true);
    api.getStockTransfers({ transferType: "warehouse_to_supplier" })
      .then(setTransfers)
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const filtered = transfers.filter(t => {
    const s = q.toLowerCase();
    if (s && !t.transferNumber.toLowerCase().includes(s) &&
        !(t.destSupplier?.name.toLowerCase().includes(s)) &&
        !(t.sourceWarehouse?.name.toLowerCase().includes(s))) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  const completed = transfers.filter(t => t.status === "completed");
  const totalRtsValue = completed.reduce(
    (s, t) => s + (t.items ?? []).reduce((si, i) => si + (i.receivedQuantity ?? i.requestedQuantity) * (i.unitCost ?? 0), 0),
    0,
  );

  return (
    <PageShell title="Supplier Returns (RTS)" subtitle="Warehouse-to-supplier return transfers and credit notes">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard label="Total RTS" value={String(transfers.length)} icon={RotateCcw} accent="default" />
        <MetricCard label="Completed" value={String(completed.length)} icon={RotateCcw} accent="success" />
        <MetricCard label="Total Credit Value" value={`SAR ${totalRtsValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={RotateCcw} accent="primary" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search transfer#, supplier, warehouse…"
          className="h-9 w-72 flex-shrink-0"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          className="gradient-primary text-primary-foreground border-0 gap-1.5"
          onClick={() => setRtsOpen(true)}
        >
          <Plus className="h-4 w-4" /> New RTS
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 mt-4">
          <Loader2 className="h-5 w-5 animate-spin" /><span>Loading returns…</span>
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Transfer #</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Warehouse</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold text-center">Items</th>
                  <th className="px-4 py-3 font-semibold text-right">Credit Value</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const creditValue = (t.items ?? []).reduce(
                    (s, i) => s + (i.receivedQuantity ?? i.requestedQuantity) * (i.unitCost ?? 0),
                    0,
                  );
                  return (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs font-bold">{t.transferNumber}</td>
                      <td className="px-4 py-3">{t.destSupplier?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{t.sourceWarehouse?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        {t.returnReason
                          ? <Badge variant="outline" className="text-xs capitalize">{t.returnReason.replace(/_/g, " ")}</Badge>
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{t.items?.length ?? 0}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {creditValue > 0
                          ? <span className="flex items-center gap-0.5 justify-end text-primary"><SARIcon />{creditValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_CLS[t.status] ?? "bg-muted text-muted-foreground"}`}>
                          {t.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString("en-SA")}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      No supplier return transfers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <RtsSheet open={rtsOpen} onOpenChange={setRtsOpen} onCreated={load} />
    </PageShell>
  );
}
