import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MetricCard } from "@/components/metric-card";
import {
  Plus, Eye, ArrowUpDown, Package, AlertTriangle, CalendarClock, Boxes,
  ScanLine, Trash2, Loader2,
} from "lucide-react";
import { api, type InventoryStock, type Category, type Branch, type Supplier, type Warehouse, type ProductVariant } from "@/lib/api";

export const Route = createFileRoute("/_app/inventory")({ component: Inventory });

function ExpiryBadge({ date }: { date?: string | null }) {
  if (!date) return <span className="text-muted-foreground text-xs">—</span>;
  const d = new Date(date);
  const daysLeft = Math.ceil((d.getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return <Badge className="bg-destructive/15 text-destructive border-0 text-xs">Expired</Badge>;
  if (daysLeft <= 30) return <Badge className="bg-warning/20 text-warning-foreground border-0 text-xs">{daysLeft}d left</Badge>;
  return <span className="text-xs text-muted-foreground">{d.toLocaleDateString("en-SA")}</span>;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

type StockItem = InventoryStock & {
  branchName?: string;
  expiryDate?: string;
  product?: InventoryStock["product"] & { category?: string };
};

const VARIANT_TYPES = ["size", "color", "weight", "volume", "other"];
const RETURN_REASONS = ["expired", "damaged", "quality_issue", "overstock", "other"];

function Inventory() {
  const [stock, setStock] = useState<StockItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("all");
  const [branchFilter, setBranchFilter] = useState("all");
  const [viewItem, setViewItem] = useState<StockItem | null>(null);
  const [viewVariants, setViewVariants] = useState<ProductVariant[]>([]);
  const [adjustItem, setAdjustItem] = useState<StockItem | null>(null);
  const [adjustQty, setAdjustQty] = useState("");
  const [adjustType, setAdjustType] = useState("addition");
  const [adjustReason, setAdjustReason] = useState("");
  const [addProductOpen, setAddProductOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanningBarcode, setScanningBarcode] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Product form
  const [productForm, setProductForm] = useState({
    sku: "", barcode: "", name: "", nameAr: "", categoryId: "", brand: "",
    basePrice: "", costPrice: "", reorderLevel: "10", weightBased: false,
    taxPercentage: "15",
  });

  // Variants for new product
  const [variants, setVariants] = useState<{ variantType: string; variantValue: string; priceModifier: string }[]>([]);

  // Batch form
  const [batchForm, setBatchForm] = useState({
    productId: "", branchId: "", warehouseId: "", supplierId: "",
    quantity: "", purchaseCost: "", expiryDate: "", batchNumber: "",
    destType: "branch" as "branch" | "warehouse",
  });

  const load = () => {
    setLoading(true);
    Promise.all([
      api.getStock(),
      api.getCategories(),
      api.getBranches(),
      api.getSuppliers(),
      api.getWarehouses(),
    ])
      .then(([s, c, b, sup, w]) => {
        setStock(s as StockItem[]);
        setCategories(c);
        setBranches(b);
        setSuppliers(sup);
        setWarehouses(w);
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const branchNames = useMemo(() => [...new Set(stock.map(s => (s as StockItem).branchName).filter(Boolean))], [stock]);
  const categoryNames = useMemo(() => [...new Set(stock.map(s => s.product?.category).filter(Boolean))], [stock]);

  const filtered = stock.filter(s => {
    const matchQ = !q
      || s.product?.name?.toLowerCase().includes(q.toLowerCase())
      || s.product?.sku?.toLowerCase().includes(q.toLowerCase())
      || s.product?.barcode?.toLowerCase().includes(q.toLowerCase());
    const matchCat = category === "all" || s.product?.category === category;
    const matchBr = branchFilter === "all" || (s as StockItem).branchName === branchFilter;
    return matchQ && matchCat && matchBr;
  });

  const lowStock = stock.filter(s => s.quantity <= s.reorderLevel).length;
  const expiringSoon = stock.filter(s => {
    const ex = (s as StockItem).expiryDate;
    if (!ex) return false;
    return Math.ceil((new Date(ex).getTime() - Date.now()) / 86400000) <= 30;
  }).length;

  const handleAdjust = async () => {
    if (!adjustItem) return;
    setSaving(true);
    try {
      await api.adjustInventory({
        productId: adjustItem.productId, branchId: adjustItem.branchId,
        quantity: Number(adjustQty), adjustmentType: adjustType, reason: adjustReason,
      });
      setAdjustItem(null);
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleCreateProduct = async () => {
    setSaving(true);
    try {
      const product = await api.createProduct({
        sku: productForm.sku,
        barcode: productForm.barcode || undefined,
        name: productForm.name,
        nameAr: productForm.nameAr || undefined,
        categoryId: productForm.categoryId || undefined,
        brand: productForm.brand || undefined,
        basePrice: Number(productForm.basePrice),
        costPrice: Number(productForm.costPrice) || undefined,
        reorderLevel: Number(productForm.reorderLevel),
        taxPercentage: Number(productForm.taxPercentage) || 15,
        customFee: 0,
        status: "active",
        weightBased: productForm.weightBased,
      });
      // Create variants
      for (const v of variants) {
        if (v.variantType && v.variantValue) {
          await api.addProductVariant(product.id, {
            variantType: v.variantType,
            variantValue: v.variantValue,
            priceModifier: Number(v.priceModifier) || 0,
          });
        }
      }
      setAddProductOpen(false);
      setProductForm({ sku: "", barcode: "", name: "", nameAr: "", categoryId: "", brand: "", basePrice: "", costPrice: "", reorderLevel: "10", weightBased: false, taxPercentage: "15" });
      setVariants([]);
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleReceiveBatch = async () => {
    setSaving(true);
    try {
      const destBranchId = batchForm.destType === "branch" ? batchForm.branchId : branches[0]?.id ?? "";
      await api.receiveBatch({
        productId: batchForm.productId,
        branchId: destBranchId,
        supplierId: batchForm.supplierId || undefined,
        quantity: Number(batchForm.quantity),
        purchaseCost: Number(batchForm.purchaseCost) || undefined,
        expiryDate: batchForm.expiryDate || undefined,
        batchNumber: batchForm.batchNumber || `BATCH-${Date.now()}`,
      });
      setBatchOpen(false);
      setBatchForm({ productId: "", branchId: "", warehouseId: "", supplierId: "", quantity: "", purchaseCost: "", expiryDate: "", batchNumber: "", destType: "branch" });
      load();
    } catch (e) { console.error(e); } finally { setSaving(false); }
  };

  const handleViewItem = async (s: StockItem) => {
    setViewItem(s);
    if (s.productId) {
      api.getProductVariants(s.productId).then(setViewVariants).catch(() => setViewVariants([]));
    }
  };

  const startBarcodeScanning = () => {
    setScanningBarcode(true);
    setTimeout(() => barcodeRef.current?.focus(), 50);
  };

  const addVariant = () => setVariants(v => [...v, { variantType: "size", variantValue: "", priceModifier: "0" }]);
  const removeVariant = (i: number) => setVariants(v => v.filter((_, idx) => idx !== i));
  const setVariantField = (i: number, field: string, val: string) =>
    setVariants(v => v.map((item, idx) => idx === i ? { ...item, [field]: val } : item));

  const setPF = (k: keyof typeof productForm) => (val: string | boolean) =>
    setProductForm(p => ({ ...p, [k]: val }));

  return (
    <PageShell title="Inventory" subtitle="Stock levels, reorder alerts, batch tracking and product variants">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total SKUs" value={String(stock.length)} icon={Boxes} accent="primary" />
        <MetricCard label="Low Stock" value={String(lowStock)} icon={AlertTriangle} accent="warning" />
        <MetricCard label="Expiring Soon" value={String(expiringSoon)} icon={CalendarClock} accent="destructive" />
        <MetricCard label="Total Units" value={stock.reduce((a, s) => a + s.quantity, 0).toLocaleString()} icon={Package} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search SKU, name, barcode…" className="h-9 w-56 flex-shrink-0" />
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categoryNames.map(c => <SelectItem key={c!} value={c!}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={branchFilter} onValueChange={setBranchFilter}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Branch" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Branches</SelectItem>
            {branchNames.map(b => <SelectItem key={b!} value={b!}>{b}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => setAddProductOpen(true)}>
          <Plus className="h-4 w-4" /> Add Product
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => setBatchOpen(true)}>
          <ArrowUpDown className="h-4 w-4" /> Receive Batch
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Product</th>
                  <th className="px-3 py-3 font-semibold">SKU</th>
                  <th className="px-3 py-3 font-semibold">Category</th>
                  <th className="px-3 py-3 font-semibold">Qty</th>
                  <th className="px-3 py-3 font-semibold">Reorder</th>
                  <th className="px-3 py-3 font-semibold">Cost</th>
                  <th className="px-3 py-3 font-semibold">Price</th>
                  <th className="px-3 py-3 font-semibold">Expiry</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className={`border-b border-border/40 hover:bg-muted/30 last:border-0 ${s.quantity <= s.reorderLevel ? "bg-warning/5" : ""}`}>
                    <td className="px-3 py-3">
                      <p className="font-semibold">{s.product?.name ?? "—"}</p>
                      <p className="text-xs text-muted-foreground font-mono">{s.product?.barcode ?? ""}</p>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">{s.product?.sku ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{s.product?.category ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className={`tabular-nums font-bold ${s.quantity <= s.reorderLevel ? "text-destructive" : ""}`}>{s.quantity}</span>
                      {s.product?.weightBased && <span className="text-[10px] text-muted-foreground ml-1">kg</span>}
                    </td>
                    <td className="px-3 py-3 tabular-nums text-xs">{s.reorderLevel}</td>
                    <td className="px-3 py-3 tabular-nums text-xs">{s.product?.costPrice != null ? `SAR ${s.product.costPrice.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3 tabular-nums text-xs">{s.product?.basePrice != null ? `SAR ${s.product.basePrice.toFixed(2)}` : "—"}</td>
                    <td className="px-3 py-3"><ExpiryBadge date={(s as StockItem).expiryDate} /></td>
                    <td className="px-3 py-3 text-xs">{(s as StockItem).branchName ?? "—"}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleViewItem(s)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" title="Adjust Stock" onClick={() => { setAdjustItem(s); setAdjustQty(""); setAdjustType("addition"); setAdjustReason(""); }}><ArrowUpDown className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={10} className="text-center py-10 text-muted-foreground text-sm">No items found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── View Details Sheet ── */}
      <Sheet open={!!viewItem} onOpenChange={v => !v && setViewItem(null)}>
        <SheetContent className="w-[440px]">
          <SheetHeader><SheetTitle>{viewItem?.product?.name ?? "Item Details"}</SheetTitle></SheetHeader>
          {viewItem && (
            <Tabs defaultValue="details" className="mt-4">
              <TabsList><TabsTrigger value="details">Details</TabsTrigger><TabsTrigger value="variants">Variants ({viewVariants.length})</TabsTrigger></TabsList>
              <TabsContent value="details" className="mt-4 space-y-3 text-sm">
                <Row label="SKU" value={viewItem.product?.sku ?? "—"} />
                <Row label="Barcode" value={viewItem.product?.barcode ?? "—"} />
                <Row label="Category" value={viewItem.product?.category ?? "—"} />
                <Row label="Type" value={viewItem.product?.weightBased ? "Weight-based (kg/litre)" : "Unit-based"} />
                <Row label="Quantity" value={String(viewItem.quantity)} />
                <Row label="Reorder Level" value={String(viewItem.reorderLevel)} />
                <Row label="Cost Price" value={viewItem.product?.costPrice != null ? `SAR ${viewItem.product.costPrice.toFixed(2)}` : "—"} />
                <Row label="Base Price" value={viewItem.product?.basePrice != null ? `SAR ${viewItem.product.basePrice.toFixed(2)}` : "—"} />
                <Row label="Expiry" value={(viewItem as StockItem).expiryDate ? new Date((viewItem as StockItem).expiryDate!).toLocaleDateString("en-SA") : "—"} />
                <Row label="Branch" value={(viewItem as StockItem).branchName ?? "—"} />
              </TabsContent>
              <TabsContent value="variants" className="mt-4">
                {viewVariants.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No variants defined for this product.</p>
                ) : (
                  <div className="space-y-2">
                    {viewVariants.map(v => (
                      <div key={v.id} className="flex items-center justify-between rounded-xl border border-border/40 p-3 text-sm">
                        <div>
                          <span className="capitalize text-xs text-muted-foreground">{v.variantType}</span>
                          <p className="font-semibold">{v.variantValue}</p>
                          {v.barcode && <p className="text-xs font-mono text-muted-foreground">{v.barcode}</p>}
                        </div>
                        <div className="text-right text-xs">
                          {v.priceModifier !== 0 && (
                            <span className={v.priceModifier > 0 ? "text-success" : "text-destructive"}>
                              {v.priceModifier > 0 ? "+" : ""}{v.priceModifier} SAR
                            </span>
                          )}
                          <Badge variant="outline" className="ml-2 text-[10px]">{v.status}</Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Adjust Stock Sheet ── */}
      <Sheet open={!!adjustItem} onOpenChange={v => !v && setAdjustItem(null)}>
        <SheetContent className="w-[400px]">
          <SheetHeader><SheetTitle>Adjust Stock — {adjustItem?.product?.name}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Adjustment Type</Label>
              <Select value={adjustType} onValueChange={setAdjustType}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="addition">Add Stock</SelectItem>
                  <SelectItem value="reduction">Remove Stock</SelectItem>
                  <SelectItem value="damage">Damaged / Write-off</SelectItem>
                  <SelectItem value="return_to_supplier">Return to Supplier</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {adjustType === "damage" && (
              <div className="space-y-1">
                <Label className="text-xs">Damage Reason</Label>
                <Select value={adjustReason} onValueChange={setAdjustReason}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {RETURN_REASONS.map(r => <SelectItem key={r} value={r}>{r.replace(/_/g, " ")}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs">Quantity</Label>
              <Input type="number" value={adjustQty} onChange={e => setAdjustQty(e.target.value)} className="h-9" placeholder="0" />
            </div>
            {adjustType !== "damage" && (
              <div className="space-y-1">
                <Label className="text-xs">Reason (optional)</Label>
                <Input value={adjustReason} onChange={e => setAdjustReason(e.target.value)} className="h-9" placeholder="e.g. Damaged on delivery" />
              </div>
            )}
            <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={handleAdjust} disabled={saving}>
              {saving ? "Saving…" : "Save Adjustment"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Add Product Sheet ── */}
      <Sheet open={addProductOpen} onOpenChange={v => !v && setAddProductOpen(false)}>
        <SheetContent className="w-[520px] overflow-y-auto">
          <SheetHeader><SheetTitle>Add Product</SheetTitle></SheetHeader>
          <Tabs defaultValue="basic" className="mt-4">
            <TabsList className="w-full">
              <TabsTrigger value="basic" className="flex-1">Basic Info</TabsTrigger>
              <TabsTrigger value="pricing" className="flex-1">Pricing</TabsTrigger>
              <TabsTrigger value="variants" className="flex-1">Variants</TabsTrigger>
            </TabsList>

            {/* ── Basic Info ── */}
            <TabsContent value="basic" className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">SKU *</Label>
                  <Input value={productForm.sku} onChange={e => setPF("sku")(e.target.value)} className="h-9" placeholder="SKU-001" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Barcode</Label>
                  <div className="flex gap-1">
                    <Input
                      ref={barcodeRef}
                      value={productForm.barcode}
                      onChange={e => setPF("barcode")(e.target.value)}
                      onBlur={() => setScanningBarcode(false)}
                      className={`h-9 flex-1 ${scanningBarcode ? "border-primary ring-1 ring-primary" : ""}`}
                      placeholder={scanningBarcode ? "Scan now…" : "Barcode"}
                    />
                    <Button
                      type="button" size="icon" variant={scanningBarcode ? "default" : "outline"}
                      className={`h-9 w-9 shrink-0 ${scanningBarcode ? "gradient-primary text-primary-foreground border-0" : ""}`}
                      onClick={startBarcodeScanning} title="Click to focus and scan barcode"
                    >
                      <ScanLine className="h-4 w-4" />
                    </Button>
                  </div>
                  {scanningBarcode && <p className="text-[11px] text-primary">Scan barcode now or type it in…</p>}
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs">Product Name (English) *</Label>
                <Input value={productForm.name} onChange={e => setPF("name")(e.target.value)} className="h-9" placeholder="e.g. Full Cream Milk 1L" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Product Name (Arabic)</Label>
                <Input value={productForm.nameAr} onChange={e => setPF("nameAr")(e.target.value)} className="h-9 text-right" placeholder="اسم المنتج بالعربية" dir="rtl" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select value={productForm.categoryId} onValueChange={v => setPF("categoryId")(v)}>
                    <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
                    <SelectContent>
                      {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Brand</Label>
                  <Input value={productForm.brand} onChange={e => setPF("brand")(e.target.value)} className="h-9" placeholder="e.g. Almarai" />
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-xl border border-border/60 p-3">
                <input
                  type="checkbox" id="weightBased" checked={productForm.weightBased as boolean}
                  onChange={e => setPF("weightBased")(e.target.checked)}
                  className="h-4 w-4 rounded"
                />
                <div>
                  <Label htmlFor="weightBased" className="text-sm cursor-pointer">Weight / Volume Based</Label>
                  <p className="text-[11px] text-muted-foreground">e.g. sold by kg, litre — bakery items, bulk products</p>
                </div>
              </div>
            </TabsContent>

            {/* ── Pricing ── */}
            <TabsContent value="pricing" className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Selling Price (SAR) *</Label>
                  <Input type="number" value={productForm.basePrice} onChange={e => setPF("basePrice")(e.target.value)} className="h-9" placeholder="0.00" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Cost Price (SAR)</Label>
                  <Input type="number" value={productForm.costPrice} onChange={e => setPF("costPrice")(e.target.value)} className="h-9" placeholder="0.00" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">VAT %</Label>
                  <Select value={productForm.taxPercentage} onValueChange={v => setPF("taxPercentage")(v)}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">0% (Exempt)</SelectItem>
                      <SelectItem value="5">5%</SelectItem>
                      <SelectItem value="15">15% (Standard)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Reorder Level</Label>
                  <Input type="number" value={productForm.reorderLevel} onChange={e => setPF("reorderLevel")(e.target.value)} className="h-9" />
                </div>
              </div>
              {productForm.basePrice && productForm.costPrice && (
                <div className="rounded-xl bg-success/10 border border-success/20 p-3 text-sm">
                  <p className="font-semibold text-success">
                    Margin: SAR {(Number(productForm.basePrice) - Number(productForm.costPrice)).toFixed(2)}
                    <span className="text-xs font-normal ml-2 text-muted-foreground">
                      ({productForm.costPrice ? Math.round(((Number(productForm.basePrice) - Number(productForm.costPrice)) / Number(productForm.basePrice)) * 100) : 0}%)
                    </span>
                  </p>
                </div>
              )}
            </TabsContent>

            {/* ── Variants ── */}
            <TabsContent value="variants" className="mt-4 space-y-3">
              <p className="text-xs text-muted-foreground">Define size/color/weight variations. Each variant can have its own barcode and price modifier.</p>
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_80px_32px] gap-2 items-end">
                    <div className="space-y-1">
                      <Label className="text-xs">Type</Label>
                      <Select value={v.variantType} onValueChange={val => setVariantField(i, "variantType", val)}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {VARIANT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Value</Label>
                      <Input
                        value={v.variantValue}
                        onChange={e => setVariantField(i, "variantValue", e.target.value)}
                        className="h-9" placeholder={
                          v.variantType === "size" ? "Small / Medium / Large" :
                          v.variantType === "color" ? "Red / Blue" :
                          v.variantType === "weight" ? "500g / 1kg" :
                          v.variantType === "volume" ? "250ml / 1L" : "Value"
                        }
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Price ±</Label>
                      <Input type="number" value={v.priceModifier} onChange={e => setVariantField(i, "priceModifier", e.target.value)} className="h-9" placeholder="0" />
                    </div>
                    <Button size="icon" variant="ghost" className="h-9 w-8 text-destructive" onClick={() => removeVariant(i)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button variant="outline" size="sm" className="gap-1.5" onClick={addVariant}>
                <Plus className="h-3.5 w-3.5" /> Add Variant
              </Button>
              {variants.length > 0 && (
                <p className="text-[11px] text-muted-foreground">Barcodes for each variant will be auto-generated. You can update them after creation.</p>
              )}
            </TabsContent>
          </Tabs>

          <div className="mt-6 pt-4 border-t border-border/40">
            <Button
              className="w-full gradient-primary text-primary-foreground border-0"
              onClick={handleCreateProduct}
              disabled={saving || !productForm.sku || !productForm.name || !productForm.basePrice}
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Creating…</> : "Create Product"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* ── Receive Batch Sheet ── */}
      <Sheet open={batchOpen} onOpenChange={v => !v && setBatchOpen(false)}>
        <SheetContent className="w-[460px]">
          <SheetHeader><SheetTitle>Receive Batch</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-3">
            <div className="space-y-1">
              <Label className="text-xs">Product *</Label>
              <Select value={batchForm.productId} onValueChange={v => setBatchForm(p => ({ ...p, productId: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select product" /></SelectTrigger>
                <SelectContent>
                  {[...new Map(stock.map(s => [s.productId, s.product])).entries()].map(([id, p]) => (
                    <SelectItem key={id} value={id}>{p?.name ?? id}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Destination Type</Label>
              <div className="flex rounded-lg border border-border/60 overflow-hidden">
                {(["branch", "warehouse"] as const).map(type => (
                  <button
                    key={type}
                    onClick={() => setBatchForm(p => ({ ...p, destType: type }))}
                    className={`flex-1 py-2 text-sm capitalize transition-colors ${batchForm.destType === type ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted/50"}`}
                  >
                    {type === "branch" ? "Branch (Mart)" : "Warehouse"}
                  </button>
                ))}
              </div>
            </div>

            {batchForm.destType === "branch" ? (
              <div className="space-y-1">
                <Label className="text-xs">Branch *</Label>
                <Select value={batchForm.branchId} onValueChange={v => setBatchForm(p => ({ ...p, branchId: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                  <SelectContent>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="space-y-1">
                <Label className="text-xs">Warehouse *</Label>
                <Select value={batchForm.warehouseId} onValueChange={v => setBatchForm(p => ({ ...p, warehouseId: v }))}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name} ({w.code})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs">Supplier (optional)</Label>
              <Select value={batchForm.supplierId} onValueChange={v => setBatchForm(p => ({ ...p, supplierId: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Quantity *</Label><Input type="number" value={batchForm.quantity} onChange={e => setBatchForm(p => ({ ...p, quantity: e.target.value }))} className="h-9" /></div>
              <div className="space-y-1"><Label className="text-xs">Purchase Cost (SAR)</Label><Input type="number" value={batchForm.purchaseCost} onChange={e => setBatchForm(p => ({ ...p, purchaseCost: e.target.value }))} className="h-9" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label className="text-xs">Expiry Date</Label><Input type="date" value={batchForm.expiryDate} onChange={e => setBatchForm(p => ({ ...p, expiryDate: e.target.value }))} className="h-9" /></div>
              <div className="space-y-1"><Label className="text-xs">Batch #</Label><Input value={batchForm.batchNumber} onChange={e => setBatchForm(p => ({ ...p, batchNumber: e.target.value }))} className="h-9" placeholder="Optional" /></div>
            </div>
            <Button
              className="w-full gradient-primary text-primary-foreground border-0"
              onClick={handleReceiveBatch}
              disabled={saving || !batchForm.productId || !batchForm.quantity || (batchForm.destType === "branch" ? !batchForm.branchId : !batchForm.warehouseId)}
            >
              {saving ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Saving…</> : "Receive Batch"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}

