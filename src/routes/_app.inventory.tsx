import { createFileRoute, useNavigate } from "@tanstack/react-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus, Minus, Eye, Pencil, LayoutGrid, Package, AlertTriangle, CalendarClock,
  Boxes, ScanLine, Loader2, Download, CheckCircle2, Percent, Tag, Sparkles,
  ImageOff, ChevronRight, ChevronDown, Truck, Trash2, ArrowRightLeft,
} from "lucide-react";
import { BatchExpandRow } from "@/components/batch-expand-row";
import { api, type InventoryStock, type InventoryBatch, type Category, type Branch, type Supplier, type Warehouse, type StockTransfer } from "@/lib/api";
import { SARIcon } from "@/lib/currency";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { fileToCompressedDataUrl } from "@/lib/image";
import { localDateStr } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/inventory")({ component: Inventory });

// A freshly received batch can't already be expired — used as the min on both "Expiry date"
// inputs below (Receive Batch / Quick Stock In) and to validate on submit, since some browsers
// let a date be typed in manually past the input's own min.
const todayStr = localDateStr();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysLeft(date?: string | null) {
  if (!date) return null;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
}

function fmtPrice(n?: number | null) {
  if (n == null) return "—";
  return n.toFixed(2);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StockBadge({ qty, reorder }: { qty: number; reorder: number }) {
  if (qty === 0) return <Badge variant="outline" className="bg-destructive/15 text-destructive border-destructive/30 text-xs gap-1"><span className="h-1.5 w-1.5 rounded-full bg-destructive inline-block" />Out of Stock</Badge>;
  if (qty <= reorder) return <Badge variant="outline" className="bg-warning/20 text-warning-foreground border-warning/40 text-xs gap-1"><span className="h-1.5 w-1.5 rounded-full bg-warning inline-block" />Low</Badge>;
  return <Badge variant="outline" className="bg-success/15 text-success border-success/30 text-xs gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success inline-block" />In Stock</Badge>;
}

function ExpiryCell({ date }: { date?: string | null }) {
  if (!date) return <span className="text-muted-foreground text-xs">—</span>;
  const d = daysLeft(date);
  const formatted = new Date(date).toISOString().split("T")[0];
  let badge: React.ReactNode = null;
  if (d !== null && d < 0) badge = <span className="inline-block rounded-full bg-destructive/15 text-destructive text-[10px] px-1.5 py-0.5 font-medium">Expired</span>;
  else if (d !== null && d <= 30) badge = <span className="inline-block rounded-full bg-warning/20 text-warning-foreground text-[10px] px-1.5 py-0.5 font-medium">{d}d left</span>;
  else badge = <span className="inline-block rounded-full bg-success/15 text-success text-[10px] px-1.5 py-0.5 font-medium">Safe</span>;
  return <div className="text-xs"><p className="text-muted-foreground">{formatted}</p><div className="mt-0.5">{badge}</div></div>;
}

// ─── Incoming Transfers (in-transit warehouse→branch transfers awaiting receipt) ──────────────
// Previously the only way to receive one of these was to leave Inventory and find it on the
// dedicated Stock Transfers page — this surfaces it right where a branch user is already looking
// at stock, and receiving here carries the source batch's number/expiry forward automatically
// (StockTransfersController.MoveTransferStockAsync already does this) rather than minting a
// disconnected one.
function QuickReceiveTransferSheet({ transfer, onClose, onReceived }: {
  transfer: StockTransfer | null; onClose: () => void; onReceived: () => void;
}) {
  const { user } = useAuth();
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (transfer) {
      const q: Record<string, number> = {};
      (transfer.items ?? []).forEach(it => { q[it.id] = it.requestedQuantity; });
      setQtys(q);
      setError("");
    }
  }, [transfer]);

  if (!transfer) return null;

  const handleConfirm = async () => {
    const items = (transfer.items ?? [])
      .filter(it => (qtys[it.id] ?? 0) > 0)
      .map(it => ({ itemId: it.id, receivedQuantity: qtys[it.id] }));
    if (!items.length) return setError("Enter at least one quantity.");
    setSaving(true); setError("");
    try {
      await api.receiveStockTransfer(transfer.id, items, user?.id);
      onReceived();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to receive transfer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={!!transfer} onOpenChange={v => !v && onClose()}>
      <SheetContent style={{ width: 480, maxWidth: "100vw" }} className="overflow-y-auto">
        <SheetHeader><SheetTitle>Receive Transfer — {transfer.transferNumber}</SheetTitle></SheetHeader>
        <p className="text-xs text-muted-foreground mt-1">From {transfer.sourceWarehouse?.name ?? transfer.sourceBranch?.name ?? "—"}</p>
        <div className="mt-4 space-y-3">
          {(transfer.items ?? []).map(it => (
            <div key={it.id} className="rounded-xl border border-border/60 p-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-sm truncate">{it.product?.name ?? it.productId}</p>
                <p className="text-xs text-muted-foreground">Requested: {it.requestedQuantity}</p>
              </div>
              <div className="shrink-0 space-y-1">
                <Label className="text-[11px] font-medium">Qty Received</Label>
                <Input type="number" min={0} className="h-8 w-20 text-xs text-center"
                  value={qtys[it.id] ?? 0} onChange={e => setQtys(p => ({ ...p, [it.id]: Number(e.target.value) }))} />
              </div>
            </div>
          ))}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full gradient-primary text-primary-foreground border-0 shadow-glow" onClick={handleConfirm} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Confirm Receipt
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function IncomingTransfersBanner({ transfers, onReceive }: { transfers: StockTransfer[]; onReceive: (t: StockTransfer) => void }) {
  if (transfers.length === 0) return null;
  return (
    <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-primary flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" />Incoming Transfers — awaiting receipt</p>
      <div className="space-y-1.5">
        {transfers.map(t => (
          <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg bg-background border border-border/50 px-3 py-2">
            <div className="min-w-0 text-xs">
              <span className="font-mono font-semibold">{t.transferNumber}</span>
              <span className="text-muted-foreground"> · from {t.sourceWarehouse?.name ?? t.sourceBranch?.name ?? "—"} · {(t.items ?? []).length} item(s)</span>
            </div>
            <Button size="sm" className="h-7 text-xs gap-1 shrink-0" onClick={() => onReceive(t)}>
              <Truck className="h-3 w-3" />Receive
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-medium">{label}</Label>{children}</div>;
}

function ProductThumb({ src, className = "h-9 w-9" }: { src?: string; className?: string }) {
  if (!src) {
    return (
      <div className={`${className} rounded-md border border-dashed border-border/60 bg-muted/30 overflow-hidden shrink-0 flex flex-col items-center justify-center gap-0.5 text-muted-foreground`}>
        <ImageOff className="h-4 w-4" />
        <span className="text-[8px] leading-none text-center px-0.5">No image</span>
      </div>
    );
  }
  return (
    <div className={`${className} rounded-md border border-border/60 bg-muted/40 overflow-hidden shrink-0`}>
      <img src={src} alt="" className="h-full w-full object-cover" />
    </div>
  );
}

function ProductImagePicker({ value, onChange }: { value: string; onChange: (dataUrl: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setLoading(true);
    try {
      onChange(await fileToCompressedDataUrl(file));
    } catch {
      // ignore — user can retry
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3">
      <ProductThumb src={value} className="h-16 w-16" />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : null}
          {value ? "Change photo" : "Upload photo"}
        </Button>
        {value && (
          <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => onChange("")}>
            Remove
          </Button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={e => handleFile(e.target.files?.[0])} />
    </div>
  );
}

// ─── Receive Stock Dialog (from an in-transit Stock Transfer) ────────────────
// Stock may only enter a branch through PO → Stock Transfer → in_transit → receive
// (StockTransfersController.ReceiveTransfer) — this replaces the old free-form "Receive Batch"
// form, which let anyone materialize stock for a branch with a quantity they just typed in,
// no Purchase Order and no supplier payment trail behind it. Here the user picks where the
// stock is coming from (a warehouse, or another branch for branch_to_branch transfers) and
// only sees shipments that are actually in transit from that source into this branch.
function ReceiveStockDialog({ open, onClose, warehouses, branches, destBranchId, onReceive }: {
  open: boolean; onClose: () => void;
  warehouses: Warehouse[]; branches: Branch[];
  destBranchId: string | null;
  onReceive: (t: StockTransfer) => void;
}) {
  const [sourceKey, setSourceKey] = useState("");
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) { setSourceKey(""); setTransfers([]); }
  }, [open]);

  useEffect(() => {
    if (!sourceKey || !destBranchId) { setTransfers([]); return; }
    const [type, id] = sourceKey.split(":");
    setLoading(true);
    api.getStockTransfers({
      status: "in_transit",
      ...(type === "warehouse" ? { sourceWarehouseId: id } : { sourceBranchId: id }),
    })
      .then(all => setTransfers(all.filter(t => t.destBranchId === destBranchId)))
      .catch(() => setTransfers([]))
      .finally(() => setLoading(false));
  }, [sourceKey, destBranchId]);

  const sourceOptions = [
    ...warehouses.map(w => ({ key: `warehouse:${w.id}`, label: w.name })),
    ...branches.filter(b => b.id !== destBranchId).map(b => ({ key: `branch:${b.id}`, label: b.name })),
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Receive Stock</DialogTitle>
          <p className="text-sm text-muted-foreground">Pick where the stock is coming from to see shipments currently in transit to this branch.</p>
        </DialogHeader>
        <div className="mt-2 space-y-3">
          <FieldRow label="Coming from">
            <Select value={sourceKey} onValueChange={setSourceKey}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select warehouse or branch" /></SelectTrigger>
              <SelectContent>
                {sourceOptions.map(o => <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </FieldRow>

          {loading && <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>}

          {!loading && sourceKey && transfers.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nothing in transit from this source right now.</p>
          )}

          {!loading && transfers.length > 0 && (
            <div className="space-y-2">
              {transfers.map(t => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 px-3 py-2.5">
                  <div className="min-w-0 text-sm">
                    <p className="font-mono font-semibold">{t.transferNumber}</p>
                    <p className="text-xs text-muted-foreground">{(t.items ?? []).length} item(s)</p>
                  </div>
                  <Button size="sm" className="h-8 text-xs gap-1 shrink-0" onClick={() => onReceive(t)}>
                    <Truck className="h-3 w-3" />Receive
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Add Product Dialog ───────────────────────────────────────────────────────

function generateSKU(name: string): string {
  const words = name.trim().split(/\s+/).filter(w => w.length >= 2);
  const parts = words.slice(0, 3).map(w => w.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().slice(0, 3));
  const suffix = String(Date.now()).slice(-4);
  return parts.length ? `${parts.join("-")}-${suffix}` : `SKU-${suffix}`;
}

function AddProductDialog({ open, onClose, categories, branches, onDone }: {
  open: boolean; onClose: () => void;
  categories: Category[]; branches: Branch[];
  onDone: () => void;
}) {
  const barcodeRef = useRef<HTMLInputElement>(null);
  const [scanning, setScanning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [skuManual, setSkuManual] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupStatus, setLookupStatus] = useState<"found" | "not_found" | null>(null);

  const lookupBarcode = async (barcode: string) => {
    if (!barcode || barcode.length < 6) return;
    setLookupLoading(true);
    setLookupStatus(null);
    const applyName = (raw: string, imageUrl?: string) => {
      const name = raw.trim();
      if (!name) return false;
      setForm(prev => ({ ...prev, name, sku: generateSKU(name), ...(imageUrl ? { imageUrl } : {}) }));
      setSkuManual(false);
      setLookupStatus("found");
      return true;
    };
    try {
      // 1) Open Food Facts (best for food/beverage worldwide)
      const offRes = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
      const offData = await offRes.json();
      if (offData.status === 1 && offData.product) {
        const p = offData.product;
        const name = [p.brands, p.product_name_en || p.product_name].filter(Boolean).join(" ");
        if (applyName(name, p.image_front_url || p.image_url)) return;
      }

      // 2) UPC Item DB fallback (good US/international retail products)
      const upcRes = await fetch(`https://api.upcitemdb.com/prod/trial/lookup?upc=${barcode}`);
      const upcData = await upcRes.json();
      if (upcData.items && upcData.items.length > 0) {
        const item = upcData.items[0];
        const name = [item.brand, item.title].filter(Boolean).join(" ");
        if (applyName(name, item.images?.[0])) return;
      }

      setLookupStatus("not_found");
    } catch {
      setLookupStatus("not_found");
    } finally {
      setLookupLoading(false);
    }
  };
  const [form, setForm] = useState({
    name: "", sku: "", barcode: "", categoryId: "",
    branchId: "",
    purchasePrice: "", sellingPrice: "",
    quantity: "100", expiryDate: "",
    vatPct: "15", customFee: "0.00", isTobacco: false,
    discountType: "percentage" as "percentage" | "fixed",
    discount: "", imageUrl: "",
  });

  const set = (k: keyof typeof form) => (v: string) => { setForm(p => ({ ...p, [k]: v })); setError(""); };
  const reset = () => {
    setSkuManual(false);
    setSubmitted(false);
    setError("");
    setLookupStatus(null);
    setLookupLoading(false);
    setForm({ name: "", sku: "", barcode: "", categoryId: "", branchId: "", purchasePrice: "", sellingPrice: "", quantity: "100", expiryDate: "", vatPct: "15", customFee: "0.00", isTobacco: false, discountType: "percentage", discount: "", imageUrl: "" });
  };

  const missingFields = [
    !form.name && "Product Name",
    !form.sku && "SKU",
    !form.categoryId && "Category",
    !form.branchId && "Branch",
    !form.sellingPrice && "Selling Price",
  ].filter((x): x is string => !!x);
  const fieldError = (field: string) => (submitted && missingFields.includes(field) ? "border-destructive/60 ring-1 ring-destructive/30" : "");

  // Auto-generate SKU when name changes (unless user typed it manually)
  useEffect(() => {
    if (!skuManual && form.name.trim().length >= 2) {
      setForm(p => ({ ...p, sku: generateSKU(form.name) }));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.name]);

  const handleSave = async () => {
    setSubmitted(true);
    if (missingFields.length > 0) {
      return setError(`${missingFields.join(", ")} ${missingFields.length > 1 ? "are" : "is"} required.`);
    }
    if (form.expiryDate && form.expiryDate < todayStr) {
      return setError("Expiry date cannot be in the past for stock received today.");
    }
    // The initial batch call below (ReceiveBatch) hard-rejects quantity <= 0 server-side.
    // Validating it here, before the product is created, stops the two-step create+stock
    // flow from ever reaching a state where the product exists but the batch call fails —
    // previously that left an orphaned, stock-less product with no way to retry cleanly
    // (a second Save attempt would then hit the SKU/barcode uniqueness conflict against
    // the orphan it had just silently created).
    if (!form.quantity || Number(form.quantity) <= 0) {
      return setError("Initial quantity must be greater than zero.");
    }
    setSaving(true); setError("");
    let createdProductId: string | null = null;
    try {
      const product = await api.createProduct({
        name: form.name, sku: form.sku,
        barcode: form.barcode || undefined,
        categoryId: form.categoryId,
        basePrice: Number(form.sellingPrice),
        costPrice: Number(form.purchasePrice) || undefined,
        taxPercentage: Number(form.vatPct) || 15,
        customFee: Number(form.customFee) || 0,
        reorderLevel: 10,
        status: "active",
        weightBased: false,
        isTobacco: form.isTobacco,
        imageUrl: form.imageUrl || undefined,
        ...(form.discount ? { discount: Number(form.discount), discountType: form.discountType } : {}),
      } as Parameters<typeof api.createProduct>[0]);
      createdProductId = product.id;
      // Create an initial stock record so the product appears in the inventory list
      await api.receiveBatch({
        productId: product.id,
        branchId: form.branchId,
        quantity: Number(form.quantity),
        purchaseCost: Number(form.purchasePrice) || undefined,
        expiryDate: form.expiryDate || undefined,
        batchNumber: `INIT-${product.id.slice(0, 6).toUpperCase()}`,
      } as Parameters<typeof api.receiveBatch>[0]);
      toast.success("Product created successfully");
      reset(); onDone(); onClose();
    } catch (e) {
      // The product record was already committed by the first call above; if the batch
      // step then fails for any reason (network blip, backend rejecting the expiry date,
      // a branch-scoped permission mismatch), discontinue it rather than leaving a phantom
      // active, stock-less item sitting in the catalog that the user never sees was created.
      if (createdProductId) await api.deleteProduct(createdProductId).catch(() => {});
      setError(e instanceof Error ? e.message : "Failed.");
    }
    finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { reset(); onClose(); } }}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Add Product</DialogTitle></DialogHeader>
        <div className="mt-2">
          <FieldRow label="Product Photo">
            <ProductImagePicker value={form.imageUrl} onChange={set("imageUrl")} />
          </FieldRow>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <FieldRow label="Product Name *">
            <Input className={`h-9 ${fieldError("Product Name")}`} placeholder="Almarai Laban 1L" value={form.name} onChange={e => set("name")(e.target.value)} />
          </FieldRow>
          <FieldRow label="SKU *">
            <div className="relative">
              <Input className={`h-9 pr-16 ${fieldError("SKU")}`} placeholder="ALM-LB-1L" value={form.sku}
                onChange={e => { setSkuManual(true); set("sku")(e.target.value); }} />
              {skuManual && (
                <button type="button" onClick={() => { setSkuManual(false); setForm(p => ({ ...p, sku: generateSKU(p.name) })); }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-primary hover:underline">
                  Auto
                </button>
              )}
            </div>
          </FieldRow>
          <FieldRow label="Barcode">
            <div className="flex gap-1">
              <div className="relative flex-1">
                <Input ref={barcodeRef}
                  className={`h-9 pr-7 ${scanning ? "border-primary ring-1 ring-primary" : ""} ${lookupStatus === "found" ? "border-green-500" : ""}`}
                  placeholder={scanning ? "Scan now…" : "6281007012340"}
                  value={form.barcode}
                  onChange={e => { set("barcode")(e.target.value); setLookupStatus(null); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); lookupBarcode(e.currentTarget.value); } }}
                  onBlur={() => setScanning(false)} />
                {lookupLoading && <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                {lookupStatus === "found" && !lookupLoading && <CheckCircle2 className="absolute right-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-green-500" />}
              </div>
              <Button type="button" size="icon" variant={scanning ? "default" : "outline"}
                className={`h-9 w-9 shrink-0 ${scanning ? "gradient-primary text-primary-foreground border-0" : ""}`}
                onClick={() => { setScanning(true); setLookupStatus(null); setTimeout(() => barcodeRef.current?.focus(), 50); }}>
                <ScanLine className="h-4 w-4" />
              </Button>
            </div>
            {lookupStatus === "found" && (
              <p className="text-[11px] text-green-600 flex items-center gap-1 mt-1">
                <Sparkles className="h-3 w-3" /> Product details filled from barcode database
              </p>
            )}
            {lookupStatus === "not_found" && (
              <p className="text-[11px] text-amber-600 mt-1">
                Barcode <span className="font-mono font-semibold">{form.barcode}</span> not found in database — fill details manually
              </p>
            )}
          </FieldRow>
          <FieldRow label="Category *">
            <Select value={form.categoryId} onValueChange={set("categoryId")}>
              <SelectTrigger className={`h-9 ${fieldError("Category")}`}>
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Branch *">
            <Select value={form.branchId} onValueChange={set("branchId")}>
              <SelectTrigger className={`h-9 ${fieldError("Branch")}`}><SelectValue placeholder="Select branch" /></SelectTrigger>
              <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Purchase Price">
            <Input type="number" step="0.01" min={0} className="h-9" placeholder="4.20" value={form.purchasePrice} onChange={e => set("purchasePrice")(e.target.value)} />
          </FieldRow>
          <FieldRow label="Selling Price *">
            <Input type="number" step="0.01" min={0} className={`h-9 ${fieldError("Selling Price")}`} placeholder="6.50" value={form.sellingPrice} onChange={e => set("sellingPrice")(e.target.value)} />
          </FieldRow>
          <FieldRow label="Quantity *">
            <Input type="number" min={1} className={`h-9 ${submitted && (!form.quantity || Number(form.quantity) <= 0) ? "border-destructive/60 ring-1 ring-destructive/30" : ""}`} placeholder="100" value={form.quantity} onChange={e => set("quantity")(e.target.value)} />
          </FieldRow>
          <FieldRow label="Expiry Date">
            <Input type="date" className="h-9" min={todayStr} value={form.expiryDate} onChange={e => set("expiryDate")(e.target.value)} />
          </FieldRow>

          {/* Discount */}
          <div className="col-span-2">
            <FieldRow label="Discount (optional)">
              <div className="flex gap-2">
                <div className="flex rounded-lg border border-border/60 overflow-hidden shrink-0">
                  {(["percentage", "fixed"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setForm(p => ({ ...p, discountType: t }))}
                      className={`px-3 py-1.5 text-xs flex items-center gap-1 transition-colors ${form.discountType === t ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted/50"}`}>
                      {t === "percentage" ? <Percent className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
                      {t === "percentage" ? "%" : "SAR"}
                    </button>
                  ))}
                </div>
                <Input type="number" step="0.01" min={0} className="h-9 flex-1"
                  placeholder={form.discountType === "percentage" ? "e.g. 10 for 10%" : "e.g. 2.00"}
                  value={form.discount} onChange={e => set("discount")(e.target.value)} />
              </div>
            </FieldRow>
          </div>

          <p className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Optional tax / fee fields</p>
          <FieldRow label="VAT %">
            <Input type="number" min={0} max={100} className="h-9" placeholder="15" value={form.vatPct} onChange={e => set("vatPct")(e.target.value)} />
          </FieldRow>
          <FieldRow label="Custom fee (SAR)">
            <Input type="number" step="0.01" min={0} className="h-9" placeholder="0.00" value={form.customFee} onChange={e => set("customFee")(e.target.value)} />
          </FieldRow>
          <div className="col-span-2 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2.5">
            <input
              type="checkbox"
              id="isTobacco"
              checked={form.isTobacco}
              onChange={e => setForm(p => ({ ...p, isTobacco: e.target.checked }))}
              className="h-4 w-4 accent-amber-600"
            />
            <label htmlFor="isTobacco" className="flex-1 text-sm cursor-pointer">
              <span className="font-semibold text-amber-700 dark:text-amber-400">Tobacco / Excise Product</span>
              <span className="block text-xs text-muted-foreground mt-0.5">KSA excise tax applies at checkout — min 25 SAR or 100% of base price, whichever is higher</span>
            </label>
          </div>
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        <Button className="w-full gradient-primary text-primary-foreground border-0 shadow-glow mt-2" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save Product
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Product Dialog ──────────────────────────────────────────────────────

function EditProductDialog({ item, onClose, categories, onDone }: {
  item: StockItem | null; onClose: () => void;
  categories: Category[]; onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    name: "", sku: "", barcode: "", categoryId: "",
    sellingPrice: "", purchasePrice: "",
    vatPct: "15", customFee: "0.00", isTobacco: false,
    discountType: "percentage" as "percentage" | "fixed",
    discount: "", imageUrl: "",
    status: "active", weightBased: false,
  });

  useEffect(() => {
    if (!item?.product) return;
    const p = item.product;
    setForm({
      name: p.name ?? "",
      sku: p.sku ?? "",
      barcode: p.barcode ?? "",
      categoryId: (p as unknown as { categoryId?: string }).categoryId ?? "",
      sellingPrice: String(p.basePrice ?? ""),
      purchasePrice: p.costPrice != null ? String(p.costPrice) : "",
      vatPct: String(p.taxPercentage ?? 15),
      customFee: String(p.customFee ?? 0),
      isTobacco: p.isTobacco ?? false,
      discountType: (p.discountType as "percentage" | "fixed") ?? "percentage",
      discount: p.discount != null ? String(p.discount) : "",
      imageUrl: p.imageUrl ?? "",
      // Carried through unchanged — this dialog has no controls for either, so it must not
      // clobber them. Previously hardcoded to "active"/false on every save, which silently
      // un-discontinued products and reset weight-based (kg-priced) items to unit pricing.
      status: p.status ?? "active",
      weightBased: p.weightBased ?? false,
    });
    setError("");
  }, [item]);

  const handleSave = async () => {
    if (!item?.product?.id) return;
    if (!form.name || !form.sku || !form.sellingPrice) return setError("Name, SKU and selling price are required.");
    setSaving(true); setError("");
    try {
      await api.updateProduct(item.product.id, {
        name: form.name,
        sku: form.sku,
        barcode: form.barcode || undefined,
        categoryId: form.categoryId || undefined,
        basePrice: Number(form.sellingPrice),
        costPrice: Number(form.purchasePrice) || undefined,
        taxPercentage: Number(form.vatPct) || 15,
        customFee: Number(form.customFee) || 0,
        isTobacco: form.isTobacco,
        discount: form.discount ? Number(form.discount) : undefined,
        discountType: form.discount ? form.discountType : undefined,
        imageUrl: form.imageUrl || undefined,
        status: form.status,
        weightBased: form.weightBased,
        reorderLevel: item.reorderLevel ?? 10,
      });
      onDone(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed to save."); }
    finally { setSaving(false); }
  };

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  return (
    <Dialog open={!!item} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Edit Product</DialogTitle></DialogHeader>
        <div className="mt-2">
          <FieldRow label="Product Photo">
            <ProductImagePicker value={form.imageUrl} onChange={v => setForm(p => ({ ...p, imageUrl: v }))} />
          </FieldRow>
        </div>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <FieldRow label="Product Name *">
            <Input className="h-9" value={form.name} onChange={set("name")} />
          </FieldRow>
          <FieldRow label="SKU *">
            <Input className="h-9" value={form.sku} onChange={set("sku")} />
          </FieldRow>
          <FieldRow label="Barcode">
            <Input className="h-9" value={form.barcode} onChange={set("barcode")} placeholder="6281007012340" />
          </FieldRow>
          <FieldRow label="Category">
            <Select value={form.categoryId} onValueChange={v => setForm(p => ({ ...p, categoryId: v }))}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>{categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </FieldRow>
          <FieldRow label="Purchase Price">
            <Input type="number" step="0.01" className="h-9" value={form.purchasePrice} onChange={set("purchasePrice")} placeholder="4.20" />
          </FieldRow>
          <FieldRow label="Selling Price *">
            <Input type="number" step="0.01" className="h-9" value={form.sellingPrice} onChange={set("sellingPrice")} placeholder="6.50" />
          </FieldRow>

          {/* Discount */}
          <div className="col-span-2">
            <FieldRow label="Discount (optional)">
              <div className="flex gap-2">
                <div className="flex rounded-lg border border-border/60 overflow-hidden shrink-0">
                  {(["percentage", "fixed"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setForm(p => ({ ...p, discountType: t }))}
                      className={`px-3 py-1.5 text-xs flex items-center gap-1 transition-colors ${form.discountType === t ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted/50"}`}>
                      {t === "percentage" ? <Percent className="h-3 w-3" /> : <Tag className="h-3 w-3" />}
                      {t === "percentage" ? "%" : "SAR"}
                    </button>
                  ))}
                </div>
                <Input type="number" step="0.01" min={0} className="h-9 flex-1"
                  placeholder={form.discountType === "percentage" ? "e.g. 10 for 10%" : "e.g. 2.00"}
                  value={form.discount} onChange={e => setForm(p => ({ ...p, discount: e.target.value }))} />
              </div>
            </FieldRow>
          </div>

          <p className="col-span-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Tax / fee fields</p>
          <FieldRow label="VAT %">
            <Input type="number" className="h-9" value={form.vatPct} onChange={set("vatPct")} />
          </FieldRow>
          <FieldRow label="Custom fee (SAR)">
            <Input type="number" step="0.01" className="h-9" value={form.customFee} onChange={set("customFee")} />
          </FieldRow>
          <div className="col-span-2 flex items-center gap-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 px-3 py-2.5">
            <input
              type="checkbox"
              id="editIsTobacco"
              checked={form.isTobacco}
              onChange={e => setForm(p => ({ ...p, isTobacco: e.target.checked }))}
              className="h-4 w-4 accent-amber-600"
            />
            <label htmlFor="editIsTobacco" className="flex-1 text-sm cursor-pointer">
              <span className="font-semibold text-amber-700 dark:text-amber-400">Tobacco / Excise Product</span>
              <span className="block text-xs text-muted-foreground mt-0.5">KSA excise tax applies at checkout — min 25 SAR or 100% of base price</span>
            </label>
          </div>
        </div>
        {error && <p className="text-xs text-destructive mt-1">{error}</p>}
        <Button className="w-full gradient-primary text-primary-foreground border-0 shadow-glow mt-2" onClick={handleSave} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save Changes
        </Button>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Item Sheet ──────────────────────────────────────────────────────────

function ViewSheet({ item, suppliers, onClose }: { item: StockItem | null; suppliers: Supplier[]; onClose: () => void }) {
  if (!item) return null;
  const supplier = suppliers.find(s => s.id === item.supplierId);
  const rows: [string, React.ReactNode][] = [
    ["Category",       item.product?.category?.name ?? "—"],
    ["Branch",         item.branch?.name ?? "—"],
    ["Quantity",       String(item.quantity)],
    ["Stock status",   item.quantity === 0 ? "Out of stock" : item.quantity <= item.reorderLevel ? "Low" : "In stock"],
    ["Expiry",         item.expiryDate ? new Date(item.expiryDate).toISOString().split("T")[0] : "—"],
    ["Supplier",       supplier?.name ?? "—"],
    ["Purchase price", item.product?.costPrice == null ? "—" : <><SARIcon />{fmtPrice(item.product.costPrice)}</>],
    ["Selling price",  item.product?.basePrice == null ? "—" : <><SARIcon />{fmtPrice(item.product.basePrice)}</>],
    ["VAT",            `${item.product?.taxPercentage ?? 15}%`],
    ["Custom fee",     item.product?.customFee == null ? "—" : <><SARIcon />{fmtPrice(item.product.customFee)}</>],
    ["Tobacco/Excise", item.product?.isTobacco ? "Yes — excise applies" : "No"],
  ];
  return (
    <Sheet open={!!item} onOpenChange={v => !v && onClose()}>
      <SheetContent style={{ width: 420 }} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{item.product?.name ?? "—"}</SheetTitle>
          <p className="text-xs text-muted-foreground font-mono">{item.product?.sku} · {item.product?.barcode}</p>
        </SheetHeader>
        <div className="mt-4 flex justify-center">
          {item.product?.imageUrl ? (
            <div className="h-28 w-28 rounded-md border border-border/60 bg-muted/40 overflow-hidden shrink-0">
              <img src={item.product.imageUrl} alt="" className="h-full w-full object-cover" />
            </div>
          ) : (
            <div className="h-28 w-28 rounded-md border border-dashed border-border/60 bg-muted/30 flex flex-col items-center justify-center gap-1.5 text-center px-2">
              <ImageOff className="h-5 w-5 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">No image uploaded</p>
              <p className="text-[10px] text-muted-foreground/80">Add one from Edit</p>
            </div>
          )}
        </div>
        <div className="mt-5 space-y-3">
          {rows.map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-border/40 pb-2 text-sm">
              <span className="text-muted-foreground">{k}</span>
              <span className="font-medium">{v}</span>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Adjust Stock Dialog ──────────────────────────────────────────────────────

function AdjustDialog({ item, batches, onClose, onDone }: { item: StockItem | null; batches: InventoryBatch[]; onClose: () => void; onDone: () => void }) {
  const [adjustAmount, setAdjustAmount] = useState("");
  const [direction, setDirection] = useState<"increase" | "decrease">("decrease");
  const [reason, setReason] = useState("cycle_count");
  const [notes, setNotes] = useState("");
  const [batchId, setBatchId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => { if (item) { setAdjustAmount(""); setDirection("decrease"); setNotes(""); setError(""); setBatchId(""); } }, [item]);

  // Expired batches are already written off (see BatchExpandRow's same exclusion) — not a valid
  // target for either direction of a manual adjustment. Sorted FEFO, matching every other batch
  // picker in the app (Stock Transfers' item rows, BatchExpandRow's own listing).
  const eligibleBatches = item
    ? batches
        .filter(b => b.productId === item.productId && b.branchId === item.branchId && b.status !== "expired")
        .sort((a, b) => (a.expiryDate ? new Date(a.expiryDate).getTime() : Infinity) - (b.expiryDate ? new Date(b.expiryDate).getTime() : Infinity))
    : [];

  const handleSave = async () => {
    if (!item || adjustAmount === "") return;
    const diff = direction === "increase" ? Number(adjustAmount) : -Number(adjustAmount);
    setSaving(true); setError("");
    try {
      // A decrease reasoned as Damage/Loss is a real waste event, not just a generic stock
      // correction — the Waste/Spoilage report filters on AdjustmentType being exactly "damage"
      // or "waste", so those two reasons need to carry through as the type itself (not just land
      // in the free-text reason), or a real "record this as damaged" action would never appear
      // there. Cycle count/correction and any increase stay generic, matching the stock-quantity
      // direction logic in InventoryController.Adjust unchanged.
      const adjustmentType = diff >= 0
        ? "addition"
        : reason === "damage" ? "damage"
        : reason === "loss" ? "waste"
        : "reduction";
      await api.adjustInventory({
        productId: item.productId, branchId: item.branchId,
        quantity: Math.abs(diff),
        adjustmentType,
        reason: notes || reason,
        batchId: batchId || undefined,
      });
      onDone(); onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "Failed."); }
    finally { setSaving(false); }
  };

  const navigate = useNavigate();
  const previewQty = adjustAmount === "" ? item?.quantity : Math.max(0, (item?.quantity ?? 0) + (direction === "increase" ? Number(adjustAmount) : -Number(adjustAmount)));

  if (!item) return null;
  return (
    <Dialog open={!!item} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-base">Adjust stock · {item.product?.name}</DialogTitle>
        </DialogHeader>
        <div className="rounded-xl border border-border/60 bg-muted/30 p-4 text-center mb-1">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Current quantity</p>
          <p className="text-4xl font-bold mt-1">{item.quantity}</p>
        </div>
        <div className="space-y-3">
          <FieldRow label="Adjust by">
            <div className="flex gap-2">
              <div className="flex h-9 rounded-lg border border-border/60 overflow-hidden shrink-0">
                <button type="button" onClick={() => setDirection("decrease")}
                  className={`w-9 flex items-center justify-center transition-colors ${direction === "decrease" ? "bg-destructive text-destructive-foreground" : "hover:bg-muted/50 text-muted-foreground"}`}
                  title="Decrease">
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => setDirection("increase")}
                  className={`w-9 flex items-center justify-center border-l border-border/60 transition-colors ${direction === "increase" ? "bg-success text-success-foreground" : "hover:bg-muted/50 text-muted-foreground"}`}
                  title="Increase">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
              <Input type="number" min={0} className="h-9 flex-1" placeholder="Quantity" value={adjustAmount} onChange={e => setAdjustAmount(e.target.value)} />
            </div>
            {adjustAmount !== "" && (
              <p className="text-xs text-muted-foreground mt-1.5">New quantity will be <span className="font-semibold text-foreground">{previewQty}</span></p>
            )}
          </FieldRow>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Reason">
              <Select value={reason} onValueChange={setReason}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cycle_count">Cycle count</SelectItem>
                  <SelectItem value="damage">Damage</SelectItem>
                  <SelectItem value="loss">Loss / Shrinkage</SelectItem>
                  <SelectItem value="correction">Correction</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
            <FieldRow label="Batch (optional)">
              <Select value={batchId || "none"} onValueChange={v => setBatchId(v === "none" ? "" : v)}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific batch</SelectItem>
                  {eligibleBatches.map(b => (
                    <SelectItem key={b.id} value={b.id} title={`${b.batchNumber} — ${b.remainingQuantity}/${b.quantity} — ${b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : "no expiry"}`}>
                      {b.batchNumber} — {b.remainingQuantity}/{b.quantity} — {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : "no expiry"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          </div>
          <FieldRow label="Notes">
            <Textarea className="resize-none text-sm h-16" placeholder="Optional…" value={notes} onChange={e => setNotes(e.target.value)} />
          </FieldRow>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <Button className="w-full gradient-primary text-primary-foreground border-0 shadow-glow" onClick={handleSave} disabled={saving || adjustAmount === ""}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Save adjustment
        </Button>
        <button type="button" onClick={() => { onClose(); navigate({ to: "/supplier-returns" }); }}
          className="text-xs text-muted-foreground hover:text-primary hover:underline text-center w-full border-t border-border/40 pt-3 -mt-1">
          Need to return stock to a supplier? That's done from a warehouse — go to Supplier Returns
        </button>
      </DialogContent>
    </Dialog>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

type StockItem = InventoryStock & {
  branchName?: string;
  supplierId?: string;
  expiryDate?: string;
};

// ─── Export ───────────────────────────────────────────────────────────────────

function exportCSV(data: StockItem[]) {
  const rows: string[][] = [
    ["Product", "SKU", "Barcode", "Category", "Branch", "Qty", "Reorder Level", "Stock Status", "Expiry Date", "Cost Price (SAR)", "Selling Price (SAR)", "VAT %", "Custom Fee (SAR)"],
    ...data.map(s => [
      s.product?.name ?? "",
      s.product?.sku ?? "",
      s.product?.barcode ?? "",
      s.product?.category?.name ?? "",
      s.branch?.name ?? "",
      String(s.quantity),
      String(s.reorderLevel),
      s.quantity === 0 ? "Out of Stock" : s.quantity <= s.reorderLevel ? "Low" : "In Stock",
      s.expiryDate ? new Date(s.expiryDate).toISOString().slice(0, 10) : "",
      s.product?.costPrice != null ? s.product.costPrice.toFixed(2) : "",
      s.product?.basePrice != null ? s.product.basePrice.toFixed(2) : "",
      String(s.product?.taxPercentage ?? 15),
      String(s.product?.customFee ?? 0),
    ]),
  ];
  const csv = rows.map(r => r.map(c => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
  a.download = `inventory-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function Inventory() {
  const { user } = useAuth();
  const { canCreate, canEdit, canDelete } = usePermission("Inventory");
  const navigate = useNavigate();
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;

  const [stock, setStock] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [branchFilter, setBranchFilter] = useState(lockedBranchId ?? "all");
  const [expiryFrom, setExpiryFrom] = useState("");
  const [expiryTo, setExpiryTo] = useState("");

  const [viewItem, setViewItem] = useState<StockItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null);
  const [editItem, setEditItem] = useState<StockItem | null>(null);
  const [deleteItem, setDeleteItem] = useState<StockItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [allBatches, setAllBatches] = useState<InventoryBatch[]>([]);
  // Mirror of allBatches readable synchronously inside load() — lets a refetch whose
  // getBatches call failed re-enrich rows from the previous batch list instead of blanking.
  const allBatchesRef = useRef<InventoryBatch[]>([]);
  const [loadError, setLoadError] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [incomingTransfers, setIncomingTransfers] = useState<StockTransfer[]>([]);
  const [receiveTransferTarget, setReceiveTransferTarget] = useState<StockTransfer | null>(null);

  // Only meaningful once a single branch is in view — a locked branch-scoped user, or an admin
  // who's picked one in the filter. "All branches" has no single destination to receive against.
  const effectiveBranchId = lockedBranchId ?? (branchFilter !== "all" ? branchFilter : null);

  const loadIncomingTransfers = () => {
    if (!effectiveBranchId) { setIncomingTransfers([]); return; }
    api.getStockTransfers({ status: "in_transit" })
      .then(all => setIncomingTransfers(all.filter(t => t.destBranchId === effectiveBranchId)))
      .catch(() => {});
  };
  useEffect(loadIncomingTransfers, [effectiveBranchId]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = () => {
    setLoading(true);
    // Batches load WITH the main batch so expiry data is on the rows at first paint —
    // previously it was enriched after an extra round-trip, so every load had a window
    // where "EXPIRED (BLOCKED): 0" / blank Expiry columns showed over real data, and a
    // failed getBatches left it that way until a manual reload (86eyag3ny). allSettled +
    // per-result application: one failed call keeps its previous data instead of zeroing
    // the whole page. Keeps the full batch array around too (not just the earliest-expiry
    // rollup) so each row's expand affordance can show every batch without a per-row fetch.
    Promise.allSettled([
      api.getStock({ branchId: lockedBranchId ?? undefined }),
      api.getCategories(),
      api.getBranches(),
      api.getWarehouses(),
      api.getSuppliers(),
      api.getBatches(),
    ])
      .then((results) => {
        const [s, c, b, w, sup, batches] = results;
        if (c.status === "fulfilled") setCategories(c.value);
        if (b.status === "fulfilled") setBranches(b.value);
        if (w.status === "fulfilled") setWarehouses(w.value);
        if (sup.status === "fulfilled") setSuppliers(sup.value);
        if (batches.status === "fulfilled") {
          allBatchesRef.current = batches.value;
          setAllBatches(batches.value);
        }
        if (s.status === "fulfilled") {
          // Enrich from the freshest batch list we have — this fetch's, or the previous
          // one's when getBatches failed — so a refetch (e.g. after a Stock-In elsewhere)
          // never reverts already-correct expiry data to blank.
          const expiryMap = new Map<string, string>();
          allBatchesRef.current.forEach(batch => {
            if (!batch.expiryDate || batch.remainingQuantity <= 0) return;
            const key = `${batch.productId}:${batch.branchId}`;
            const existing = expiryMap.get(key);
            if (!existing || new Date(batch.expiryDate) < new Date(existing)) {
              expiryMap.set(key, batch.expiryDate);
            }
          });
          setStock((s.value as StockItem[]).map(item => ({
            ...item,
            expiryDate: expiryMap.get(`${item.productId}:${item.branchId}`) ?? item.expiryDate,
          })));
        }
        setLoadError(results.some(r => r.status === "rejected"));
      })
      .finally(() => setLoading(false));
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [lockedBranchId]);
  useEffect(() => {
    if (lockedBranchId) setBranchFilter(lockedBranchId);
  }, [lockedBranchId]);

  async function handleDeleteStock() {
    if (!deleteItem) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.deleteInventoryStock(deleteItem.id);
      toast.success("Inventory record deleted");
      setDeleteItem(null);
      load();
    } catch (e) {
      // Backend message already explains the fix (transfer the stock out first) — surface it
      // as-is instead of a generic failure toast, since this is an expected/actionable outcome,
      // not a bug.
      setDeleteError(e instanceof Error ? e.message : "Cannot delete this inventory record.");
    } finally {
      setDeleting(false);
    }
  }

  const filtered = useMemo(() => stock.filter(s => {
    const mq = !q || (s.product?.name?.toLowerCase().includes(q.toLowerCase()) || s.product?.sku?.toLowerCase().includes(q.toLowerCase()) || s.product?.barcode?.toLowerCase().includes(q.toLowerCase()));
    const mc = categoryFilter === "all" || s.product?.category?.name === categoryFilter;
    const mb = branchFilter === "all" || s.branchId === branchFilter;
    const mef = !expiryFrom || (!!s.expiryDate && s.expiryDate >= expiryFrom);
    const met = !expiryTo || (!!s.expiryDate && s.expiryDate <= expiryTo + "T23:59:59");
    return mq && mc && mb && mef && met;
  }), [stock, q, categoryFilter, branchFilter, expiryFrom, expiryTo]);

  // Metrics
  const totalSKUs = stock.length;
  const lowStockItems = stock.filter(s => s.quantity > 0 && s.quantity <= s.reorderLevel);
  // "Critical" = out of stock — matches the Dashboard's outOfStockCount so the
  // same word doesn't mean different thresholds on different screens.
  const criticalCount = stock.filter(s => s.quantity === 0).length;
  const expiringSoon = stock.filter(s => { const d = daysLeft(s.expiryDate); return d !== null && d >= 0 && d <= 7; });
  const outOfStock = stock.filter(s => s.quantity === 0);
  const fastMoving = stock.filter(s => s.quantity >= s.reorderLevel * 3);
  const slowMoving = stock.filter(s => s.quantity > s.reorderLevel && s.quantity < s.reorderLevel * 3);
  const expired = stock.filter(s => { const d = daysLeft(s.expiryDate); return d !== null && d < 0; });
  const inventoryValue = stock.reduce((sum, s) => sum + s.quantity * (s.product?.costPrice ?? 0), 0);

  return (
    <PageShell
      title="Inventory"
      subtitle="Catalog · stock · VAT · custom fees"
      actions={
        <div className="flex gap-2">
          {canCreate && (
            <Button variant="outline" className="h-9 gap-1.5" onClick={() => setReceiveOpen(true)} disabled={!effectiveBranchId}
              title={!effectiveBranchId ? "Select a branch to receive stock into" : undefined}>
              <Package className="h-4 w-4" />Receive Stock
            </Button>
          )}
          {canCreate && (
            <Button className="gradient-primary text-primary-foreground border-0 shadow-glow h-9 gap-1.5" onClick={() => setAddOpen(true)}>
              <Plus className="h-4 w-4" />Add Product
            </Button>
          )}
        </div>
      }
    >
      {loadError && <LoadErrorBanner onRetry={load} />}
      {/* ── Alert Banners ── */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4 flex items-center gap-4">
          <CalendarClock className="h-8 w-8 text-warning shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-warning/80">Near Expiry Items</p>
            <p className="text-2xl font-black text-warning">{expiringSoon.length} SKUs</p>
            <p className="text-xs text-warning/70">Next 7 days · review now</p>
          </div>
        </div>
        <div className="rounded-2xl border border-destructive/30 bg-destructive/8 p-4 flex items-center gap-4">
          <AlertTriangle className="h-8 w-8 text-destructive shrink-0" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-destructive/80">Low Stock Items</p>
            <p className="text-2xl font-black text-destructive">{lowStockItems.length} SKUs</p>
            <p className="text-xs text-destructive/70">{criticalCount} critical · reorder soon</p>
          </div>
        </div>
      </div>

      {/* ── Metrics ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-border/60 bg-card shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Total SKUs</p>
              <p className="text-3xl font-black mt-1">{totalSKUs.toLocaleString()}</p>
            </div>
            <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center"><Boxes className="h-6 w-6 text-primary-foreground" /></div>
          </div>
        </div>
        <div className="rounded-2xl border border-warning/30 bg-warning/5 shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Low Stock</p>
              <p className="text-3xl font-black mt-1 text-warning-foreground">{lowStockItems.length}</p>
              <p className="text-xs text-destructive mt-1">↘ {criticalCount} critical</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-warning/20 flex items-center justify-center"><AlertTriangle className="h-6 w-6 text-warning" /></div>
          </div>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Expiring Soon</p>
              <p className="text-3xl font-black mt-1">{expiringSoon.length}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-orange-100 dark:bg-orange-950/40 flex items-center justify-center"><CalendarClock className="h-6 w-6 text-orange-500" /></div>
          </div>
        </div>
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 shadow-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Out of Stock</p>
              <p className="text-3xl font-black mt-1 text-destructive">{outOfStock.length}</p>
            </div>
            <div className="h-12 w-12 rounded-xl bg-destructive/15 flex items-center justify-center"><Package className="h-6 w-6 text-destructive" /></div>
          </div>
        </div>
      </div>

      {/* ── Tag Chips ── */}
      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-success/15 text-success border border-success/30 px-3 py-1.5 text-xs font-semibold">
          FAST MOVING <span className="font-black ml-1">{fastMoving.length} SKUs</span>
        </span>
        <span className="rounded-full bg-warning/15 text-warning-foreground border border-warning/30 px-3 py-1.5 text-xs font-semibold">
          SLOW MOVING <span className="font-black ml-1">{slowMoving.length} SKUs</span>
        </span>
        <span className="rounded-full bg-destructive/15 text-destructive border border-destructive/30 px-3 py-1.5 text-xs font-semibold">
          EXPIRED (BLOCKED) <span className="font-black ml-1">{expired.length} SKUs</span>
        </span>
        <span className="rounded-full bg-primary/15 text-primary border border-primary/30 px-3 py-1.5 text-xs font-semibold">
          INVENTORY VALUE <span className="font-black ml-1">{(inventoryValue / 1000).toFixed(0)} <SARIcon />k</span>
        </span>
      </div>

      {/* ── Filters + Search ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-56">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg></span>
          <Input className="h-9 pl-9 bg-muted/40" placeholder="Search by item name, SKU, barcode…" value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Categories" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map(c => <SelectItem key={c.id} value={c.name}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        {!lockedBranchId && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-40"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground whitespace-nowrap">Expiry:</span>
          <Input type="date" className="h-9 w-36" value={expiryFrom} onChange={e => setExpiryFrom(e.target.value)} title="Expiry from" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" className="h-9 w-36" value={expiryTo} onChange={e => setExpiryTo(e.target.value)} title="Expiry to" />
          {(expiryFrom || expiryTo) && (
            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground" onClick={() => { setExpiryFrom(""); setExpiryTo(""); }}>
              <ScanLine className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <Button variant="outline" className="h-9 gap-1.5 ml-auto" onClick={() => exportCSV(filtered)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" />Export ({filtered.length})
        </Button>
      </div>

      <IncomingTransfersBanner transfers={incomingTransfers} onReceive={setReceiveTransferTarget} />

      {/* ── Table ── */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center"><Loader2 className="h-5 w-5 animate-spin" />Loading inventory…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="w-8 px-2 py-3" />
                  <th className="px-3 py-3 font-semibold">Product</th>
                  <th className="px-3 py-3 font-semibold">Category</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Qty</th>
                  <th className="px-3 py-3 font-semibold">Stock</th>
                  <th className="px-3 py-3 font-semibold">Expiry</th>
                  <th className="px-3 py-3 font-semibold">Cost / Price</th>
                  <th className="px-3 py-3 font-semibold">VAT / Fee</th>
                  <th className="px-3 py-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(s => {
                  const isExpanded = expandedRow === s.id;
                  return (
                    <React.Fragment key={s.id}>
                      <tr className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                        <td className="px-2 py-3">
                          <button type="button" className="text-muted-foreground hover:text-foreground" title="Show batches"
                            onClick={() => setExpandedRow(isExpanded ? null : s.id)}>
                            {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-semibold text-sm">{s.product?.name ?? "—"}</p>
                          <p className="text-xs text-muted-foreground font-mono">{s.product?.sku} · {s.product?.barcode}</p>
                        </td>
                        <td className="px-3 py-3 text-xs">{s.product?.category?.name ?? "—"}</td>
                        <td className="px-3 py-3 text-xs">{s.branch?.name ?? "—"}</td>
                        <td className="px-3 py-3 font-bold tabular-nums">{s.quantity}</td>
                        <td className="px-3 py-3"><StockBadge qty={s.quantity} reorder={s.reorderLevel} /></td>
                        <td className="px-3 py-3"><ExpiryCell date={s.expiryDate} /></td>
                        <td className="px-3 py-3 text-xs">
                          <p className="tabular-nums text-muted-foreground">{s.product?.costPrice == null ? "—" : <><SARIcon />{fmtPrice(s.product.costPrice)}</>}</p>
                          <p className="tabular-nums font-semibold">{s.product?.basePrice == null ? "—" : <><SARIcon />{fmtPrice(s.product.basePrice)}</>}</p>
                        </td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          <p>VAT {s.product?.taxPercentage ?? 15}%</p>
                          <p>Fee: {s.product?.customFee == null ? "—" : <><SARIcon />{fmtPrice(s.product.customFee ?? 0)}</>}</p>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7" title="View" onClick={() => setViewItem(s)}><Eye className="h-3.5 w-3.5" /></Button>
                            {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" title="Edit" onClick={() => setEditItem(s)}><Pencil className="h-3.5 w-3.5" /></Button>}
                            {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" title="Adjust stock" onClick={() => setAdjustItem(s)}><LayoutGrid className="h-3.5 w-3.5" /></Button>}
                            {canDelete && (
                              <Button
                                size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive"
                                title="Delete from this branch"
                                onClick={() => {
                                  setDeleteItem(s);
                                  // Known client-side already — skip straight to the error instead of
                                  // showing a confirm prompt for a delete that's guaranteed to fail
                                  // server-side anyway. The server still re-checks on submit (defense
                                  // in depth) for the qty === 0 case, where staleness is still possible.
                                  setDeleteError(s.quantity !== 0 || (s.reservedQuantity ?? 0) !== 0
                                    ? `Cannot delete — ${s.quantity} unit(s) on hand${(s.reservedQuantity ?? 0) !== 0 ? ` (${s.reservedQuantity} reserved)` : ""} at this branch. Transfer the stock to another branch or warehouse first, then delete.`
                                    : null);
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                      {isExpanded && (
                        <BatchExpandRow productId={s.productId} locationType="branch" locationId={s.branchId} colSpan={10} batches={allBatches} aggregateQuantity={s.quantity} />
                      )}
                    </React.Fragment>
                  );
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-12 text-muted-foreground text-sm">No items found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <ReceiveStockDialog
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        warehouses={warehouses}
        branches={branches}
        destBranchId={effectiveBranchId}
        onReceive={t => { setReceiveOpen(false); setReceiveTransferTarget(t); }}
      />
      <AddProductDialog open={addOpen} onClose={() => setAddOpen(false)} categories={categories} branches={branches} onDone={load} />
      <EditProductDialog item={editItem} onClose={() => setEditItem(null)} categories={categories} onDone={load} />
      <ViewSheet item={viewItem} suppliers={suppliers} onClose={() => setViewItem(null)} />
      <AdjustDialog item={adjustItem} batches={allBatches} onClose={() => setAdjustItem(null)} onDone={load} />
      <QuickReceiveTransferSheet
        transfer={receiveTransferTarget}
        onClose={() => setReceiveTransferTarget(null)}
        onReceived={() => { setReceiveTransferTarget(null); loadIncomingTransfers(); load(); }}
      />

      <Dialog open={!!deleteItem} onOpenChange={v => { if (!v) { setDeleteItem(null); setDeleteError(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Delete Inventory Record</DialogTitle></DialogHeader>
          {deleteItem && (
            deleteError ? (
              <div className="space-y-3">
                <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <p>{deleteError}</p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => { setDeleteItem(null); setDeleteError(null); }}>Close</Button>
                  <Button
                    className="gap-1.5"
                    onClick={() => { setDeleteItem(null); setDeleteError(null); navigate({ to: "/stock-transfers" }); }}
                  >
                    <ArrowRightLeft className="h-3.5 w-3.5" /> Go to Stock Transfers
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Delete the inventory record for <span className="font-medium text-foreground">{deleteItem.product?.name ?? "this product"}</span> at{" "}
                  <span className="font-medium text-foreground">{branches.find(b => b.id === deleteItem.branchId)?.name ?? "this branch"}</span>? This only removes the (already zero) stock row from this branch's list — it doesn't affect the product itself, and a fresh row is created automatically the next time this product is received here again.
                </p>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setDeleteItem(null)} disabled={deleting}>Cancel</Button>
                  <Button variant="destructive" onClick={handleDeleteStock} disabled={deleting}>
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Delete
                  </Button>
                </div>
              </div>
            )
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
