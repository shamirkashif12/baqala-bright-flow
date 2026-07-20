import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Boxes, ArrowDownToLine, ArrowUpFromLine, ClipboardCheck, Truck, Undo2,
  Trash2, Plus, History, FileBarChart, ScanLine, Package, AlertTriangle,
  TrendingUp, BarChart3, Download, CheckCircle2, ImageOff, X, RotateCcw, PlayCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  api, Branch, Product, Supplier, Warehouse, Category,
  InventoryStock, InventoryBatch, InventoryAdjustment,
  PurchaseOrder, StockTransfer, StockCount, StockCountItem, StockMovement,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";

export const Route = createFileRoute("/_app/stocks")({ component: Stocks });

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString("en-SA", { minimumFractionDigits: 0 }); }
function fmtDate(d?: string) { if (!d) return "—"; return new Date(d).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" }); }
function fmtTime(d?: string) { if (!d) return "—"; return new Date(d).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" }); }

// Every distinct movementType the ledger's write paths ever record (PurchaseOrdersController,
// OrdersController, StockTransfersController, InventoryController, OperationalAlertsService) —
// kept in one place so the Movement tab's filter dropdown and the timeline's label/color never
// drift out of sync with what the backend actually writes.
const MOVEMENT_TYPES = [
  "purchase_receive", "sale", "transfer_out", "transfer_in", "transfer_restore",
  "manual_receive", "adjustment_addition", "adjustment_reduction", "adjustment_damage",
  "adjustment_expired", "adjustment_transfer_in", "adjustment_return_to_supplier", "expired",
];
const MOVEMENT_TYPE_META: Record<string, { label: string; color: string }> = {
  purchase_receive: { label: "Purchase Receive", color: "bg-green-100 text-green-700" },
  sale: { label: "Sale", color: "bg-blue-100 text-blue-700" },
  transfer_out: { label: "Transfer Out", color: "bg-orange-100 text-orange-700" },
  transfer_in: { label: "Transfer In", color: "bg-cyan-100 text-cyan-700" },
  transfer_restore: { label: "Transfer Restored", color: "bg-indigo-100 text-indigo-700" },
  manual_receive: { label: "Manual Receive", color: "bg-emerald-100 text-emerald-700" },
  expired: { label: "Expired Write-off", color: "bg-red-100 text-red-700" },
};
function movementMeta(type: string) {
  if (MOVEMENT_TYPE_META[type]) return MOVEMENT_TYPE_META[type];
  if (type.startsWith("adjustment_")) return { label: `Adjustment — ${type.replace("adjustment_", "").replace(/_/g, " ")}`, color: "bg-purple-100 text-purple-700" };
  return { label: type.replace(/_/g, " "), color: "bg-gray-100 text-gray-600" };
}

function StBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    pending: "bg-yellow-100 text-yellow-700",
    completed: "bg-blue-100 text-blue-700",
    cancelled: "bg-red-100 text-red-700",
    partial: "bg-orange-100 text-orange-700",
    partial_received: "bg-orange-100 text-orange-700",
    fully_received: "bg-green-100 text-green-700",
    approved: "bg-emerald-100 text-emerald-700",
    rejected: "bg-red-100 text-red-700",
    draft: "bg-gray-100 text-gray-600",
    expired: "bg-red-100 text-red-700",
    damage: "bg-red-100 text-red-700",
    waste: "bg-amber-100 text-amber-700",
    theft: "bg-rose-100 text-rose-700",
    other: "bg-slate-100 text-slate-600",
    reduction: "bg-orange-100 text-orange-700",
    addition: "bg-green-100 text-green-700",
    transfer_in: "bg-blue-100 text-blue-700",
    warehouse_to_supplier: "bg-purple-100 text-purple-700",
    warehouse_to_branch: "bg-indigo-100 text-indigo-700",
    branch_to_branch: "bg-cyan-100 text-cyan-700",
    confirmed: "bg-teal-100 text-teal-700",
  };
  const cls = map[status] ?? "bg-gray-100 text-gray-600";
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{status.replace(/_/g, " ")}</span>;
}

// ─── Barcode Scan Stock-In dialog ────────────────────────────────────────────

