import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import { api, type Product, type Supplier } from "@/lib/api";
import { wholeUnitQuantityError } from "@/lib/utils";

// Standalone batch creation — independent of any receiving flow (PO/transfer). Shared by Batch
// Tracking (global, either location type) and the Warehouse/Branch detail pages (locked to that
// one location), which is why lockedLocationId hides the location picker instead of this being
// two separate components.
export function NewBatchDialog({
  open, onOpenChange, locationType, locations, lockedLocationId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  locationType: "branch" | "warehouse";
  locations: { id: string; name: string }[];
  lockedLocationId: string | null;
  onCreated: () => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [productId, setProductId] = useState("");
  const [locationId, setLocationId] = useState(lockedLocationId ?? "");
  const [batchNumber, setBatchNumber] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [purchaseCost, setPurchaseCost] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [notes, setNotes] = useState("");
  const [damagedOrReturnReason, setDamagedOrReturnReason] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    api.getProducts().then(setProducts).catch(() => {});
    api.getSuppliers().then(setSuppliers).catch(() => {});
    setLocationId(lockedLocationId ?? "");
  }, [open, lockedLocationId]);

  function reset() {
    setProductId(""); setBatchNumber(""); setQuantity("1"); setPurchaseCost("");
    setExpiryDate(""); setSupplierId(""); setNotes(""); setDamagedOrReturnReason("");
  }

  const product = products.find(p => p.id === productId) ?? null;
  const qtyError = product ? wholeUnitQuantityError(product, Number(quantity)) : null;
  const isPastExpiry = !!expiryDate && new Date(expiryDate) < new Date(new Date().toDateString());

  async function handleSave() {
    if (!productId || !locationId || !quantity) { toast.error("Product, location and quantity are required."); return; }
    if (!expiryDate) { toast.error("Expiry date is required."); return; }
    if (qtyError) { toast.error(qtyError); return; }
    if (isPastExpiry && !damagedOrReturnReason.trim()) {
      toast.error("Expiry date is in the past — provide a damaged/return reason to log it as write-off stock.");
      return;
    }
    setSaving(true);
    try {
      await api.receiveBatch({
        productId,
        branchId: locationType === "branch" ? locationId : undefined,
        warehouseId: locationType === "warehouse" ? locationId : undefined,
        quantity: Number(quantity),
        purchaseCost: purchaseCost ? Number(purchaseCost) : undefined,
        expiryDate: expiryDate || undefined,
        batchNumber: batchNumber || undefined,
        supplierId: supplierId || undefined,
        notes: notes || undefined,
        damagedOrReturnReason: damagedOrReturnReason || undefined,
      });
      toast.success(`Batch created — ${product?.name ?? "product"} +${quantity} units`);
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create batch.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary" /> New Batch</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div>
            <Label>Product *</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select a product…" /></SelectTrigger>
              <SelectContent>
                {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name} · {p.sku}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {!lockedLocationId && (
            <div>
              <Label>{locationType === "branch" ? "Branch" : "Warehouse"} *</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger className="h-9"><SelectValue placeholder={`Select ${locationType}…`} /></SelectTrigger>
                <SelectContent>
                  {locations.map(l => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Quantity *</Label>
              <Input
                type="number" min="1" step={product?.weightBased ? "0.001" : "1"}
                className={`h-9 ${qtyError ? "border-destructive ring-1 ring-destructive" : ""}`}
                value={quantity} onChange={e => setQuantity(e.target.value)}
              />
              {qtyError && <p className="text-[10px] text-destructive leading-tight mt-0.5">Must be a whole number</p>}
            </div>
            <div>
              <Label>Purchase Cost (SAR)</Label>
              <Input type="number" min="0" step="0.01" className="h-9" value={purchaseCost} onChange={e => setPurchaseCost(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Batch Number</Label>
              <Input className="h-9" placeholder="Auto-generated" value={batchNumber} onChange={e => setBatchNumber(e.target.value)} />
            </div>
            <div>
              <Label>Expiry Date *</Label>
              <Input type="date" className="h-9" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Supplier</Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier (optional)…" /></SelectTrigger>
              <SelectContent>
                {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {isPastExpiry && (
            <div>
              <Label>Damaged/Return Reason *</Label>
              <Input className="h-9" placeholder="e.g. damaged shipment, supplier return" value={damagedOrReturnReason} onChange={e => setDamagedOrReturnReason(e.target.value)} />
              <p className="text-[10px] text-muted-foreground mt-0.5">Required because the expiry date is in the past — this logs it as write-off stock, not resalable inventory.</p>
            </div>
          )}

          <div>
            <Label>Notes</Label>
            <Textarea className="min-h-[60px] text-sm" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="gradient-primary text-primary-foreground border-0" disabled={saving} onClick={handleSave}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Batch
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
