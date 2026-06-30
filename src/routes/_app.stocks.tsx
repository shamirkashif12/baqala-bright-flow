import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/app-topbar";
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
  TrendingUp, BarChart3, Download, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  api, Branch, Product, Supplier, Warehouse,
  InventoryStock, InventoryBatch, InventoryAdjustment,
  PurchaseOrder, StockTransfer,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";

export const Route = createFileRoute("/_app/stocks")({ component: Stocks });

// ─── helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) { return n.toLocaleString("en-SA", { minimumFractionDigits: 0 }); }
function fmtDate(d?: string) { if (!d) return "—"; return new Date(d).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" }); }
function fmtTime(d?: string) { if (!d) return "—"; return new Date(d).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" }); }

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
    draft: "bg-gray-100 text-gray-600",
    expired: "bg-red-100 text-red-700",
    damage: "bg-red-100 text-red-700",
    reduction: "bg-orange-100 text-orange-700",
    addition: "bg-green-100 text-green-700",
    transfer_in: "bg-blue-100 text-blue-700",
    return_to_supplier: "bg-purple-100 text-purple-700",
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
                <p className="font-semibold text-sm">{product.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{product.barcode} · SKU {product.sku}</p>
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

// ─── Stock-In dialog ─────────────────────────────────────────────────────────

function StockInDialog({ branches, products, suppliers, onDone }: { branches: Branch[]; products: Product[]; suppliers: Supplier[]; onDone: () => void }) {
  const { canCreate } = usePermission("Stocks");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ productId: "", branchId: "", supplierId: "", quantity: "", purchaseCost: "", expiryDate: "", batchNumber: "", notes: "" });

  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.productId || !form.branchId || !form.quantity) { toast.error("Product, branch and quantity are required"); return; }
    setSaving(true);
    try {
      await api.receiveBatch({
        productId: form.productId, branchId: form.branchId,
        supplierId: form.supplierId || undefined,
        quantity: Number(form.quantity),
        purchaseCost: form.purchaseCost ? Number(form.purchaseCost) : undefined,
        expiryDate: form.expiryDate || undefined,
        batchNumber: form.batchNumber || undefined,
        notes: form.notes || undefined,
      } as Parameters<typeof api.receiveBatch>[0]);
      toast.success("Stock-In recorded");
      setOpen(false);
      setForm({ productId: "", branchId: "", supplierId: "", quantity: "", purchaseCost: "", expiryDate: "", batchNumber: "", notes: "" });
      onDone();
    } catch { toast.error("Failed to record stock-in"); }
    finally { setSaving(false); }
  }

  return (
    <>
      {canCreate && (
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add Stock-In
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add Stock-In</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={v => set("productId", v)}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
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
              <Label>Supplier</Label>
              <Select value={form.supplierId} onValueChange={v => set("supplierId", v)}>
                <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
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
              <Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Stock-Out dialog ────────────────────────────────────────────────────────

function StockOutDialog({ branches, products, onDone }: { branches: Branch[]; products: Product[]; onDone: () => void }) {
  const { user } = useAuth();
  const { canCreate } = usePermission("Stocks");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ productId: "", branchId: "", quantity: "", reason: "" });
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.productId || !form.branchId || !form.quantity) { toast.error("Product, branch and quantity are required"); return; }
    setSaving(true);
    try {
      await api.adjustInventory({ productId: form.productId, branchId: form.branchId, quantity: Number(form.quantity), adjustmentType: "reduction", reason: form.reason || undefined, adjustedBy: user?.id });
      toast.success("Stock-Out recorded");
      setOpen(false);
      setForm({ productId: "", branchId: "", quantity: "", reason: "" });
      onDone();
    } catch { toast.error("Failed to record stock-out"); }
    finally { setSaving(false); }
  }

  return (
    <>
      {canCreate && (
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Add Stock-Out
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Stock-Out</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="col-span-2">
              <Label>Product *</Label>
              <Select value={form.productId} onValueChange={v => set("productId", v)}>
                <SelectTrigger><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
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
              <Label>Reason</Label>
              <Textarea rows={2} value={form.reason} onChange={e => set("reason", e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
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

// ─── Store Delivery dialog ────────────────────────────────────────────────────

function StoreDeliveryDialog({ branches, warehouses, products, onDone }: { branches: Branch[]; warehouses: Warehouse[]; products: Product[]; onDone: () => void }) {
  const { user } = useAuth();
  const { canCreate } = usePermission("Stocks");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ sourceWarehouseId: "", destBranchId: "", notes: "", expectedDate: "" });
  const [items, setItems] = useState([{ productId: "", quantity: "" }]);
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.sourceWarehouseId || !form.destBranchId) { toast.error("Source warehouse and destination branch are required"); return; }
    const validItems = items.filter(it => it.productId && Number(it.quantity) > 0);
    if (!validItems.length) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      await api.createStockTransfer({
        transferType: "warehouse_to_branch",
        sourceWarehouseId: form.sourceWarehouseId,
        destBranchId: form.destBranchId,
        createdBy: user?.id ?? "",
        status: "pending",
        notes: form.notes || undefined,
        expectedDate: form.expectedDate || undefined,
        items: validItems.map(it => ({ productId: it.productId, requestedQuantity: Number(it.quantity) })) as StockTransfer["items"],
      });
      toast.success("Store delivery created");
      setOpen(false);
      setForm({ sourceWarehouseId: "", destBranchId: "", notes: "", expectedDate: "" });
      setItems([{ productId: "", quantity: "" }]);
      onDone();
    } catch { toast.error("Failed to create delivery"); }
    finally { setSaving(false); }
  }

  return (
    <>
      {canCreate && (
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> New Delivery
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Store Delivery</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <Label>From Warehouse *</Label>
              <Select value={form.sourceWarehouseId} onValueChange={v => set("sourceWarehouseId", v)}>
                <SelectTrigger><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>To Branch *</Label>
              <Select value={form.destBranchId} onValueChange={v => set("destBranchId", v)}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Expected Date</Label>
              <Input type="date" value={form.expectedDate} onChange={e => set("expectedDate", e.target.value)} />
            </div>
            <div>
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => set("notes", e.target.value)} placeholder="Optional" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Items</Label>
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <Select value={it.productId} onValueChange={v => setItems(arr => arr.map((x, j) => j === i ? { ...x, productId: v } : x))}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="w-24" type="number" min="1" placeholder="Qty" value={it.quantity}
                  onChange={e => setItems(arr => arr.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                {items.length > 1 && <Button size="sm" variant="ghost" onClick={() => setItems(arr => arr.filter((_, j) => j !== i))}>×</Button>}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setItems(arr => [...arr, { productId: "", quantity: "" }])}>+ Add Item</Button>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Create Delivery"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Supplier Return dialog ───────────────────────────────────────────────────

function SupplierReturnDialog({ branches, suppliers, products, onDone }: { branches: Branch[]; suppliers: Supplier[]; products: Product[]; onDone: () => void }) {
  const { user } = useAuth();
  const { canCreate } = usePermission("Stocks");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ sourceBranchId: "", destSupplierId: "", returnReason: "", notes: "" });
  const [items, setItems] = useState([{ productId: "", quantity: "" }]);
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.sourceBranchId || !form.destSupplierId) { toast.error("Branch and supplier are required"); return; }
    const validItems = items.filter(it => it.productId && Number(it.quantity) > 0);
    if (!validItems.length) { toast.error("Add at least one item"); return; }
    setSaving(true);
    try {
      await api.createStockTransfer({
        transferType: "return_to_supplier",
        sourceBranchId: form.sourceBranchId,
        destSupplierId: form.destSupplierId,
        createdBy: user?.id ?? "",
        status: "pending",
        returnReason: form.returnReason || undefined,
        notes: form.notes || undefined,
        items: validItems.map(it => ({ productId: it.productId, requestedQuantity: Number(it.quantity), returnReason: form.returnReason || undefined })) as StockTransfer["items"],
      });
      toast.success("Supplier return created");
      setOpen(false);
      setForm({ sourceBranchId: "", destSupplierId: "", returnReason: "", notes: "" });
      setItems([{ productId: "", quantity: "" }]);
      onDone();
    } catch { toast.error("Failed to create return"); }
    finally { setSaving(false); }
  }

  return (
    <>
      {canCreate && (
        <Button size="sm" className="gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Create Return
        </Button>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Return to Supplier</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div>
              <Label>From Branch *</Label>
              <Select value={form.sourceBranchId} onValueChange={v => set("sourceBranchId", v)}>
                <SelectTrigger><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Return to Supplier *</Label>
              <Select value={form.destSupplierId} onValueChange={v => set("destSupplierId", v)}>
                <SelectTrigger><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>Return Reason</Label>
              <Input value={form.returnReason} onChange={e => set("returnReason", e.target.value)} placeholder="e.g. damaged, expired, wrong item" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Items</Label>
            {items.map((it, i) => (
              <div key={i} className="flex gap-2">
                <Select value={it.productId} onValueChange={v => setItems(arr => arr.map((x, j) => j === i ? { ...x, productId: v } : x))}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Product" /></SelectTrigger>
                  <SelectContent>{products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="w-24" type="number" min="1" placeholder="Qty" value={it.quantity}
                  onChange={e => setItems(arr => arr.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                {items.length > 1 && <Button size="sm" variant="ghost" onClick={() => setItems(arr => arr.filter((_, j) => j !== i))}>×</Button>}
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => setItems(arr => [...arr, { productId: "", quantity: "" }])}>+ Add Item</Button>
          </div>
          <DialogFooter className="mt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Submit Return"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Wastage dialog ───────────────────────────────────────────────────────────

function WastageDialog({ branches, products, onDone }: { branches: Branch[]; products: Product[]; onDone: () => void }) {
  const { user } = useAuth();
  const { canCreate } = usePermission("Stocks");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ productId: "", branchId: "", quantity: "", reason: "" });
  function set(k: string, v: string) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSave() {
    if (!form.productId || !form.branchId || !form.quantity) { toast.error("Product, branch and quantity are required"); return; }
    setSaving(true);
    try {
      await api.adjustInventory({ productId: form.productId, branchId: form.branchId, quantity: Number(form.quantity), adjustmentType: "damage", reason: form.reason || undefined, adjustedBy: user?.id });
      toast.success("Wastage recorded");
      setOpen(false);
      setForm({ productId: "", branchId: "", quantity: "", reason: "" });
      onDone();
    } catch { toast.error("Failed to record wastage"); }
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
              <Label>Reason / Notes</Label>
              <Textarea rows={2} value={form.reason} onChange={e => set("reason", e.target.value)} placeholder="e.g. expired, damaged in transit…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
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
  const [returns, setReturns] = useState<StockTransfer[]>([]);

  const [loading, setLoading] = useState(true);
  const [tabLoading, setTabLoading] = useState(false);
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
  const [rtStatus, setRtStatus] = useState("all");

  // Per-tab date filters (FE-side since BE doesn't expose date range params)
  const [grnDateFrom, setGrnDateFrom] = useState("");
  const [grnDateTo, setGrnDateTo] = useState("");
  const [dlDateFrom, setDlDateFrom] = useState("");
  const [dlDateTo, setDlDateTo] = useState("");
  const [rtDateFrom, setRtDateFrom] = useState("");
  const [rtDateTo, setRtDateTo] = useState("");

  // ── Per-section fetch functions ──────────────────────────────────────────────

  async function fetchOverview() {
    setLoading(true);
    const sk = await api.getStock({
      branchId: overviewBranch !== "all" ? overviewBranch : undefined,
      categoryId: categoryFilter !== "all" ? categoryFilter : undefined,
    }).catch(() => []);
    setStock(sk ?? []);
    // Rebuild category options from unfiltered load (when no category is active)
    if (categoryFilter === "all") {
      const seen = new Map<string, string>();
      (sk ?? []).forEach(s => {
        const c = s.product?.category;
        if (c?.id && c.name && !seen.has(c.id)) seen.set(c.id, c.name);
      });
      setAllCategoryOptions(Array.from(seen.entries()).map(([id, name]) => ({ id, name })));
    }
    setLoading(false);
  }

  async function fetchBatches() {
    setTabLoading(true);
    const bt = await api.getBatches({
      branchId: siBranch !== "all" ? siBranch : undefined,
      status: siStatus !== "all" ? siStatus : undefined,
    }).catch(() => []);
    setBatches(bt ?? []);
    setTabLoading(false);
  }

  async function fetchReductions() {
    setTabLoading(true);
    const rd = await api.getAdjustments({ adjustmentType: "reduction" }).catch(() => []);
    setReductions(rd ?? []);
    setTabLoading(false);
  }

  async function fetchDamages() {
    setTabLoading(true);
    const dm = await api.getAdjustments({ adjustmentType: "damage" }).catch(() => []);
    setDamages(dm ?? []);
    setTabLoading(false);
  }

  async function fetchPOs() {
    setTabLoading(true);
    const po = await api.getPurchaseOrders({
      status: grnStatus !== "all" ? grnStatus : undefined,
    }).catch(() => []);
    setPurchaseOrders(po ?? []);
    setTabLoading(false);
  }

  async function fetchDeliveries() {
    setTabLoading(true);
    const dl = await api.getStockTransfers({
      transferType: "warehouse_to_branch",
      status: dlStatus !== "all" ? dlStatus : undefined,
    }).catch(() => []);
    setDeliveries(dl ?? []);
    setTabLoading(false);
  }

  async function fetchReturns() {
    setTabLoading(true);
    const rt = await api.getStockTransfers({
      transferType: "return_to_supplier",
      status: rtStatus !== "all" ? rtStatus : undefined,
    }).catch(() => []);
    setReturns(rt ?? []);
    setTabLoading(false);
  }

  async function fetchMovement() {
    setTabLoading(true);
    const [bt, rd, dm, dl, rt] = await Promise.allSettled([
      api.getBatches(),
      api.getAdjustments({ adjustmentType: "reduction" }),
      api.getAdjustments({ adjustmentType: "damage" }),
      api.getStockTransfers({ transferType: "warehouse_to_branch" }),
      api.getStockTransfers({ transferType: "return_to_supplier" }),
    ]);
    if (bt.status === "fulfilled") setBatches(bt.value ?? []);
    if (rd.status === "fulfilled") setReductions(rd.value ?? []);
    if (dm.status === "fulfilled") setDamages(dm.value ?? []);
    if (dl.status === "fulfilled") setDeliveries(dl.value ?? []);
    if (rt.status === "fulfilled") setReturns(rt.value ?? []);
    setTabLoading(false);
  }

  function refreshCurrentTab() {
    fetchOverview(); // always refresh overview metrics
    if (tab === "stock-in") fetchBatches();
    else if (tab === "stock-out") fetchReductions();
    else if (tab === "grn") fetchPOs();
    else if (tab === "delivery") fetchDeliveries();
    else if (tab === "supplier-return") fetchReturns();
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
    else if (tab === "supplier-return") fetchReturns();
    else if (tab === "wastage") fetchDamages();
    else if (tab === "movement") fetchMovement();
  }, [tab, overviewBranch, categoryFilter, siBranch, siStatus, grnStatus, dlStatus, rtStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  // Metrics (from overview stock + pre-fetched expiring count)
  const totalSKUs = stock.length;
  const totalUnits = stock.reduce((s, x) => s + x.quantity, 0);
  const lowStockCount = stock.filter(x => x.quantity <= x.reorderLevel).length;

  const q = search.toLowerCase();
  // Category is already BE-filtered; only search filter applied here
  const filteredStock = stock.filter(s => !q || s.product?.name?.toLowerCase().includes(q));

  // Sub-tabs: data already fetched from BE with status filter; apply date range FE-side only
  const filteredBatches = batches; // branch+status already filtered by BE
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
  const filteredReturns = returns.filter(r => {
    const mdf = !rtDateFrom || (!!r.createdAt && r.createdAt >= rtDateFrom);
    const mdt = !rtDateTo || (!!r.createdAt && r.createdAt <= rtDateTo + "T23:59:59");
    return mdf && mdt;
  });

  // Movement timeline
  type Event = { date: string; type: string; label: string; qty: number; detail: string };
  const events: Event[] = [
    ...batches.map(b => ({ date: b.receivedDate ?? "", type: "in", label: b.product?.name ?? "—", qty: b.quantity, detail: `Batch ${b.batchNumber} — ${b.supplier?.name ?? ""}` })),
    ...reductions.map(a => ({ date: a.createdAt, type: "out", label: a.product?.name ?? "—", qty: a.quantity, detail: a.reason ?? "Reduction" })),
    ...damages.map(a => ({ date: a.createdAt, type: "damage", label: a.product?.name ?? "—", qty: a.quantity, detail: a.reason ?? "Damage" })),
    ...deliveries.map(t => ({ date: t.createdAt, type: "delivery", label: t.destBranch?.name ?? "—", qty: t.items?.reduce((s, i) => s + i.requestedQuantity, 0) ?? 0, detail: t.transferNumber })),
    ...returns.map(t => ({ date: t.createdAt, type: "return", label: t.destSupplier?.name ?? "—", qty: t.items?.reduce((s, i) => s + i.requestedQuantity, 0) ?? 0, detail: t.transferNumber })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const movColor: Record<string, string> = {
    in: "bg-green-100 text-green-700",
    out: "bg-orange-100 text-orange-700",
    damage: "bg-red-100 text-red-700",
    delivery: "bg-blue-100 text-blue-700",
    return: "bg-purple-100 text-purple-700",
  };

  return (
    <PageShell
      title="Stocks"
      subtitle="Stock-In · Stock-Out · GRN · Transfers · Wastage · Movement"
      actions={
        <BarcodeStockInDialog branches={branches} onDone={refreshCurrentTab} />
      }
    >
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
          <TabsTrigger value="supplier-return" className="gap-1.5"><Undo2 className="h-3.5 w-3.5" />Supplier Return</TabsTrigger>
          <TabsTrigger value="wastage" className="gap-1.5"><Trash2 className="h-3.5 w-3.5" />Wastage</TabsTrigger>
          <TabsTrigger value="movement" className="gap-1.5"><History className="h-3.5 w-3.5" />Movement</TabsTrigger>
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
                <div onClick={ensureDialogMetadata}><StockInDialog branches={branches} products={products} suppliers={suppliers} onDone={refreshCurrentTab} /></div>
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
              <div onClick={ensureDialogMetadata}><StockOutDialog branches={branches} products={products} onDone={refreshCurrentTab} /></div>
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
                <div onClick={ensureDialogMetadata}><StoreDeliveryDialog branches={branches} warehouses={warehouses} products={products} onDone={refreshCurrentTab} /></div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TransferTable rows={filteredDeliveries} loading={tabLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Supplier Return ── */}
        <TabsContent value="supplier-return">
          <Card>
            <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base">Supplier Returns</CardTitle>
              <div className="flex items-center gap-2">
                <Select value={rtStatus} onValueChange={setRtStatus}>
                  <SelectTrigger className="h-8 w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="confirmed">Confirmed</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="date" className="h-8 w-36 text-xs" value={rtDateFrom} onChange={e => setRtDateFrom(e.target.value)} title="From" />
                <Input type="date" className="h-8 w-36 text-xs" value={rtDateTo} onChange={e => setRtDateTo(e.target.value)} title="To" />
                <div onClick={ensureDialogMetadata}><SupplierReturnDialog branches={branches} suppliers={suppliers} products={products} onDone={refreshCurrentTab} /></div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <TransferTable rows={filteredReturns} loading={tabLoading} />
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
              <AdjustmentTable rows={damages} branches={branches} loading={tabLoading} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Movement ── */}
        <TabsContent value="movement">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Stock Movement Timeline</CardTitle>
            </CardHeader>
            <CardContent>
              {tabLoading ? <p className="text-center text-muted-foreground py-8">Loading…</p>
                : events.length === 0 ? <p className="text-center text-muted-foreground py-8">No movement records found</p>
                : (
                  <div className="space-y-1 max-h-[600px] overflow-y-auto">
                    {events.map((ev, i) => (
                      <div key={i} className="flex items-start gap-3 py-2 border-b last:border-0">
                        <div className="w-1.5 h-1.5 mt-2 rounded-full bg-primary flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${movColor[ev.type] ?? "bg-gray-100 text-gray-600"}`}>{ev.type}</span>
                            <span className="font-medium text-sm truncate">{ev.label}</span>
                            <span className="text-xs text-muted-foreground">Qty: {fmt(ev.qty)}</span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">{ev.detail}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-xs text-muted-foreground">{fmtDate(ev.date)}</p>
                          <p className="text-xs text-muted-foreground">{fmtTime(ev.date)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
            </CardContent>
          </Card>
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

function AdjustmentTable({ rows, branches, loading }: { rows: InventoryAdjustment[]; branches: Branch[]; loading: boolean }) {
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
            <th className="px-4 py-2 text-left">Date</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No records found</td></tr>
          ) : rows.map(a => {
            const branch = branches.find(b => b.id === a.branchId);
            return (
              <tr key={a.id} className="border-t hover:bg-muted/20">
                <td className="px-4 py-2.5 font-medium">{a.product?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-muted-foreground">{a.branch?.name ?? branch?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-right">{fmt(a.quantity)}</td>
                <td className="px-4 py-2.5"><StBadge status={a.adjustmentType} /></td>
                <td className="px-4 py-2.5 text-muted-foreground text-xs">{a.reason ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
