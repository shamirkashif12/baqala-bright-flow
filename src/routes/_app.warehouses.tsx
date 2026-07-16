import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Eye, CheckCircle, XCircle, Truck, Info, Package, ClipboardList,
  Warehouse, Plus, Trash2, X,
  Pencil, MapPin, User, ArrowLeftRight,
  ChevronDown, Check, Loader2, Search,
} from "lucide-react";
import {
  api,
  type WarehouseRequest, type Warehouse as WarehouseType,
  type Branch, type Product, type Supplier,
} from "@/lib/api";
import { WarehouseFormSheet } from "@/components/warehouse-form-sheet";
import { SARIcon } from "@/lib/currency";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/warehouses")({ component: Warehouses });

// ─── Shared Badge helpers ─────────────────────────────────────────────────────

// Matches the real values WarehouseController writes (request_generated / approved / unapproved)
// — this previously used "pending"/"rejected", which no request from this API ever actually has,
// so the Pending Approval metric, the approval filter, and the Approve/Reject actions never
// matched anything for a freshly created request.
const APPROVAL_LABEL: Record<string, string> = { request_generated: "Request Generated", approved: "Approved", unapproved: "Unapproved" };
const APPROVAL_CLASS: Record<string, string> = {
  request_generated: "bg-warning/20 text-warning-foreground border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
  unapproved: "bg-destructive/15 text-destructive border-destructive/30",
};
const DELIVERY_LABEL: Record<string, string> = { pending: "Pending", in_transit: "On Way", delivered: "Delivered", failed: "Failed" };
const DELIVERY_CLASS: Record<string, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  in_transit: "bg-primary/15 text-primary border-primary/20",
  delivered: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
};

function ApprovalBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`text-xs ${APPROVAL_CLASS[status] ?? "bg-muted text-muted-foreground"}`}>
      {APPROVAL_LABEL[status] ?? status}
    </Badge>
  );
}
function DeliveryBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={`text-xs ${DELIVERY_CLASS[status] ?? "bg-muted text-muted-foreground"}`}>
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

// ─── Warehouse Management Tab ─────────────────────────────────────────────────