function BarcodeStockInDialog({
  branches,
  onDone,
}: {
  branches: Branch[];
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { canCreate } = usePermission("Stocks");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;

  const [open, setOpen] = useState(false);
  const [scanActive, setScanActive] = useState(false);
  const [product, setProduct] = useState<Product | null>(null);
  const [currentStock, setCurrentStock] = useState<number | null>(null);
  const [branchId, setBranchId] = useState(lockedBranchId ?? "");
  const [quantity, setQuantity] = useState("1");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [saving, setSaving] = useState(false);
  const bufRef = useRef("");
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load current stock for selected branch when product/branch changes
  useEffect(() => {
    if (!product || !branchId) { setCurrentStock(null); return; }
    api.getStock({ branchId })
      .then(sk => setCurrentStock(sk?.find(s => s.productId === product.id)?.quantity ?? 0))
      .catch(() => setCurrentStock(null));
  }, [product?.id, branchId]);

  // Global barcode scanner listener — active only when scanActive = true
  useEffect(() => {
    if (!scanActive) return;

    function onKey(e: KeyboardEvent) {
      // Ignore if user is typing in an input inside the dialog
      const tag = (e.target as HTMLElement).tagName;
      if (open && (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT")) return;

      if (e.key === "Enter") {
        const trimmed = bufRef.current.trim();
        bufRef.current = "";
        if (timerRef.current) clearTimeout(timerRef.current);
        if (!trimmed) return;

        const looksLikeBarcode = /^\d{6,}$/.test(trimmed);
        if (!looksLikeBarcode) return;

        setScanActive(false);
        api.getProductByBarcode(trimmed)
          .then(p => {
            setProduct(p);
            setBranchId(lockedBranchId ?? branches[0]?.id ?? "");
            setQuantity("1");
            setPurchaseCost(p.costPrice != null ? String(p.costPrice) : "");
            setOpen(true);
          })
          .catch(() => {
            toast.error(`Barcode "${trimmed}" not found`, {
              description: "This product is not in inventory. Add it first via Inventory → Add Product.",
              duration: 4000,
            });
            setScanActive(false);
          });
      } else if (e.key.length === 1) {
        bufRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => { bufRef.current = ""; }, 100);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [scanActive, open, branches, lockedBranchId]);

  function handleClose() {
    setOpen(false);
    setProduct(null);
    setCurrentStock(null);
    setQuantity("1");
    setPurchaseCost("");
  }

  async function handleSave() {
    if (!product || !branchId || !quantity) { toast.error("Branch and quantity are required"); return; }
    setSaving(true);
    try {
      await api.receiveBatch({
        productId: product.id,
        branchId,
        quantity: Number(quantity),
        purchaseCost: purchaseCost ? Number(purchaseCost) : undefined,
      } as Parameters<typeof api.receiveBatch>[0]);
      toast.success(`Stock updated — ${product.name} +${quantity} units`);
      handleClose();
      onDone();
    } catch {
      toast.error("Failed to add stock");
    } finally {
      setSaving(false);
    }
  }

  if (!canCreate) return null;

  return (
    <>
      <Button
        size="sm"
        variant={scanActive ? "default" : "outline"}
        className={`gap-1.5 ${scanActive ? "gradient-primary text-primary-foreground border-0 shadow-glow animate-pulse" : ""}`}
        onClick={() => {
          if (scanActive) { setScanActive(false); return; }
          // Ensure products don't need separate load — we use the API directly per scan
          setScanActive(true);
          toast.info("Scanner ready — scan a product barcode", { duration: 3000 });
        }}
      >
        <ScanLine className="h-4 w-4" /> {scanActive ? "Scanning…" : "Scan Item"}
      </Button>

      <Dialog open={open} onOpenChange={o => { if (!o) handleClose(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScanLine className="h-5 w-5 text-primary" /> Quick Stock-In
            </DialogTitle>
          </DialogHeader>

          {product && (
            <div className="space-y-3 py-1">
              {/* Product summary */}
              <div className="rounded-lg bg-muted/50 p-3 space-y-0.5">
                <div className="flex items-center gap-3 mb-1">
                  {product.imageUrl ? (
                    <div className="h-12 w-12 rounded-md border border-border/60 bg-background overflow-hidden shrink-0">
                      <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-12 w-12 rounded-md border border-dashed border-border/60 bg-muted/30 flex flex-col items-center justify-center gap-0.5 text-muted-foreground shrink-0">
                      <ImageOff className="h-3.5 w-3.5" />
                      <span className="text-[7px] leading-none">No image</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-sm truncate">{product.name}</p>
                    <p className="text-xs text-muted-foreground font-mono">{product.barcode} · SKU {product.sku}</p>
                  </div>
                </div>
                {currentStock !== null && (
                  <p className="text-xs text-muted-foreground">
                    Current stock: <span className="font-semibold text-foreground">{currentStock} units</span>
                    {lockedBranchId && branches.find(b => b.id === lockedBranchId) && (
                      <> at {branches.find(b => b.id === lockedBranchId)!.name}</>
                    )}
                  </p>
                )}
              </div>

              {/* Branch (only for admins) */}
              {!lockedBranchId && (
                <div>
                  <Label>Branch *</Label>
                  <Select value={branchId} onValueChange={setBranchId}>
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select branch" />
                    </SelectTrigger>
                    <SelectContent>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Qty + cost side by side */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Quantity to Add *</Label>
                  <Input
                    type="number"
                    min="1"
                    className="h-9 text-lg font-semibold"
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter") handleSave(); }}
                  />
                </div>
                <div>
                  <Label>Purchase Cost (SAR)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    className="h-9"
                    value={purchaseCost}
                    onChange={e => setPurchaseCost(e.target.value)}
                    placeholder={product.costPrice != null ? String(product.costPrice) : "0.00"}
                  />
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={saving || !product || !branchId || !quantity}
              className="gradient-primary text-primary-foreground border-0"
            >
              {saving ? "Adding…" : `Add ${quantity || 0} Units`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── GRN Receive dialog ──────────────────────────────────────────────────────

function GrnReceiveDialog({ po, onDone }: { po: PurchaseOrder; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  function initQty() {
    const init: Record<string, string> = {};
    (po.items ?? []).forEach(it => { init[it.productId] = String(it.orderedQuantity - it.receivedQuantity); });
    setQuantities(init);
  }

  async function handleSave() {
    setSaving(true);
    try {
      const items = Object.entries(quantities)
        .filter(([, q]) => Number(q) > 0)
        .map(([productId, q]) => ({ productId, quantity: Number(q) }));
      if (!items.length) { toast.error("No quantities entered"); setSaving(false); return; }
      await api.receivePurchaseOrder(po.id, items);
      toast.success(`GRN recorded for ${po.poNumber}`);
      setOpen(false);
      onDone();
    } catch { toast.error("Failed to record GRN"); }
    finally { setSaving(false); }
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { initQty(); setOpen(true); }}>Receive</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Receive PO — {po.poNumber}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground mb-2">Enter quantities received for each item.</p>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {(po.items ?? []).map(it => (
              <div key={it.productId} className="flex items-center gap-3">
                <span className="flex-1 text-sm">{it.product?.name ?? it.productId}</span>
                <span className="text-xs text-muted-foreground">Ordered: {it.orderedQuantity} / Rcvd: {it.receivedQuantity}</span>
                <Input className="w-24" type="number" min="0" max={it.orderedQuantity - it.receivedQuantity}
                  value={quantities[it.productId] ?? ""} onChange={e => setQuantities(q => ({ ...q, [it.productId]: e.target.value }))} />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Confirm Receive"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}


// ─── Wastage dialog ───────────────────────────────────────────────────────────

// The wastage write-off types (FRD §2.3). Every one routes through the approval gate: stock isn't
// deducted until an approver signs off. UI labels are grocery-friendly; the stored adjustment_type
// is the value on the right ("Spoilage" is the existing "waste" type under the hood).
const WASTAGE_TYPES = ["waste", "damage", "expired", "theft", "other"] as const;
const WASTAGE_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "damage", label: "Damage" },
  { value: "waste", label: "Spoilage" },
  { value: "expired", label: "Expired" },
  { value: "theft", label: "Theft / Loss" },
  { value: "other", label: "Other" },
];
const wastageTypeLabel = (t: string) => WASTAGE_TYPE_OPTIONS.find(o => o.value === t)?.label ?? t;

function WastageDialog({ branches, products, onDone }: { branches: Branch[]; products: Product[]; onDone: () => void }) {
  const { user } = useAuth();
  const { canCreate } = usePermission("Stocks");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ productId: "", branchId: "", batchId: "", quantity: "", reason: "", type: "damage" });
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v, ...(k === "productId" || k === "branchId" ? { batchId: "" } : {}) })); }

  useEffect(() => {
    if (!form.productId || !form.branchId) { setBatches([]); return; }
    api.getBatches({ productId: form.productId, branchId: form.branchId }).then(setBatches).catch(() => setBatches([]));
  }, [form.productId, form.branchId]);
  const eligibleBatches = batches.filter(b => b.status !== "expired").sort((a, b) => (a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity) - (b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity));

  async function handleSave() {
    if (!form.productId || !form.branchId || !form.quantity) { toast.error("Product, branch and quantity are required"); return; }
    setSaving(true);
    try {
      await api.adjustInventory({ productId: form.productId, branchId: form.branchId, quantity: Number(form.quantity), adjustmentType: form.type, reason: form.reason || undefined, adjustedBy: user?.id, batchId: form.batchId || undefined });
      toast.success("Wastage recorded — pending approval before stock is updated");
      const productName = products.find(p => p.id === form.productId)?.name ?? "item";
      api.notify("Wastage / Spoilage", "Wastage Awaiting Approval", "Wastage Awaiting Approval",
        `${wastageTypeLabel(form.type)} write-off recorded for ${productName} — needs approval`,
        { entityType: "Product", entityId: form.productId, branchId: form.branchId });
      setOpen(false);
      setForm({ productId: "", branchId: "", batchId: "", quantity: "", reason: "", type: "damage" });
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to record wastage"); }
    finally { setSaving(false); }
  }

  return (
    <>
      {canCreate && (
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Record Wastage
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Record Wastage / Damage</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={v => set("productId", v)}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Wastage type *</Label>
              <Select value={form.type} onValueChange={v => set("type", v)}>
                <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                <SelectContent>{WASTAGE_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Branch *</Label>
              <Select value={form.branchId} onValueChange={v => set("branchId", v)}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Quantity *</Label>
              <Input type="number" min="1" value={form.quantity} onChange={e => set("quantity", e.target.value)} placeholder="0" />
            </div>
            <div className="col-span-2">
              <Label>Batch (optional)</Label>
              <Select value={form.batchId || "none"} onValueChange={v => set("batchId", v === "none" ? "" : v)} disabled={!form.productId || !form.branchId}>
                <SelectTrigger><SelectValue placeholder="No specific batch" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific batch</SelectItem>
                  {eligibleBatches.map(b => (
                    <SelectItem key={b.id} value={b.id} title={`${b.batchNumber} — ${b.remainingQuantity}/${b.quantity} — ${b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : "no expiry"}`}>
                      {b.batchNumber} — {b.remainingQuantity}/{b.quantity} — {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : "no expiry"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Reason / Notes</Label>
              <Textarea rows={2} value={form.reason} onChange={e => set("reason", e.target.value)} placeholder="e.g. expired, damaged in transit…" />
            </div>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            This write-off is recorded as <span className="font-medium">Pending Approval</span> and does not reduce stock until an approver signs it off.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Stocking Review (Stock Filters: physical count / live reconciliation) ────
// Self-contained tab: snapshots system quantity per product at start, lets a manager scan/enter
// counted quantities, then on completion reconciles any variance through the same
// InventoryAdjustment pipeline the Stock-Out/Wastage tabs already write to.
function StockingReviewTab({ branches }: { branches: Branch[] }) {
  const { user } = useAuth();
  const { canCreate, canEdit } = usePermission("Stocks");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;

  const [sessions, setSessions] = useState<StockCount[]>([]);
  const [active, setActive] = useState<StockCount | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  const [startOpen, setStartOpen] = useState(false);
  const [startBranch, setStartBranch] = useState(lockedBranchId ?? "");
  const [startCategory, setStartCategory] = useState("all");
  // Why this count is being run. Required — the manager must consciously pick one of the three
  // intents (no silent default), so the Stock Reconciliation report's Count Type filter always
  // gets real data. "Unspecified" is not an option here; it only ever labels legacy pre-column
  // sessions in the report.
  const [startCountType, setStartCountType] = useState("");
  const [startNotes, setStartNotes] = useState("");
  const [starting, setStarting] = useState(false);

  const [scanQuery, setScanQuery] = useState("");
  const [countInputs, setCountInputs] = useState<Record<string, string>>({});
  const [completing, setCompleting] = useState(false);

  const load = () => {
    setLoading(true);
    api.getStockCounts({ branchId: lockedBranchId ?? undefined }).then(setSessions).catch(() => {}).finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    api.getProducts().then(setProducts).catch(() => {});
    api.getCategories().then(setCategories).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const openSession = (id: string) => {
    api.getStockCount(id).then(s => {
      setActive(s);
      setCountInputs(Object.fromEntries((s.items ?? []).map(i => [i.productId, i.countedQuantity != null ? String(i.countedQuantity) : ""])));
    }).catch(() => toast.error("Failed to load count session"));
  };

  const handleStart = async () => {
    if (!startBranch) { toast.error("Select a branch"); return; }
    if (!startCountType) { toast.error("Select a count type"); return; }
    setStarting(true);
    try {
      const session = await api.startStockCount({
        branchId: startBranch, categoryId: startCategory !== "all" ? startCategory : undefined,
        startedBy: user?.id, notes: startNotes || undefined, countType: startCountType,
      });
      toast.success(`Count session started — ${session.items?.length ?? 0} SKUs snapshotted`);
      setStartOpen(false); setStartNotes(""); setStartCategory("all"); setStartCountType("");
      load();
      openSession(session.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to start count");
    } finally {
      setStarting(false);
    }
  };

  const saveCount = async (productId: string, raw: string) => {
    if (!active || raw.trim() === "") return;
    const qty = Number(raw);
    if (Number.isNaN(qty) || qty < 0) { toast.error("Enter a valid quantity"); return; }
    try {
      await api.recordStockCount(active.id, { productId, countedQuantity: qty });
      openSession(active.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save count");
    }
  };

  // Barcode/name search: jump to (or add) a line for the scanned product
  const handleScan = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || !active) return;
    const q = scanQuery.trim().toLowerCase();
    if (!q) return;
    const match = products.find(p => p.barcode?.toLowerCase() === q || p.sku.toLowerCase() === q)
      ?? products.find(p => p.name.toLowerCase().includes(q));
    if (!match) { toast.error(`No product matches "${scanQuery}"`); return; }
    setScanQuery("");
    const existing = active.items?.find(i => i.productId === match.id);
    const current = existing?.countedQuantity ?? 0;
    const next = current + 1;
    setCountInputs(ci => ({ ...ci, [match.id]: String(next) }));
    saveCount(match.id, String(next));
    if (!existing) toast.info(`${match.name} added to count (not in original snapshot)`);
  };

  const handleComplete = async () => {
    if (!active) return;
    const counted = (active.items ?? []).filter(i => i.countedQuantity != null).length;
    const total = active.items?.length ?? 0;
    if (counted < total && !confirm(`${total - counted} item(s) haven't been counted yet and will be left unchanged. Complete anyway?`)) return;
    setCompleting(true);
    try {
      const done = await api.completeStockCount(active.id, user?.id);
      toast.success("Stock count completed — variances reconciled");
      setActive(done);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to complete count");
    } finally {
      setCompleting(false);
    }
  };

  const handleCancel = async () => {
    if (!active || !confirm("Cancel this count session? No adjustments will be applied.")) return;
    try {
      await api.cancelStockCount(active.id);
      toast.success("Count session cancelled");
      setActive(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to cancel count");
    }
  };

  const items = active?.items ?? [];
  const countedCount = items.filter(i => i.countedQuantity != null).length;
  const varianceCount = items.filter(i => i.variance != null && i.variance !== 0).length;

  if (active) {
    const isDraft = active.status === "draft";
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <Button variant="ghost" size="sm" className="h-7 text-xs -ml-2 mb-1" onClick={() => setActive(null)}>← Back to sessions</Button>
            <div className="flex items-center gap-2">
              <h3 className="font-semibold">{active.branch?.name ?? "Count Session"}</h3>
              <StBadge status={active.status} />
              {active.category && <span className="text-xs text-muted-foreground">· {active.category.name} only</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              Started {fmtDate(active.startedAt)} {fmtTime(active.startedAt)} · {countedCount}/{items.length} counted · {varianceCount} with variance
            </p>
          </div>
          {isDraft && (canEdit) && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" className="gap-1.5" onClick={handleCancel}>
                <X className="h-3.5 w-3.5" /> Cancel Session
              </Button>
              <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0" onClick={handleComplete} disabled={completing}>
                <CheckCircle2 className="h-3.5 w-3.5" /> {completing ? "Completing…" : "Complete & Reconcile"}
              </Button>
            </div>
          )}
        </div>

        {isDraft && canEdit && (
          <Card className="p-3 border-border/60">
            <Label className="text-xs text-muted-foreground mb-1.5 block">Scan barcode or type SKU/name, then Enter — adds 1 unit to the count</Label>
            <div className="relative">
              <ScanLine className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Scan or search…" value={scanQuery} onChange={e => setScanQuery(e.target.value)} onKeyDown={handleScan} />
            </div>
          </Card>
        )}

        <Card className="overflow-hidden border-border/60">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left">
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Product</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">SKU</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">System Qty</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Counted Qty</th>
                  <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider text-right">Variance</th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => {
                  const variance = item.variance ?? null;
                  return (
                    <tr key={item.id} className="border-b border-border/40 last:border-0">
                      <td className="px-4 py-2 font-medium">{item.product?.name ?? "Unknown"}</td>
                      <td className="px-4 py-2 text-muted-foreground text-xs">{item.product?.sku}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{item.systemQuantity}</td>
                      <td className="px-4 py-2 text-right">
                        {isDraft && canEdit ? (
                          <Input
                            type="number" className="h-8 w-24 ml-auto text-right"
                            value={countInputs[item.productId] ?? ""}
                            onChange={e => setCountInputs(ci => ({ ...ci, [item.productId]: e.target.value }))}
                            onBlur={e => saveCount(item.productId, e.target.value)}
                            placeholder="—"
                          />
                        ) : (
                          <span className="tabular-nums">{item.countedQuantity ?? "—"}</span>
                        )}
                      </td>
                      <td className={`px-4 py-2 text-right font-semibold tabular-nums ${variance == null ? "text-muted-foreground" : variance === 0 ? "text-success" : variance > 0 ? "text-blue-600" : "text-destructive"}`}>
                        {variance == null ? "—" : variance > 0 ? `+${variance}` : variance}
                      </td>
                    </tr>
                  );
                })}
                {items.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-10 text-muted-foreground text-sm">No items in this session.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-sm text-muted-foreground">Physical stock counts — snapshot system quantity, scan what's actually on the shelf, reconcile the variance.</p>
        {canCreate && (
          <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0" onClick={() => setStartOpen(true)}>
            <PlayCircle className="h-3.5 w-3.5" /> Start New Count
          </Button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-10 text-sm text-muted-foreground">Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60">
          <div className="divide-y divide-border/40">
            {sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 cursor-pointer" onClick={() => openSession(s.id)}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{s.branch?.name ?? "—"}</span>
                    <StBadge status={s.status} />
                    {s.category && <span className="text-xs text-muted-foreground">· {s.category.name}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Started {fmtDate(s.startedAt)} {fmtTime(s.startedAt)}
                    {s.completedAt && ` · Completed ${fmtDate(s.completedAt)} ${fmtTime(s.completedAt)}`}
                  </p>
                </div>
                <RotateCcw className="h-4 w-4 text-muted-foreground" />
              </div>
            ))}
            {sessions.length === 0 && (
              <div className="text-center py-10 text-sm text-muted-foreground">No stock count sessions yet.</div>
            )}
          </div>
        </Card>
      )}

      <Dialog open={startOpen} onOpenChange={setStartOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Start Stock Count</DialogTitle></DialogHeader>
          <div className="space-y-3">
            {!lockedBranchId && (
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Branch *</Label>
                <Select value={startBranch} onValueChange={setStartBranch}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div>
              {/* Recorded so the Stock Reconciliation report can tell a routine shelf check apart
                  from a compliance audit — the FRD asks for those as separate filters. Required so
                  every new session carries an intent (no "Unspecified" rows going forward). */}
              <Label className="text-xs text-muted-foreground mb-1 block">Count type *</Label>
              <Select value={startCountType} onValueChange={setStartCountType}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select count type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="review">
                    <span className="flex flex-col items-start"><span>Stock Review</span><span className="text-xs text-muted-foreground">Routine shelf check</span></span>
                  </SelectItem>
                  <SelectItem value="audit">
                    <span className="flex flex-col items-start"><span>Stock Audit</span><span className="text-xs text-muted-foreground">Independent / compliance count</span></span>
                  </SelectItem>
                  <SelectItem value="reconciliation">
                    <span className="flex flex-col items-start"><span>Inventory Reconciliation</span><span className="text-xs text-muted-foreground">Correcting a known discrepancy</span></span>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Category (optional — leave blank for full count)</Label>
              <Select value={startCategory} onValueChange={setStartCategory}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">Notes</Label>
              <Textarea rows={2} value={startNotes} onChange={e => setStartNotes(e.target.value)} placeholder="e.g. Monthly cycle count — Beverages aisle" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStartOpen(false)}>Cancel</Button>
            <Button onClick={handleStart} disabled={starting}>{starting ? "Starting…" : "Start Count"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

function Stocks() {
  const { user } = useAuth();
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;

  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);

  const [stock, setStock] = useState<InventoryStock[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [reductions, setReductions] = useState<InventoryAdjustment[]>([]);
  const [damages, setDamages] = useState<InventoryAdjustment[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [deliveries, setDeliveries] = useState<StockTransfer[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);

  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [expiringSoonCount, setExpiringSoonCount] = useState(0);

  const [tab, setTab] = useState("overview");
  const [search, setSearch] = useState("");
  const [overviewBranch, setOverviewBranch] = useState(lockedBranchId ?? "all");
  const [categoryFilter, setCategoryFilter] = useState("all"); // stores category ID or "all"
  const [allCategoryOptions, setAllCategoryOptions] = useState<{ id: string; name: string }[]>([]);

  // Sub-tab filters — passed to BE when tab is active
  const [siBranch, setSiBranch] = useState(lockedBranchId ?? "all");
  const [siStatus, setSiStatus] = useState("all");
  const [grnStatus, setGrnStatus] = useState("all");
  const [dlStatus, setDlStatus] = useState("all");
  const [mvBranch, setMvBranch] = useState(lockedBranchId ?? "all");
  const [mvType, setMvType] = useState("all");

  // Per-tab date filters (FE-side since BE doesn't expose date range params)
  const [grnDateFrom, setGrnDateFrom] = useState("");
  const [grnDateTo, setGrnDateTo] = useState("");
  const [dlDateFrom, setDlDateFrom] = useState("");
  const [dlDateTo, setDlDateTo] = useState("");

  // ── Per-section fetch functions ──────────────────────────────────────────────

  // Fetchers keep the previously loaded data and raise the error banner on failure —
  // `.catch(() => [])` used to zero the tiles/list silently as if loaded (86eyag3ny).
  async function fetchOverview() {
    setLoading(true);
    const sk = await api.getStock({
      branchId: overviewBranch !== "all" ? overviewBranch : undefined,
      categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
    }).catch(() => null);
    if (sk) {
      setStock(sk);
      // Rebuild category options from unfiltered load (when no category is active)
      if (categoryFilter === "all") {
        const seen = new Map<string, string>();
        sk.forEach(s => {
          const c = s.product?.category;
          if (c?.id && c.name && !seen.has(c.id)) seen.set(c.id, c.name);
        });
        setAllCategoryOptions(Array.from(seen.entries()).map(([id, name]) => ({ id, name })));
      }
    } else setLoadError(true);
    setLoading(false);
  }

  async function fetchBatches() {
    setTabLoading(true);
    const bt = await api.getBatches({
      branchId: siBranch !== "all" ? siBranch : undefined,
      status: siStatus !== "all" ? siStatus : undefined,
    }).catch(() => null);
    if (bt) setBatches(bt); else setLoadError(true);
    setTabLoading(false);
  }

  async function fetchReductions() {
    setTabLoading(true);
    const rd = await api.getAdjustments({ adjustmentType: "reduction" }).catch(() => null);
    if (rd) setReductions(rd); else setLoadError(true);
    setTabLoading(false);
  }

  async function fetchDamages() {
    setTabLoading(true);
    // Wastage now spans five types (damage/spoilage/expired/theft/other), so fetch all adjustments
    // and keep just the write-off set rather than the single-type call this tab used before.
    const dm = await api.getAdjustments().catch(() => null);
    if (dm) setDamages(dm.filter(a => (WASTAGE_TYPES as readonly string[]).includes(a.adjustmentType))); else setLoadError(true);
    setTabLoading(false);
  }

  async function fetchPOs() {
    setTabLoading(true);
    const po = await api.getPurchaseOrders({
      status: grnStatus !== "all" ? grnStatus : undefined,
    }).catch(() => null);
    if (po) setPurchaseOrders(po); else setLoadError(true);
    setTabLoading(false);
  }

  async function fetchDeliveries() {
    setTabLoading(true);
    const dl = await api.getStockTransfers({
      transferType: "warehouse_to_branch",
      status: dlStatus !== "all" ? dlStatus : undefined,
    }).catch(() => null);
    if (dl) setDeliveries(dl); else setLoadError(true);
    setTabLoading(false);
  }

  async function fetchMovement() {
    setTabLoading(true);
    const mv = await api.getStockMovements({
      branchId: mvBranch !== "all" ? mvBranch : undefined,
      movementType: mvType !== "all" ? mvType : undefined,
      limit: 500,
    }).catch(() => null);
    if (mv) setMovements(mv); else setLoadError(true);
    setTabLoading(false);
  }

  function refreshCurrentTab() {
    fetchOverview(); // always refresh overview metrics
    if (tab === "stock-in") fetchBatches();
    else if (tab === "stock-out") fetchReductions();
    else if (tab === "grn") fetchPOs();
    else if (tab === "delivery") fetchDeliveries();
    else if (tab === "wastage") fetchDamages();
    else if (tab === "movement") fetchMovement();
  }

  // Mount: only fetch branches (for filter dropdowns) + expiring count metric
  useEffect(() => {
    api.getBranches().then(br => setBranches(br ?? [])).catch(() => {});
    api.getExpiringBatches(undefined, 30).then(bt => setExpiringSoonCount(bt?.length ?? 0)).catch(() => {});
  }, []);

  // Sync branch filters when user loads (auth hydration after mount)
  useEffect(() => {
    if (lockedBranchId) {
      setOverviewBranch(lockedBranchId);
      setSiBranch(lockedBranchId);
    }
  }, [lockedBranchId]);

  // Lazy-load products/suppliers/warehouses only when a form dialog is first opened
  const metadataLoaded = products.length > 0 || suppliers.length > 0 || warehouses.length > 0;
  function ensureDialogMetadata() {
    if (metadataLoaded) return;
    Promise.allSettled([api.getProducts(), api.getSuppliers(), api.getWarehouses()])
      .then(([pr, su, wh]) => {
        if (pr.status === "fulfilled") setProducts(pr.value ?? []);
        if (su.status === "fulfilled") setSuppliers(su.value ?? []);
        if (wh.status === "fulfilled") setWarehouses(wh.value ?? []);
      });
  }

  // Unified data-loading effect: re-runs on tab change OR relevant filter change.
  // Each branch only fetches data for the active tab, so irrelevant filter
  // changes never cause cross-tab API calls.
  useEffect(() => {
    if (tab === "overview") fetchOverview();
    else if (tab === "stock-in") fetchBatches();
    else if (tab === "stock-out") fetchReductions();
    else if (tab === "grn") fetchPOs();
    else if (tab === "delivery") fetchDeliveries();
    else if (tab === "wastage") fetchDamages();
    else if (tab === "movement") fetchMovement();
  }, [tab, overviewBranch, categoryFilter, siBranch, siStatus, grnStatus, dlStatus, mvBranch, mvType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Metrics (from overview stock + pre-fetched expiring count)
  const totalSKUs = stock.length;
  const totalUnits = stock.reduce((s, x) => s + x.quantity, 0);
  const lowStockCount = stock.filter(x => x.quantity <= x.reorderLevel).length;

  const q = search.toLowerCase();
  // Category is already BE-filtered; only search filter applied here
  const filteredStock = stock.filter(s => !q || s.product?.name?.toLowerCase().includes(q));

  // Sub-tabs: data already fetched from BE with status filter; apply date range FE-side only.
  // The batches endpoint orders by ExpiryDate (FEFO, for the expiry-watch views) — this
  // "Stock-In Records" table is a log of receipts, so re-sort newest-received-first here.
  const filteredBatches = [...batches].sort((a, b) => {
    const ra = a.receivedDate ? new Date(a.receivedDate).getTime() : 0;
    const rb = b.receivedDate ? new Date(b.receivedDate).getTime() : 0;
    return rb - ra;
  });
  const filteredPOs = purchaseOrders.filter(po => {
    const mdf = !grnDateFrom || (!!po.createdAt && po.createdAt >= grnDateFrom);
    const mdt = !grnDateTo || (!!po.createdAt && po.createdAt <= grnDateTo + "T23:59:59");
    return mdf && mdt;
  });
  const filteredDeliveries = deliveries.filter(d => {
    const mdf = !dlDateFrom || (!!d.createdAt && d.createdAt >= dlDateFrom);
    const mdt = !dlDateTo || (!!d.createdAt && d.createdAt <= dlDateTo + "T23:59:59");
    return mdf && mdt;
  });
  return (
    <PageShell
      title="Stocks"
      subtitle="Stock-In · Stock-Out · GRN · Transfers · Wastage · Movement"
      actions={
        <BarcodeStockInDialog branches={branches} onDone={refreshCurrentTab} />
      }
    >
      {loadError && <LoadErrorBanner onRetry={() => { setLoadError(false); refreshCurrentTab(); }} />}
      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <MetricCard label="Total SKUs" value={String(totalSKUs)} icon={Boxes} />
        <MetricCard label="Total Units" value={fmt(totalUnits)} icon={Package} />
        <MetricCard label="Low Stock" value={String(lowStockCount)} icon={AlertTriangle} trend={lowStockCount > 0 ? "down" : undefined} />
        <MetricCard label="Expiring (30d)" value={String(expiringSoonCount)} icon={TrendingUp} />
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-4 flex-wrap h-auto gap-1">
          <TabsTrigger value="overview" className="gap-1.5"><Boxes className="h-3.5 w-3.5" />Overview</TabsTrigger>
          <TabsTrigger value="stock-in" className="gap-1.5"><ArrowDownToLine className="h-3.5 w-3.5" />Stock-In</TabsTrigger>
          <TabsTrigger value="stock-out" className="gap-1.5"><ArrowUpFromLine className="h-3.5 w-3.5" />Stock-Out</TabsTrigger>
          <TabsTrigger value="grn" className="gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" />GRN</TabsTrigger>
          <TabsTrigger value="delivery" className="gap-1.5"><Truck className="h-3.5 w-3.5" />Store Delivery</TabsTrigger>
          <TabsTrigger value="wastage" className="gap-1.5"><Trash2 className="h-3.5 w-3.5" />Wastage</TabsTrigger>
          <TabsTrigger value="movement" className="gap-1.5"><History className="h-3.5 w-3.5" />Movement</TabsTrigger>
          <TabsTrigger value="stocking-review" className="gap-1.5"><ClipboardCheck className="h-3.5 w-3.5" />Stocking Review</TabsTrigger>
          <TabsTrigger value="reports" className="gap-1.5"><FileBarChart className="h-3.5 w-3.5" />Reports</TabsTrigger>
        </TabsList>

        {/* ── Overview ── */}
        <TabsContent value="overview">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2 justify-between flex-wrap">
              <CardTitle className="text-base">Stock Overview</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {!lockedBranchId && (
                  <Select value={overviewBranch} onValueChange={setOverviewBranch}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="All Branches" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="h-8 w-40"><SelectValue placeholder="All Categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {allCategoryOptions.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input className="w-52 h-8" placeholder="Search product…" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Product</th>
                      <th className="px-4 py-2 text-left">Branch</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Reserved</th>
                      <th className="px-4 py-2 text-right">Reorder Lvl</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Last Updated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading stock…</td></tr>
                    ) : filteredStock.length === 0 ? (
                      <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No stock records found</td></tr>
                    ) : filteredStock.map(s => {
                      const isLow = s.quantity <= s.reorderLevel;
                      const branch = branches.find(b => b.id === s.branchId);
                      return (
                        <tr key={s.id} className="border-t hover:bg-muted/20">
                          <td className="px-4 py-2.5 font-medium">{s.product?.name ?? "—"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{branch?.name ?? s.branchId}</td>
                          <td className="px-4 py-2.5 text-right font-semibold">{fmt(s.quantity)}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{fmt(s.reservedQuantity ?? 0)}</td>
                          <td className="px-4 py-2.5 text-right text-muted-foreground">{s.reorderLevel}</td>
                          <td className="px-4 py-2.5">
                            {isLow ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700"><AlertTriangle className="h-3 w-3" />Low</span>
                              : <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700"><CheckCircle2 className="h-3 w-3 mr-0.5" />OK</span>}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground text-xs">{fmtDate(s.lastUpdated)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Stock-In ── */}
        <TabsContent value="stock-in">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Stock-In Records</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {!lockedBranchId && (
                  <Select value={siBranch} onValueChange={setSiBranch}>
                    <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Branch" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Select value={siStatus} onValueChange={setSiStatus}>
                  <SelectTrigger className="h-8 w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="depleted">Depleted</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">Batch #</th>
                      <th className="px-4 py-2 text-left">Product</th>
                      <th className="px-4 py-2 text-left">Branch</th>
                      <th className="px-4 py-2 text-left">Supplier</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-right">Remaining</th>
                      <th className="px-4 py-2 text-right">Cost</th>
                      <th className="px-4 py-2 text-left">Expiry</th>
                      <th className="px-4 py-2 text-left">Received</th>
                      <th className="px-4 py-2 text-left">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabLoading ? (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                    ) : filteredBatches.length === 0 ? (
                      <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No batches found</td></tr>
                    ) : filteredBatches.map(b => (
                      <tr key={b.id} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{b.batchNumber}</td>
                        <td className="px-4 py-2.5 font-medium">{b.product?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground text-xs">{branches.find(br => br.id === b.branchId)?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{b.supplier?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(b.quantity)}</td>
                        <td className="px-4 py-2.5 text-right">{fmt(b.remainingQuantity)}</td>
                        <td className="px-4 py-2.5 text-right">{b.purchaseCost != null ? `${b.purchaseCost.toFixed(2)} SAR` : "—"}</td>
                        <td className="px-4 py-2.5">{b.expiryDate ? <ExpiryCell date={b.expiryDate} /> : "—"}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(b.receivedDate)}</td>
                        <td className="px-4 py-2.5"><StBadge status={b.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Stock-Out ── */}
        <TabsContent value="stock-out">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Stock-Out Records</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <AdjustmentTable rows={reductions} branches={branches} loading={tabLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── GRN ── */}
        <TabsContent value="grn">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Goods Received Notes</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={grnStatus} onValueChange={setGrnStatus}>
                  <SelectTrigger className="h-8 w-40"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="partial_received">Partial</SelectItem>
                    <SelectItem value="fully_received">Fully Received</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" className="h-8 w-36 text-xs" value={grnDateFrom} onChange={e => setGrnDateFrom(e.target.value)} title="From" />
                <Input type="date" className="h-8 w-36 text-xs" value={grnDateTo} onChange={e => setGrnDateTo(e.target.value)} title="To" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="px-4 py-2 text-left">PO #</th>
                      <th className="px-4 py-2 text-left">Supplier</th>
                      <th className="px-4 py-2 text-left">Warehouse / Branch</th>
                      <th className="px-4 py-2 text-right">Total</th>
                      <th className="px-4 py-2 text-left">ETA</th>
                      <th className="px-4 py-2 text-left">Received</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {tabLoading ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                    ) : filteredPOs.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No purchase orders found</td></tr>
                    ) : filteredPOs.map(po => (
                      <tr key={po.id} className="border-t hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-mono text-xs font-semibold">{po.poNumber}</td>
                        <td className="px-4 py-2.5">{po.supplier?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-muted-foreground">{po.warehouse?.name ?? po.branch?.name ?? "—"}</td>
                        <td className="px-4 py-2.5 text-right">{po.totalAmount.toFixed(2)} SAR</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(po.expectedDeliveryDate)}</td>
                        <td className="px-4 py-2.5 text-xs text-muted-foreground">{fmtDate(po.receivedDate)}</td>
                        <td className="px-4 py-2.5"><StBadge status={po.status} /></td>
                        <td className="px-4 py-2.5">
                          {!["fully_received", "cancelled"].includes(po.status) && po.items?.length ? (
                            <GrnReceiveDialog po={po} onDone={refreshCurrentTab} />
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Store Delivery ── */}
        <TabsContent value="delivery">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Store Deliveries</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={dlStatus} onValueChange={setDlStatus}>
                  <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" className="h-8 w-36 text-xs" value={dlDateFrom} onChange={e => setDlDateFrom(e.target.value)} title="From" />
                <Input type="date" className="h-8 w-36 text-xs" value={dlDateTo} onChange={e => setDlDateTo(e.target.value)} title="To" />
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TransferTable rows={filteredDeliveries} loading={tabLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Wastage ── */}
        <TabsContent value="wastage">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Wastage & Damage</CardTitle>
              <div onClick={ensureDialogMetadata}><WastageDialog branches={branches} products={products} onDone={refreshCurrentTab} /></div>
            </CardHeader>
            <CardContent className="p-0">
              <AdjustmentTable rows={damages} branches={branches} loading={tabLoading} onReviewed={refreshCurrentTab} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Movement ── */}
        <TabsContent value="movement">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center gap-2 justify-between flex-wrap">
              <CardTitle className="text-base">Stock Movement Timeline</CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                {!lockedBranchId && (
                  <Select value={mvBranch} onValueChange={setMvBranch}>
                    <SelectTrigger className="h-8 w-40"><SelectValue placeholder="All Branches" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Branches</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                )}
                <Select value={mvType} onValueChange={setMvType}>
                  <SelectTrigger className="h-8 w-52"><SelectValue placeholder="All Movement Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Movement Types</SelectItem>
                    {MOVEMENT_TYPES.map(t => <SelectItem key={t} value={t}>{movementMeta(t).label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs text-muted-foreground uppercase sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left">Date / Time</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Product</th>
                      <th className="px-4 py-2 text-left">Location</th>
                      <th className="px-4 py-2 text-left">Batch #</th>
                      <th className="px-4 py-2 text-right">Qty</th>
                      <th className="px-4 py-2 text-left">Reference</th>
                      <th className="px-4 py-2 text-left">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tabLoading ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                    ) : movements.length === 0 ? (
                      <tr><td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">No movement records found</td></tr>
                    ) : movements.map(mv => {
                      const meta = movementMeta(mv.movementType);
                      const location = mv.branch?.name ?? mv.warehouse?.name ?? "—";
                      const isIncrease = mv.quantity >= 0;
                      return (
                        <tr key={mv.id} className="border-t hover:bg-muted/20">
                          <td className="px-4 py-2.5 text-muted-foreground whitespace-nowrap">
                            <div>{fmtDate(mv.createdAt)}</div>
                            <div className="text-xs">{fmtTime(mv.createdAt)}</div>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${meta.color}`}>{meta.label}</span>
                          </td>
                          <td className="px-4 py-2.5 font-medium">{mv.product?.name ?? "—"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground">{location}</td>
                          <td className="px-4 py-2.5 font-mono text-xs text-muted-foreground">{mv.batch?.batchNumber ?? "—"}</td>
                          <td className={`px-4 py-2.5 text-right font-semibold whitespace-nowrap ${isIncrease ? "text-green-600" : "text-red-600"}`}>
                            {isIncrease ? "+" : ""}{fmt(mv.quantity)}
                          </td>
                          <td className="px-4 py-2.5 text-muted-foreground">{mv.referenceNumber ?? "—"}</td>
                          <td className="px-4 py-2.5 text-muted-foreground max-w-[220px] truncate" title={mv.notes ?? undefined}>{mv.notes ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Stocking Review (Stock Filters: live count / reconciliation) ── */}
        <TabsContent value="stocking-review">
          <StockingReviewTab branches={branches} />
        </TabsContent>

        {/* ── Reports ── */}
        <TabsContent value="reports">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { title: "Stock Valuation Report", desc: "Current stock value by product and branch", icon: <BarChart3 className="h-8 w-8 text-blue-500" /> },
              { title: "Stock Movement Report", desc: "In/out movements over a date range", icon: <History className="h-8 w-8 text-green-500" /> },
              { title: "Low Stock Report", desc: "Products below reorder level", icon: <AlertTriangle className="h-8 w-8 text-yellow-500" /> },
              { title: "Expiry Report", desc: "Batches expiring within 30/60/90 days", icon: <TrendingUp className="h-8 w-8 text-red-500" /> },
              { title: "GRN Summary", desc: "Goods received against purchase orders", icon: <ClipboardCheck className="h-8 w-8 text-purple-500" /> },
              { title: "Wastage Report", desc: "Damage and wastage records by period", icon: <Trash2 className="h-8 w-8 text-red-400" /> },
              { title: "Supplier Return Report", desc: "Returns sent back to suppliers", icon: <Undo2 className="h-8 w-8 text-orange-500" /> },
              { title: "Store Delivery Report", desc: "Warehouse-to-branch transfers", icon: <Truck className="h-8 w-8 text-indigo-500" /> },
              { title: "Stock Count Variance", desc: "Physical count vs system count differences", icon: <Boxes className="h-8 w-8 text-teal-500" /> },
            ].map(r => (
              <Card key={r.title} className="cursor-pointer hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-start gap-4">
                  <div className="mt-0.5">{r.icon}</div>
                  <div>
                    <p className="font-semibold text-sm">{r.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{r.desc}</p>
                    <Button size="sm" variant="outline" className="mt-3 gap-1.5 h-7 text-xs" onClick={() => toast.info("Report export coming soon")}>
                      <Download className="h-3 w-3" /> Export
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </PageShell>
  );
}

// ─── Shared sub-tables ────────────────────────────────────────────────────────

function ExpiryCell({ date }: { date: string }) {
  const diff = (new Date(date).getTime() - Date.now()) / 86400000;
  if (diff < 0) return <span className="text-red-600 text-xs font-medium">Expired</span>;
  if (diff <= 30) return <span className="text-orange-500 text-xs font-medium">{Math.ceil(diff)}d left</span>;
  return <span className="text-xs text-muted-foreground">{new Date(date).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" })}</span>;
}

// FRD §2.3 — the Wastage list doubles as the approval queue. A pending write-off shows a Pending
// badge and (for approvers) Approve / Reject actions; approving is what actually deducts stock, so
// the "Employee Who Created" and "Employee Who Approved" columns and the status live right here
// next to where the wastage was recorded, not buried in a separate report.
function AdjustmentTable({ rows, branches, loading, onReviewed }: { rows: InventoryAdjustment[]; branches: Branch[]; loading: boolean; onReviewed?: () => void }) {
  const { canApprove } = usePermission("Stocks");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejectRow, setRejectRow] = useState<InventoryAdjustment | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  async function approve(row: InventoryAdjustment) {
    setBusyId(row.id);
    try {
      await api.reviewAdjustment(row.id, true);
      toast.success("Write-off approved — stock updated");
      onReviewed?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to approve"); }
    finally { setBusyId(null); }
  }
  async function confirmReject() {
    if (!rejectRow) return;
    if (!rejectReason.trim()) { toast.error("A rejection reason is required"); return; }
    const id = rejectRow.id;
    setBusyId(id);
    try {
      await api.reviewAdjustment(id, false, rejectReason.trim());
      toast.success("Write-off rejected — stock left on hand");
      setRejectRow(null); setRejectReason("");
      onReviewed?.();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to reject"); }
    finally { setBusyId(null); }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Product</th>
            <th className="px-4 py-2 text-left">Branch</th>
            <th className="px-4 py-2 text-right">Qty</th>
            <th className="px-4 py-2 text-left">Type</th>
            <th className="px-4 py-2 text-left">Reason</th>
            <th className="px-4 py-2 text-left">Created By</th>
            <th className="px-4 py-2 text-left">Approved By</th>
            <th className="px-4 py-2 text-left">Status</th>
            <th className="px-4 py-2 text-left">Date</th>
            <th className="px-4 py-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No records found</td></tr>
          ) : rows.map(a => {
            const branch = branches.find(b => b.id === a.branchId);
            const pending = a.approvalStatus === "pending";
            return (
              <tr key={a.id} className="border-t hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{a.product?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{a.branch?.name ?? branch?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">{fmt(a.quantity)}</td>
                <td className="px-4 py-2.5"><StBadge status={a.adjustmentType} /></td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">{a.reason ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.adjustedByUser?.fullName ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{a.approvedByUser?.fullName ?? "—"}</td>
                <td className="px-4 py-2.5">{a.approvalStatus ? <StBadge status={a.approvalStatus} /> : <span className="text-xs text-muted-foreground">—</span>}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" })}</td>
                <td className="px-4 py-2.5 text-right">
                  {pending && canApprove ? (
                    <div className="flex items-center justify-end gap-1.5">
                      <Button size="sm" className="h-7 px-2 text-xs" onClick={() => approve(a)} disabled={busyId === a.id}>Approve</Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => { setRejectRow(a); setRejectReason(""); }} disabled={busyId === a.id}>Reject</Button>
                    </div>
                  ) : pending ? (
                    <span className="text-xs text-muted-foreground">Awaiting approval</span>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <Dialog open={!!rejectRow} onOpenChange={o => { if (!o) { setRejectRow(null); setRejectReason(""); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Reject write-off</DialogTitle></DialogHeader>
          <p className="text-xs text-muted-foreground">Rejecting keeps the stock on hand — this write-off will not reduce inventory.</p>
          <Textarea rows={3} value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Reason for rejection (required)" />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectRow(null); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={busyId === rejectRow?.id}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransferTable({ rows, loading }: { rows: StockTransfer[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
          <tr>
            <th className="px-4 py-2 text-left">Transfer #</th>
            <th className="px-4 py-2 text-left">From</th>
            <th className="px-4 py-2 text-left">To</th>
            <th className="px-4 py-2 text-right">Items</th>
            <th className="px-4 py-2 text-left">Expected</th>
            <th className="px-4 py-2 text-left">Completed</th>
            <th className="px-4 py-2 text-left">Status</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No records found</td></tr>
          ) : rows.map(t => (
            <tr key={t.id} className="border-t hover:bg-muted/20">
              <td className="px-4 py-2.5 font-mono text-xs font-semibold">{t.transferNumber}</td>
              <td className="px-4 py-2.5">{t.sourceWarehouse?.name ?? t.sourceBranch?.name ?? t.sourceSupplier?.name ?? "—"}</td>
              <td className="px-4 py-2.5">{t.destBranch?.name ?? t.destWarehouse?.name ?? t.destSupplier?.name ?? "—"}</td>
              <td className="px-4 py-2.5 text-right">{t.items?.length ?? 0}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{t.expectedDate ? new Date(t.expectedDate).toLocaleDateString("en-SA", { day: "2-digit", month: "short" }) : "—"}</td>
              <td className="px-4 py-2.5 text-xs text-muted-foreground">{t.completedDate ? new Date(t.completedDate).toLocaleDateString("en-SA", { day: "2-digit", month: "short" }) : "—"}</td>
              <td className="px-4 py-2.5"><StBadge status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