function WarehouseManagement() {
  const navigate = useNavigate();
  const { canCreate, canEdit } = usePermission("Warehouses");
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WarehouseType | null>(null);
  const viewWarehouse = (id: string) => navigate({ to: "/warehouses/$warehouseId", params: { warehouseId: id } });

  const load = () => {
    setLoading(true);
    api.getWarehouses().then(setWarehouses).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return warehouses.filter(w => {
      const mq = !q || w.name.toLowerCase().includes(q.toLowerCase()) || w.code.toLowerCase().includes(q.toLowerCase()) || (w.city?.toLowerCase().includes(q.toLowerCase()) ?? false);
      const ms = statusFilter === "all" || w.status === statusFilter;
      return mq && ms;
    });
  }, [warehouses, q, statusFilter]);

  const totalWH = warehouses.length;
  const activeWH = warehouses.filter(w => w.status === "active").length;
  const totalSKUs = warehouses.reduce((s, w) => s + (w.stock?.length ?? 0), 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <MetricCard label="Total Warehouses" value={String(totalWH)} icon={Warehouse} accent="primary" />
        <MetricCard label="Active" value={String(activeWH)} icon={CheckCircle} accent="success" />
        <MetricCard label="SKUs Managed" value={String(totalSKUs)} icon={Package} accent="default" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, city…" className="h-9 w-64" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Warehouse
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {warehouses.length === 0 ? "No warehouses yet. Create your first one." : "No warehouses match your search."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(w => (
            <Card
              key={w.id}
              className="border-border/60 shadow-card hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => viewWarehouse(w.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                      <Warehouse className="h-4.5 w-4.5 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{w.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{w.code}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={w.status === "active" ? "text-xs bg-success/15 text-success border-success/30" : "text-xs bg-muted text-muted-foreground"}>
                    {w.status}
                  </Badge>
                </div>
                <div className="text-center border-t border-border/40 pt-3">
                  <p className="text-sm font-bold">{w.stock?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">SKUs</p>
                </div>
                {(w.city || w.contactPerson) && (
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground border-t border-border/30 pt-3">
                    {w.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{w.city}</span>}
                    {w.contactPerson && <span className="flex items-center gap-1"><User className="h-3 w-3" />{w.contactPerson}</span>}
                  </div>
                )}
                <div className="mt-3 flex gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" className="h-7 text-xs px-2 gap-1" onClick={() => viewWarehouse(w.id)}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2 gap-1" onClick={() => { setEditTarget(w); setCreateOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <WarehouseFormSheet
        open={createOpen}
        onOpenChange={v => { setCreateOpen(v); if (!v) setEditTarget(null); }}
        warehouse={editTarget}
        onSaved={load}
      />
    </div>
  );
}

// ─── Stock Requests Tab ───────────────────────────────────────────────────────

type TxType = "warehouse_to_branches" | "return_to_warehouse" | "supplier_to_warehouses";
type RequestItem = { productId: string; product: Product; requestedQuantity: number };

// ─── MultiSelect ─────────────────────────────────────────────────────────────

function MultiSelect({
  options, value, onChange, placeholder = "Select…", disabled = false,
}: {
  options: { id: string; label: string; sub?: string }[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const toggle = (id: string) =>
    onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id]);
  const selected = options.filter(o => value.includes(o.id));
  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          className="flex h-9 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={selected.length === 0 ? "text-muted-foreground" : "font-medium"}>
            {selected.length === 0 ? placeholder : selected.length === 1 ? selected[0].label : `${selected.length} selected`}
          </span>
          <ChevronDown className="h-4 w-4 text-muted-foreground ml-2 shrink-0" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-1.5" align="start">
        {options.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground text-center">No options available.</p>
        ) : (
          <div className="max-h-56 overflow-y-auto space-y-0.5 pr-1">
            {options.map(o => (
              <button
                key={o.id}
                type="button"
                className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 hover:bg-muted text-sm text-left"
                onClick={() => toggle(o.id)}
              >
                <div className={`h-4 w-4 shrink-0 rounded border-2 flex items-center justify-center transition-colors ${value.includes(o.id) ? "bg-primary border-primary" : "border-input"}`}>
                  {value.includes(o.id) && <Check className="h-2.5 w-2.5 text-primary-foreground" strokeWidth={3} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{o.label}</p>
                  {o.sub && <p className="text-[11px] text-muted-foreground truncate">{o.sub}</p>}
                </div>
              </button>
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ─── New Request Sheet ────────────────────────────────────────────────────────

function NewRequestSheet({
  open, onOpenChange, onCreated,
}: { open: boolean; onOpenChange: (v: boolean) => void; onCreated: () => void }) {
  const [txType, setTxType] = useState<TxType>("warehouse_to_branches");
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sourceWarehouseId, setSourceWarehouseId] = useState("");
  const [sourceSupplierId, setSourceSupplierId] = useState("");
  const [destinationIds, setDestinationIds] = useState<string[]>([]);
  const [returnNumber, setReturnNumber] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [items, setItems] = useState<RequestItem[]>([]);
  const [pickProductId, setPickProductId] = useState("");
  const [pickQty, setPickQty] = useState("1");
  const [productSearch, setProductSearch] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    api.getWarehouses().then(setWarehouses);
    api.getBranches("active").then(setBranches);
    api.getSuppliers().then(setSuppliers);
    api.getProducts().then(setProducts);
  }, [open]);

  const resetForm = () => {
    setTxType("warehouse_to_branches");
    setSourceWarehouseId(""); setSourceSupplierId("");
    setDestinationIds([]);
    setReturnNumber(""); setLookupError("");
    setItems([]); setPickProductId(""); setPickQty("1"); setProductSearch("");
    setNotes(""); setError(null);
  };

  const destOptions = useMemo(() => {
    if (txType === "supplier_to_warehouses")
      return warehouses.map(w => ({ id: w.id, label: w.name, sub: w.code }));
    return branches.map(b => ({ id: b.id, label: b.name }));
  }, [txType, warehouses, branches]);

  const destLabel = txType === "supplier_to_warehouses"
    ? "Destination Warehouses"
    : txType === "return_to_warehouse"
    ? "Branches Returning Stock"
    : "Destination Branches";

  const destPlaceholder = txType === "supplier_to_warehouses"
    ? "Select warehouses…"
    : txType === "return_to_warehouse"
    ? "Select branches returning…"
    : "Select branches…";

  const lookupReturn = async () => {
    const num = returnNumber.trim();
    if (!num) return;
    setLookingUp(true); setLookupError("");
    try {
      const all = await api.getWarehouseRequests();
      const matches = all.filter(r => r.requestNumber?.toLowerCase() === num.toLowerCase());
      if (matches.length === 0) { setLookupError(`Request "${num}" not found.`); return; }
      const first = matches[0];
      const srcWarehouse = warehouses.find(w =>
        w.branchWarehouses?.some((bw: { branchId: string }) => bw.branchId === first.sourceBranchId)
      );
      if (srcWarehouse) setSourceWarehouseId(srcWarehouse.id);

      // Check if this request belongs to a batch (multi-destination)
      const batchMatch = first.notes?.match(/\[BATCH-([A-Z0-9]+)\]/);
      let related = matches;
      if (batchMatch) {
        const batchTag = `[BATCH-${batchMatch[1]}]`;
        related = all.filter(r => r.notes?.includes(batchTag));
      }
      const destBranchIds = [...new Set(related.map(r => r.destinationBranchId).filter(Boolean) as string[])];
      setDestinationIds(destBranchIds);

      if (first.items && first.items.length > 0 && items.length === 0) {
        setItems(
          first.items
            .filter(mi => mi.product)
            .map(mi => ({
              productId: mi.productId,
              product: mi.product!,
              requestedQuantity: mi.approvedQuantity ?? mi.requestedQuantity,
            }))
        );
      }
    } catch {
      setLookupError("Failed to look up request.");
    } finally { setLookingUp(false); }
  };

  const filteredProducts = products.filter(p =>
    !productSearch || p.name.toLowerCase().includes(productSearch.toLowerCase()) || p.sku?.toLowerCase().includes(productSearch.toLowerCase())
  );

  const addItem = () => {
    const product = products.find(p => p.id === pickProductId);
    if (!product) return;
    const qty = parseInt(pickQty) || 1;
    setItems(prev => {
      const ex = prev.findIndex(i => i.productId === pickProductId);
      if (ex >= 0) return prev.map((i, idx) => idx === ex ? { ...i, requestedQuantity: i.requestedQuantity + qty } : i);
      return [...prev, { productId: product.id, product, requestedQuantity: qty }];
    });
    setPickProductId(""); setPickQty("1"); setProductSearch("");
  };
  const removeItem = (pid: string) => setItems(prev => prev.filter(i => i.productId !== pid));
  const updateQty = (pid: string, qty: number) =>
    setItems(prev => prev.map(i => i.productId === pid ? { ...i, requestedQuantity: Math.max(1, qty) } : i));

  const handleSubmit = async () => {
    if (destinationIds.length === 0) { setError("Select at least one destination."); return; }
    if (items.length === 0) { setError("Add at least one item."); return; }
    if (txType === "warehouse_to_branches" && !sourceWarehouseId) { setError("Select a source warehouse."); return; }
    if (txType === "supplier_to_warehouses" && !sourceSupplierId) { setError("Select a supplier."); return; }
    setSaving(true); setError(null);
    try {
      const itemsPayload = items.map(i => ({ productId: i.productId, requestedQuantity: i.requestedQuantity })) as never;
      const batchTag = destinationIds.length > 1
        ? `[BATCH-${Math.random().toString(36).slice(2, 8).toUpperCase()}]`
        : null;
      const baseNotes = (batchTag ? `${batchTag} ` : "") + (notes || "");

      if (txType === "warehouse_to_branches") {
        const srcBranchId = warehouses.find(w => w.id === sourceWarehouseId)?.branchWarehouses?.[0]?.branchId;
        for (const branchId of destinationIds) {
          await api.createWarehouseRequest({ sourceBranchId: srcBranchId, destinationBranchId: branchId, notes: baseNotes || undefined, items: itemsPayload });
        }
      } else if (txType === "supplier_to_warehouses") {
        for (const wid of destinationIds) {
          const destBranchId = warehouses.find(w => w.id === wid)?.branchWarehouses?.[0]?.branchId ?? wid;
          await api.createWarehouseRequest({ supplierId: sourceSupplierId, destinationBranchId: destBranchId, notes: baseNotes || undefined, items: itemsPayload });
        }
      } else {
        // return_to_warehouse: each selected branch returns stock back to the warehouse
        const destWhBranchId = sourceWarehouseId
          ? warehouses.find(w => w.id === sourceWarehouseId)?.branchWarehouses?.[0]?.branchId
          : undefined;
        const returnNotes = `Return${returnNumber ? ` of ${returnNumber}` : ""}${batchTag ? ` ${batchTag}` : ""}${notes ? `. ${notes}` : ""}`;
        for (const branchId of destinationIds) {
          await api.createWarehouseRequest({
            sourceBranchId: branchId,
            destinationBranchId: destWhBranchId ?? branchId,
            notes: returnNotes,
            items: itemsPayload,
          });
        }
      }
      onCreated(); onOpenChange(false); resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit request.");
    } finally { setSaving(false); }
  };

  const totalUnits = items.reduce((s, i) => s + i.requestedQuantity, 0);
  const destCount = destinationIds.length;
  const totalValuePerDest = items.reduce((s, i) => s + i.requestedQuantity * (i.product.costPrice ?? 0), 0);
  const grandTotal = totalValuePerDest * Math.max(destCount, 1);

  return (
    <Sheet open={open} onOpenChange={v => { onOpenChange(v); if (!v) setError(null); }}>
      <SheetContent className="w-[520px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" /> New Stock Request
          </SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-5">

          {/* Transfer type selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Transfer Type</Label>
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { v: "warehouse_to_branches" as TxType, label: "Warehouse → Branches" },
                { v: "supplier_to_warehouses" as TxType, label: "Supplier → Warehouses" },
                { v: "return_to_warehouse" as TxType, label: "Return to Warehouse" },
              ]).map(({ v, label }) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setTxType(v);
                    setDestinationIds([]); setSourceWarehouseId(""); setSourceSupplierId("");
                    setReturnNumber(""); setLookupError("");
                  }}
                  className={`rounded-lg border px-2 py-2 text-xs font-medium transition-colors text-center leading-snug ${txType === v ? "border-primary bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Return: original request number lookup */}
          {txType === "return_to_warehouse" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Original Request Number</Label>
              <div className="flex gap-2">
                <Input
                  value={returnNumber}
                  onChange={e => { setReturnNumber(e.target.value); setLookupError(""); }}
                  onKeyDown={e => e.key === "Enter" && lookupReturn()}
                  placeholder="e.g. WR-0001"
                  className="h-9 flex-1 font-mono"
                />
                <Button size="sm" variant="outline" className="h-9 px-3 gap-1.5" onClick={lookupReturn} disabled={!returnNumber.trim() || lookingUp}>
                  {lookingUp ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
                  Lookup
                </Button>
              </div>
              {lookupError && <p className="text-xs text-destructive">{lookupError}</p>}
              {!lookupError && !lookingUp && (
                <p className="text-xs text-muted-foreground">Enter the original request number to auto-populate branches and items.</p>
              )}
            </div>
          )}

          {/* Source */}
          <div className={`grid gap-3 ${txType === "warehouse_to_branches" ? "grid-cols-2" : "grid-cols-1"}`}>
            {txType === "supplier_to_warehouses" ? (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Supplier <span className="text-destructive">*</span></Label>
                <Select value={sourceSupplierId} onValueChange={setSourceSupplierId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {txType === "return_to_warehouse" ? "Returning to Warehouse" : "Source Warehouse"}
                  {txType === "warehouse_to_branches" && <span className="text-destructive"> *</span>}
                </Label>
                <Select value={sourceWarehouseId} onValueChange={setSourceWarehouseId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.code} — {w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Destination multi-select — inline col for warehouse_to_branches */}
            {txType === "warehouse_to_branches" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  {destLabel} <span className="text-destructive">*</span>
                  {destCount > 0 && <span className="ml-1.5 text-primary font-normal">({destCount})</span>}
                </Label>
                <MultiSelect options={destOptions} value={destinationIds} onChange={setDestinationIds} placeholder={destPlaceholder} />
              </div>
            )}
          </div>

          {/* Full-width destination for supplier→warehouses and return */}
          {txType !== "warehouse_to_branches" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">
                {destLabel} <span className="text-destructive">*</span>
                {destCount > 0 && <span className="ml-1.5 text-primary font-normal">({destCount} selected)</span>}
              </Label>
              <MultiSelect options={destOptions} value={destinationIds} onChange={setDestinationIds} placeholder={destPlaceholder} />
            </div>
          )}

          {/* Selected destination chips */}
          {destinationIds.length > 0 && (
            <div className="flex flex-wrap gap-1.5 -mt-3">
              {destinationIds.map(id => {
                const lbl = destOptions.find(o => o.id === id)?.label ?? id;
                return (
                  <span key={id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium border border-primary/20">
                    {lbl}
                    <button type="button" onClick={() => setDestinationIds(p => p.filter(v => v !== id))} className="hover:text-destructive ml-0.5">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Items */}
          <div className="space-y-3">
            <Label className="text-xs font-medium">Items <span className="text-destructive">*</span></Label>
            <div className="rounded-xl border border-border/60 p-3 space-y-2 bg-muted/20">
              <Input value={productSearch} onChange={e => setProductSearch(e.target.value)} placeholder="Search product name or SKU…" className="h-8 text-xs" />
              <div className="flex gap-2">
                <Select value={pickProductId} onValueChange={setPickProductId}>
                  <SelectTrigger className="h-8 flex-1 text-xs"><SelectValue placeholder="Select product…" /></SelectTrigger>
                  <SelectContent>
                    {filteredProducts.slice(0, 50).map(p => (
                      <SelectItem key={p.id} value={p.id}>
                        <span className="font-medium">{p.name}</span>
                        {p.sku && <span className="ml-2 text-muted-foreground text-xs font-mono">{p.sku}</span>}
                      </SelectItem>
                    ))}
                    {filteredProducts.length === 0 && <div className="px-3 py-2 text-xs text-muted-foreground">No products found.</div>}
                  </SelectContent>
                </Select>
                <Input type="number" min={1} value={pickQty} onChange={e => setPickQty(e.target.value)} className="h-8 w-20 text-xs" placeholder="Qty" />
                <Button size="sm" variant="outline" className="h-8 px-3 gap-1" onClick={addItem} disabled={!pickProductId}>
                  <Plus className="h-3.5 w-3.5" />Add
                </Button>
              </div>
            </div>
            {items.length > 0 ? (
              <div className="space-y-1.5">
                {items.map(item => (
                  <div key={item.productId} className="flex items-center justify-between rounded-xl border border-border/40 px-3 py-2.5 bg-background">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{item.product.name}</p>
                      {item.product.sku && <p className="text-xs text-muted-foreground font-mono">{item.product.sku}</p>}
                    </div>
                    <div className="flex items-center gap-2 ml-3 shrink-0">
                      <Input type="number" min={1} value={item.requestedQuantity} onChange={e => updateQty(item.productId, parseInt(e.target.value) || 1)} className="h-7 w-16 text-xs text-center" />
                      <span className="text-xs text-muted-foreground">per dest.</span>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => removeItem(item.productId)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground text-right pt-1">
                  {items.length} product{items.length !== 1 ? "s" : ""} · {totalUnits} unit{totalUnits !== 1 ? "s" : ""} per destination
                  {destCount > 1 && <> · <span className="font-semibold text-primary">{destCount} destinations = {totalUnits * destCount} total</span></>}
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-3">No items added yet.</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for request, urgency, special handling…" rows={2} className="resize-none text-sm" />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          {/* Cost & batch summary */}
          {items.length > 0 && totalValuePerDest > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 px-3 py-2.5 space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">Value per destination</span>
                <span className="font-semibold flex items-center gap-0.5"><SARIcon />{totalValuePerDest.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
              {destCount > 1 && (
                <div className="flex justify-between items-center border-t border-primary/20 pt-1.5">
                  <span className="text-primary font-semibold">{destCount} destinations — Grand Total</span>
                  <span className="font-bold text-sm flex items-center gap-0.5 text-primary"><SARIcon />{grandTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                </div>
              )}
              {destCount > 1 && (
                <p className="text-muted-foreground pt-0.5">{destCount} separate requests will be created — one per destination.</p>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-2 border-t border-border/60">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1 gradient-primary text-primary-foreground border-0" onClick={handleSubmit} disabled={saving}>
              {saving ? "Submitting…" : destCount > 1 ? `Submit ${destCount} Requests` : "Submit Request"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function StockRequestsTab() {
  const { user } = useAuth();
  // Enforced server-side under "Stock Transfers" (WarehouseController.Approve/CreateRequest/
  // UpdateDelivery), not "Warehouses" — gate the actions here to match, so a view-only user
  // doesn't see interactive-looking buttons that just 403 with no explanation.
  const { canCreate, canApprove } = usePermission("Stock Transfers");
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
    setLoading(true);
    api.getWarehouseRequests({
      approvalStatus: approvalFilter !== "all" ? approvalFilter : undefined,
      deliveryStatus: deliveryFilter !== "all" ? deliveryFilter : undefined,
    }).then(setRequests).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [approvalFilter, deliveryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = requests.filter(r => {
    const mq = !q || r.requestNumber?.toLowerCase().includes(q.toLowerCase()) || r.sourceBranch?.name?.toLowerCase().includes(q.toLowerCase()) || r.destinationBranch?.name?.toLowerCase().includes(q.toLowerCase()) || r.supplier?.name?.toLowerCase().includes(q.toLowerCase());
    const mdf = !dateFrom || (!!r.createdAt && r.createdAt >= dateFrom);
    const mdt = !dateTo || (!!r.createdAt && r.createdAt <= dateTo + "T23:59:59");
    return mq && mdf && mdt;
  });

  const pendingCount = requests.filter(r => r.approvalStatus === "request_generated").length;
  const approvedCount = requests.filter(r => r.approvalStatus === "approved").length;
  const onWayCount = requests.filter(r => r.deliveryStatus === "in_transit").length;
  const deliveredCount = requests.filter(r => r.deliveryStatus === "delivered").length;

  const handleApprove = async (id: string, approved: boolean) => {
    try {
      await api.approveWarehouseRequest(id, approved, user?.id ?? "");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update request.");
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Pending Approval" value={String(pendingCount)} icon={ClipboardList} accent="warning" />
        <MetricCard label="Approved" value={String(approvedCount)} icon={CheckCircle} accent="success" />
        <MetricCard label="On Way" value={String(onWayCount)} icon={Truck} accent="primary" />
        <MetricCard label="Delivered" value={String(deliveredCount)} icon={Warehouse} accent="success" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search request #, branch, supplier…" className="h-9 w-64 flex-shrink-0" />
        <Select value={approvalFilter} onValueChange={setApprovalFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Approvals</SelectItem>
            <SelectItem value="request_generated">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="unapproved">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <Select value={deliveryFilter} onValueChange={setDeliveryFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Delivery" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Delivery</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="in_transit">On Way</SelectItem>
            <SelectItem value="delivered">Delivered</SelectItem>
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
        <div className="flex-1" />
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setNewOpen(true)}>
            + New Request
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
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
                        <Package className="h-3 w-3" />{r.items?.length ?? 0} item{(r.items?.length ?? 0) !== 1 ? "s" : ""}
                      </span>
                    </td>
                    <td className="px-3 py-3"><ApprovalBadge status={r.approvalStatus} /></td>
                    <td className="px-3 py-3"><DeliveryBadge status={r.deliveryStatus} /></td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{new Date(r.createdAt).toLocaleDateString("en-SA")}</td>
                    <td className="px-3 py-3 text-xs max-w-[120px] truncate text-muted-foreground">{r.notes ?? "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewReq(r)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                        {r.approvalStatus === "request_generated" && canApprove && (
                          <>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-success" onClick={() => handleApprove(r.id, true)}><CheckCircle className="h-3.5 w-3.5" /></Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleApprove(r.id, false)}><XCircle className="h-3.5 w-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-10 text-muted-foreground text-sm">No requests found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <NewRequestSheet open={newOpen} onOpenChange={setNewOpen} onCreated={() => { setLoading(true); load(); }} />

      {/* View Request drawer */}
      <Sheet open={!!viewReq} onOpenChange={v => !v && setViewReq(null)}>
        <SheetContent className="w-[500px] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />{viewReq?.requestNumber}
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
                  <TabsTrigger value="items" className="gap-1.5"><Package className="h-3.5 w-3.5" />Items</TabsTrigger>
                  <TabsTrigger value="notes" className="gap-1.5"><Info className="h-3.5 w-3.5" />Notes</TabsTrigger>
                  <TabsTrigger value="tracking" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Tracking</TabsTrigger>
                </TabsList>
                <TabsContent value="items" className="mt-4 space-y-3">
                  <F label="Source" value={viewReq.sourceBranch?.name ?? viewReq.supplier?.name ?? "—"} />
                  <F label="Destination" value={viewReq.destinationBranch?.name ?? "—"} />
                  <F label="Created" value={new Date(viewReq.createdAt).toLocaleDateString("en-SA")} />
                  {viewReq.items && viewReq.items.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Requested Items</p>
                      <div className="space-y-2">
                        {viewReq.items.map((item, i) => (
                          <div key={i} className="flex items-center justify-between rounded-xl border border-border/40 p-3 text-sm">
                            <div>
                              <p className="font-medium">{item.product?.name ?? "—"}</p>
                              <p className="text-xs text-muted-foreground font-mono">{item.product?.sku ?? ""}</p>
                            </div>
                            <div className="text-right text-xs text-muted-foreground">
                              <p>Req: <span className="font-semibold text-foreground">{item.requestedQuantity}</span></p>
                              {item.approvedQuantity != null && <p>Approved: <span className="font-semibold text-success">{item.approvedQuantity}</span></p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="notes" className="mt-4">
                  {viewReq.notes ? <p className="text-sm">{viewReq.notes}</p> : <p className="text-xs text-muted-foreground">No notes.</p>}
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
                  {viewReq.approvalStatus === "request_generated" && canApprove && (
                    <div className="flex gap-2 pt-4 border-t border-border/40">
                      <Button size="sm" className="gradient-primary text-primary-foreground border-0 flex-1" onClick={() => { handleApprove(viewReq.id, true); setViewReq(null); }}>
                        <CheckCircle className="h-3.5 w-3.5 mr-1.5" />Approve
                      </Button>
                      <Button size="sm" variant="outline" className="text-destructive flex-1" onClick={() => { handleApprove(viewReq.id, false); setViewReq(null); }}>
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
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function Warehouses() {
  return (
    <PageShell
      title="Warehouses"
      subtitle="Manage warehouse entities, stock, and inter-branch stock requests"
    >
      <Tabs defaultValue="management">
        <TabsList className="mb-4">
          <TabsTrigger value="management" className="gap-1.5">
            <Warehouse className="h-4 w-4" /> Warehouse Management
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-1.5">
            <ArrowLeftRight className="h-4 w-4" /> Stock Requests
          </TabsTrigger>
        </TabsList>
        <TabsContent value="management"><WarehouseManagement /></TabsContent>
        <TabsContent value="requests"><StockRequestsTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
