import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FileText, Package, DollarSign, CheckCircle, Truck, Plus, Trash2, Eye, CreditCard, Loader2, ShoppingCart, AlertCircle, X } from "lucide-react";
import { api, type PurchaseOrder, type PurchaseOrderItem, type Supplier, type Warehouse, type Product } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { SARIcon, fmtSAR } from "@/lib/currency";

export const Route = createFileRoute("/_app/purchase-orders")({ component: PurchaseOrders });

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-SA", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Badge maps ──────────────────────────────────────────────────────────────

const STATUS_MAP: Record<string, { label: string; cls: string }> = {
  draft:            { label: "Draft",              cls: "bg-muted text-muted-foreground border-border" },
  pending_approval: { label: "Pending Approval",   cls: "bg-warning/20 text-warning-foreground border-warning/40" },
  approved:         { label: "Approved",           cls: "bg-success/15 text-success border-success/30" },
  sent:             { label: "Sent to Supplier",   cls: "bg-primary/15 text-primary border-primary/30" },
  partial_received: { label: "Partially Received", cls: "bg-warning/20 text-warning-foreground border-warning/40" },
  fully_received:   { label: "Fully Received",     cls: "bg-success/15 text-success border-success/30" },
  cancelled:        { label: "Cancelled",          cls: "bg-destructive/15 text-destructive border-destructive/30" },
};

const PAY_MAP: Record<string, { label: string; cls: string }> = {
  unpaid:          { label: "Unpaid",          cls: "bg-destructive/15 text-destructive border-destructive/30" },
  partial:         { label: "Partially Paid",  cls: "bg-warning/20 text-warning-foreground border-warning/40" },
  partially_paid:  { label: "Partially Paid",  cls: "bg-warning/20 text-warning-foreground border-warning/40" },
  paid:            { label: "Paid",            cls: "bg-success/15 text-success border-success/30" },
  supplier_credit: { label: "Supplier Credit", cls: "bg-primary/15 text-primary border-primary/30" },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

function PayBadge({ status }: { status: string }) {
  const s = PAY_MAP[status] ?? { label: status, cls: "bg-muted text-muted-foreground border-border" };
  return <Badge variant="outline" className={`text-xs ${s.cls}`}>{s.label}</Badge>;
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label className="text-xs font-medium">{label}</Label>{children}</div>;
}

// ─── 5-Step Create PO Wizard ─────────────────────────────────────────────────

interface POItemDraft { productId: string; productName: string; quantity: number; unitCost: number; }
const emptyItem = (): POItemDraft => ({ productId: "", productName: "", quantity: 1, unitCost: 0 });

const TOTAL_STEPS = 5;

function StepBar({ step }: { step: number }) {
  return (
    <div className="flex gap-1 mt-1">
      {Array.from({ length: TOTAL_STEPS }, (_, i) => (
        <div
          key={i}
          className={`h-1 flex-1 rounded-full transition-colors ${i < step ? "bg-primary" : "bg-muted"}`}
        />
      ))}
    </div>
  );
}

function CreatePOWizard({
  open, onClose, suppliers, warehouses, products, onCreated,
}: {
  open: boolean; onClose: () => void;
  suppliers: Supplier[]; warehouses: Warehouse[]; products: Product[];
  onCreated: () => void;
}) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  // Step 1
  const [supplierId, setSupplierId] = useState("");
  const [supplierType, setSupplierType] = useState("Direct Supplier");
  const [paymentTerms, setPaymentTerms] = useState("Net 30");
  // Step 2
  const [warehouseId, setWarehouseId] = useState("");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  // Step 3
  const [items, setItems] = useState<POItemDraft[]>([emptyItem()]);
  // Step 4 notes
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setStep(1); setSupplierId(""); setSupplierType("Direct Supplier"); setPaymentTerms("Net 30");
    setWarehouseId(""); setExpectedDeliveryDate(""); setItems([emptyItem()]); setNotes(""); setError("");
  };

  const handleClose = () => { reset(); onClose(); };

  const addItem = () => setItems(p => [...p, emptyItem()]);
  const removeItem = (i: number) => setItems(p => p.filter((_, idx) => idx !== i));
  const setItemField = (i: number, key: keyof POItemDraft, val: string | number) =>
    setItems(p => p.map((row, idx) => idx === i ? { ...row, [key]: val } : row));

  const selectedSupplier = suppliers.find(s => s.id === supplierId);
  const selectedWarehouse = warehouses.find(w => w.id === warehouseId);
  const total = items.reduce((s, it) => s + it.quantity * it.unitCost, 0);

  const validateStep = () => {
    if (step === 1 && !supplierId) { setError("Please select a supplier."); return false; }
    if (step === 2 && !warehouseId) { setError("Please select a delivery location."); return false; }
    if (step === 3) {
      const valid = items.filter(it => it.productId && it.quantity > 0);
      if (!valid.length) { setError("Add at least one item with a product selected."); return false; }
    }
    setError("");
    return true;
  };

  const next = () => { if (validateStep()) setStep(s => s + 1); };
  const back = () => { setError(""); setStep(s => s - 1); };

  const handleSubmit = async () => {
    setSaving(true);
    setError("");
    try {
      const validItems = items.filter(it => it.productId && it.quantity > 0);
      await api.createPurchaseOrder({
        supplierId,
        warehouseId,
        paymentTerms: paymentTerms.toLowerCase().replace(/ /g, "_"),
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        notes: notes || undefined,
        orderedBy: user?.id,
        items: validItems.map(it => ({
          productId: it.productId,
          orderedQuantity: it.quantity,
          unitCost: it.unitCost,
        })) as unknown as PurchaseOrderItem[],
      });
      onCreated();
      handleClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create purchase order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => !v && handleClose()}>
      <SheetContent style={{ width: 480, maxWidth: "100vw" }} className="overflow-y-auto">
        <SheetHeader className="pb-3">
          <SheetTitle className="text-base">
            Create Purchase Order — Step {step} / {TOTAL_STEPS}
          </SheetTitle>
          <StepBar step={step} />
        </SheetHeader>

        <div className="mt-5 space-y-4 min-h-[300px]">
          {/* ── Step 1: Supplier ── */}
          {step === 1 && (
            <>
              <FieldRow label="Supplier Name *">
                <Select value={supplierId} onValueChange={setSupplierId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier…" /></SelectTrigger>
                  <SelectContent>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Supplier Type">
                <Select value={supplierType} onValueChange={setSupplierType}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Direct Supplier">Direct Supplier</SelectItem>
                    <SelectItem value="Distributor">Distributor</SelectItem>
                    <SelectItem value="Local Supplier">Local Supplier</SelectItem>
                    <SelectItem value="Manufacturer">Manufacturer</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
              {selectedSupplier && (
                <FieldRow label="Supplier Phone">
                  <Input className="h-9" value={selectedSupplier.contactNumber ?? ""} readOnly />
                </FieldRow>
              )}
              <FieldRow label="VAT / CR (optional)">
                <Input className="h-9" placeholder="e.g. 310122393500003" />
              </FieldRow>
              <FieldRow label="Payment Terms">
                <Select value={paymentTerms} onValueChange={setPaymentTerms}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Net 30">Net 30</SelectItem>
                    <SelectItem value="Net 60">Net 60</SelectItem>
                    <SelectItem value="On Delivery">On Delivery</SelectItem>
                    <SelectItem value="Immediate">Immediate</SelectItem>
                  </SelectContent>
                </Select>
              </FieldRow>
            </>
          )}

          {/* ── Step 2: Delivery ── */}
          {step === 2 && (
            <>
              <FieldRow label="Delivery Location *">
                <Select value={warehouseId} onValueChange={setWarehouseId}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select warehouse…" /></SelectTrigger>
                  <SelectContent>
                    {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FieldRow>
              <FieldRow label="Expected Delivery Date (optional)">
                <Input
                  type="date"
                  className="h-9"
                  value={expectedDeliveryDate}
                  onChange={e => setExpectedDeliveryDate(e.target.value)}
                />
              </FieldRow>
            </>
          )}

          {/* ── Step 3: Items ── */}
          {step === 3 && (
            <div className="space-y-3">
              <div className="grid grid-cols-[1fr_64px_80px_28px] gap-1.5 text-xs font-semibold text-muted-foreground uppercase px-1">
                <span>Item</span><span className="text-right">Qty</span><span className="text-right">Unit Cost (SAR)</span><span />
              </div>
              {items.map((it, i) => (
                <div key={i} className="grid grid-cols-[1fr_64px_80px_28px] gap-1.5 items-center">
                  <Select
                    value={it.productId}
                    onValueChange={v => {
                      const prod = products.find(p => p.id === v);
                      setItemField(i, "productId", v);
                      setItemField(i, "productName", prod?.name ?? "");
                      if (prod?.costPrice) setItemField(i, "unitCost", prod.costPrice);
                    }}
                  >
                    <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select product…" /></SelectTrigger>
                    <SelectContent>
                      {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number" min={1}
                    className="h-9 text-xs text-right"
                    value={it.quantity}
                    onChange={e => setItemField(i, "quantity", Number(e.target.value))}
                  />
                  <Input
                    type="number" min={0} step="0.01"
                    className="h-9 text-xs text-right"
                    value={it.unitCost}
                    onChange={e => setItemField(i, "unitCost", Number(e.target.value))}
                  />
                  <Button
                    variant="ghost" size="icon" className="h-9 w-7 text-destructive hover:text-destructive"
                    onClick={() => removeItem(i)} disabled={items.length === 1}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={addItem}>
                <Plus className="h-3.5 w-3.5" /> Add Row
              </Button>
              <div className="text-right text-sm font-semibold pt-1 border-t border-border/40">
                Total: <SARIcon />{fmt(total)}
              </div>
              <FieldRow label="Notes (optional)">
                <Textarea rows={2} className="resize-none text-sm" placeholder="Reason, handling notes…" value={notes} onChange={e => setNotes(e.target.value)} />
              </FieldRow>
            </div>
          )}

          {/* ── Step 4: Review ── */}
          {step === 4 && (
            <div className="space-y-2 text-sm">
              {[
                ["Supplier",       selectedSupplier?.name ?? "—"],
                ["Type",           supplierType],
                ["Delivery to",    selectedWarehouse?.name ?? "—"],
                ["ETA",            expectedDeliveryDate ? formatDate(expectedDeliveryDate) : "—"],
                ["Payment terms",  paymentTerms],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between border-b border-border/40 pb-2">
                  <span className="text-muted-foreground">{k}</span>
                  <span className="font-medium">{v}</span>
                </div>
              ))}
              <div className="pt-1 space-y-1.5">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
                {items.filter(it => it.productId).map((it, i) => {
                  const name = products.find(p => p.id === it.productId)?.name ?? it.productName;
                  return (
                    <div key={i} className="flex justify-between text-sm border-b border-border/30 pb-1.5">
                      <span>{name} × {it.quantity}</span>
                      <span className="font-medium"><SARIcon />{fmt(it.quantity * it.unitCost)}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between font-bold text-base pt-2">
                <span>Total</span>
                <span><SARIcon />{fmt(total)}</span>
              </div>
            </div>
          )}

          {/* ── Step 5: Submit ── */}
          {step === 5 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-success/30 bg-success/10 p-4 flex gap-3">
                <CheckCircle className="h-5 w-5 text-success shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm text-success">Ready to submit</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    On approval, a Finance payable entry is created. Inventory updates only after Goods Receiving.
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-muted/20 p-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Supplier</span><span className="font-medium">{selectedSupplier?.name ?? "—"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Items</span><span className="font-medium">{items.filter(it => it.productId).length} product(s)</span></div>
                <div className="flex justify-between border-t border-border/40 pt-2"><span className="text-muted-foreground">Order Total</span><span className="font-bold text-base"><SARIcon />{fmt(total)}</span></div>
              </div>
            </div>
          )}

          {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" />{error}</p>}
        </div>

        <div className="flex gap-2 pt-5 mt-4 border-t border-border/60">
          <Button variant="outline" className="w-24" onClick={step === 1 ? handleClose : back}>
            {step === 1 ? "Cancel" : "Back"}
          </Button>
          <div className="flex-1" />
          {step < 5 ? (
            <Button className="gradient-primary text-primary-foreground border-0 w-24" onClick={next}>Next</Button>
          ) : (
            <Button
              className="gradient-primary text-primary-foreground border-0 flex-1"
              onClick={handleSubmit}
              disabled={saving}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Submit for Approval
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Receive Goods Sheet ──────────────────────────────────────────────────────

function ReceiveSheet({ open, onClose, po, onReceived }: {
  open: boolean; onClose: () => void; po: PurchaseOrder | null; onReceived: () => void;
}) {
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [batches, setBatches] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const items = useMemo(() => (po?.items ?? []).filter(it => it.receivedQuantity < it.orderedQuantity), [po]);

  useEffect(() => {
    if (open && po) {
      const q: Record<string, number> = {};
      const e: Record<string, string> = {};
      const b: Record<string, string> = {};
      (po.items ?? []).forEach(it => {
        q[it.productId] = it.orderedQuantity - it.receivedQuantity;
        e[it.productId] = it.expiryDate ?? "";
        b[it.productId] = "";
      });
      setQtys(q); setExpiries(e); setBatches(b); setError("");
    }
  }, [open, po]);

  const handleConfirm = async () => {
    if (!po) return;
    const payload = items.filter(it => qtys[it.productId] > 0).map(it => ({
      productId: it.productId,
      quantity: qtys[it.productId],
      expiryDate: expiries[it.productId] || undefined,
      batchNumber: batches[it.productId] || undefined,
    }));
    if (!payload.length) return setError("Enter at least one quantity.");
    setSaving(true); setError("");
    try { await api.receivePurchaseOrder(po.id, payload); onReceived(); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "Failed to receive goods."); }
    finally { setSaving(false); }
  };

  if (!po) return null;
  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent style={{ width: 560, maxWidth: "100vw" }} className="overflow-y-auto">
        <SheetHeader><SheetTitle>Receive Goods — {po.poNumber}</SheetTitle></SheetHeader>
        <div className="mt-4 space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">All items fully received.</p>
          ) : (
            <div className="space-y-3">
              {items.map(it => (
                <div key={it.id} className="rounded-xl border border-border/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-sm truncate">{it.product?.name ?? it.productId}</p>
                      <p className="text-xs text-muted-foreground">
                        Ordered: {it.orderedQuantity} · Already received: {it.receivedQuantity}
                      </p>
                    </div>
                    <div className="shrink-0 space-y-1">
                      <Label className="text-[11px] font-medium">Qty Now</Label>
                      <Input type="number" min={0} max={it.orderedQuantity - it.receivedQuantity} className="h-7 w-16 text-xs text-center"
                        value={qtys[it.productId] ?? 0} onChange={e => setQtys(p => ({ ...p, [it.productId]: Number(e.target.value) }))} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">Batch Number</Label>
                      <Input className="h-7 text-xs" placeholder="Auto-generated if empty"
                        value={batches[it.productId] ?? ""} onChange={e => setBatches(p => ({ ...p, [it.productId]: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[11px] font-medium">Expiry Date</Label>
                      <Input type="date" className="h-7 text-xs"
                        value={expiries[it.productId] ?? ""} onChange={e => setExpiries(p => ({ ...p, [it.productId]: e.target.value }))} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button className="w-full gradient-primary text-primary-foreground border-0 shadow-glow" onClick={handleConfirm} disabled={saving || items.length === 0}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Confirm Receipt
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── View PO Sheet ────────────────────────────────────────────────────────────

function ViewPOSheet({ open, onClose, po, onRefresh }: {
  open: boolean; onClose: () => void; po: PurchaseOrder | null; onRefresh: () => void;
}) {
  const { user } = useAuth();
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payNotes, setPayNotes] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");
  const [raisedDns, setRaisedDns] = useState<Set<string>>(new Set());
  const [raisingDn, setRaisingDn] = useState<string | null>(null);

  // Reset raised-DN tracking when switching POs
  useEffect(() => { if (!open) setRaisedDns(new Set()); }, [open, po?.id]);

  const handleRaiseShortage = async (item: PurchaseOrderItem) => {
    const key = item.productId;
    setRaisingDn(key);
    try {
      await api.raiseShortageDebitNote({
        poId: po!.id,
        productId: item.productId,
        expectedQuantity: item.orderedQuantity,
        receivedQuantity: item.receivedQuantity,
        unitCost: item.unitCost,
      });
      setRaisedDns(prev => new Set(prev).add(key));
    } catch (e) { alert(e instanceof Error ? e.message : "Failed to raise debit note."); }
    finally { setRaisingDn(null); }
  };

  if (!po) return null;

  const handleAddPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return setPayError("Enter a valid amount.");
    setPayLoading(true); setPayError("");
    try {
      await api.addSupplierPayment(po.id, { amount, paymentMethod: payMethod, referenceNumber: payRef || undefined, paymentDate: payDate, notes: payNotes || undefined, recordedBy: user?.id });
      setPayAmount(""); setPayRef(""); setPayNotes(""); onRefresh();
    } catch (e) { setPayError(e instanceof Error ? e.message : "Failed."); }
    finally { setPayLoading(false); }
  };

  const destName = po.warehouse?.name ?? po.branch?.name ?? "—";
  const statusOrder = ["draft", "sent", "partial_received", "fully_received"];
  const currentStep = statusOrder.indexOf(po.status);

  return (
    <>
      <Sheet open={open} onOpenChange={v => !v && onClose()}>
        <SheetContent style={{ width: 560, maxWidth: "100vw" }} className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {po.poNumber}
              <StatusBadge status={po.status} />
              <PayBadge status={po.paymentStatus} />
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="grid grid-cols-4 h-8 text-xs">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="items" className="text-xs">Items</TabsTrigger>
              <TabsTrigger value="payments" className="text-xs">Payments</TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                {[
                  ["PO Number", po.poNumber], ["Created", formatDate(po.createdAt)],
                  ["Supplier", po.supplier?.name ?? "—"], ["Supplier Code", po.supplier?.supplierCode ?? "—"],
                  ["Destination", destName], ["Payment Terms", po.paymentTerms?.replace(/_/g, " ") ?? "—"],
                  ["Expected Delivery", formatDate(po.expectedDeliveryDate)], ["Received Date", formatDate(po.receivedDate)],
                ].map(([k, v]) => (
                  <div key={k}><p className="text-xs text-muted-foreground">{k}</p><p className="font-medium">{v}</p></div>
                ))}
              </div>
              <div className="rounded-lg border border-border/60 p-3 space-y-1.5">
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Total Amount</span><span className="font-semibold"><SARIcon />{fmt(po.totalAmount)}</span></div>
                <div className="flex justify-between text-sm"><span className="text-muted-foreground">Paid Amount</span><span className="font-semibold text-success"><SARIcon />{fmt(po.paidAmount)}</span></div>
                <div className="flex justify-between text-sm border-t border-border/40 pt-1.5"><span className="text-muted-foreground">Balance Due</span><span className="font-bold text-destructive"><SARIcon />{fmt(po.totalAmount - po.paidAmount)}</span></div>
              </div>
              {po.notes && <div><p className="text-xs text-muted-foreground mb-1">Notes</p><p className="text-sm bg-muted/30 rounded-lg px-3 py-2">{po.notes}</p></div>}
            </TabsContent>

            <TabsContent value="items" className="mt-4 space-y-3">
              {/* Shortage banners — derived directly from PO item data, no DB fetch needed */}
              {(() => {
                const shortfalls = (po.items ?? []).filter(it => it.orderedQuantity > it.receivedQuantity);
                if (!shortfalls.length) return null;
                return (
                  <div className="space-y-1.5">
                    {shortfalls.map(it => {
                      const shortage = it.orderedQuantity - it.receivedQuantity;
                      const value = shortage * it.unitCost;
                      const key = it.productId;
                      const done = raisedDns.has(key);
                      return (
                        <div key={it.id} className="rounded-xl border border-warning/40 bg-warning/10 px-3 py-2 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-warning-foreground">
                              ⚠ Shortage — {it.product?.name ?? it.productId}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Ordered {it.orderedQuantity} · Received {it.receivedQuantity} · Short {shortage} units · SAR {fmt(value)}
                            </p>
                          </div>
                          {done ? (
                            <span className="shrink-0 text-xs text-success font-medium">DN Raised ✓</span>
                          ) : (
                            <Button size="sm" variant="outline"
                              className="shrink-0 h-7 text-xs border-warning/60 text-warning-foreground hover:bg-warning/20"
                              disabled={raisingDn === key}
                              onClick={() => handleRaiseShortage(it)}>
                              {raisingDn === key ? <Loader2 className="h-3 w-3 animate-spin" /> : "Raise Debit Note"}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2">Product</th>
                      <th className="text-right px-2 py-2">Ordered</th>
                      <th className="text-right px-2 py-2">Received</th>
                      <th className="text-right px-2 py-2">Delta</th>
                      <th className="text-right px-2 py-2">Cost</th>
                      <th className="text-right px-2 py-2">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(po.items ?? []).map(it => {
                      const delta = it.receivedQuantity - it.orderedQuantity;
                      const hasDiscrepancy = it.receivedQuantity > 0 && it.receivedQuantity < it.orderedQuantity;
                      return (
                        <tr key={it.id} className={`border-t border-border/40 ${hasDiscrepancy ? "bg-warning/5" : ""}`}>
                          <td className="px-3 py-2">{it.product?.name ?? it.productId}</td>
                          <td className="px-2 py-2 text-right">{it.orderedQuantity}</td>
                          <td className="px-2 py-2 text-right">{it.receivedQuantity > 0 ? it.receivedQuantity : <span className="text-muted-foreground">—</span>}</td>
                          <td className="px-2 py-2 text-right">
                            {it.receivedQuantity > 0 ? (
                              <span className={delta < 0 ? "text-destructive font-semibold" : delta > 0 ? "text-success font-semibold" : "text-muted-foreground"}>
                                {delta > 0 ? "+" : ""}{delta}
                              </span>
                            ) : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{fmt(it.unitCost)}</td>
                          <td className="px-2 py-2 text-right tabular-nums font-medium">{fmt(it.subtotal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {(po.status === "sent" || po.status === "partial_received") && (
                <Button className="w-full gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setReceiveOpen(true)}>
                  <Truck className="h-4 w-4 mr-2" />{po.status === "partial_received" ? "Receive More" : "Receive Goods"}
                </Button>
              )}
            </TabsContent>

            <TabsContent value="payments" className="mt-4 space-y-4">
              <div className="space-y-2">
                {(po.payments ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No payments recorded.</p>
                ) : (
                  (po.payments ?? []).map(pay => (
                    <div key={pay.id} className="rounded-lg border border-border/60 px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium"><SARIcon />{fmt(pay.amount)}</p>
                          <p className="text-xs text-muted-foreground capitalize">{pay.paymentMethod.replace("_", " ")} · {formatDate(pay.paymentDate)}</p>
                          {pay.referenceNumber && <p className="text-xs text-muted-foreground">Ref: {pay.referenceNumber}</p>}
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pay.status === "confirmed" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>{pay.status}</span>
                      </div>
                      {pay.notes && <p className="text-xs text-muted-foreground mt-1">{pay.notes}</p>}
                    </div>
                  ))
                )}
              </div>
              {po.status !== "cancelled" && (
                <div className="rounded-lg border border-border/60 p-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Add Payment</p>
                  <div className="grid grid-cols-2 gap-2">
                    <FieldRow label="Amount (SAR) *"><Input type="number" min={0} step="0.01" className="h-9" placeholder="0.00" value={payAmount} onChange={e => setPayAmount(e.target.value)} /></FieldRow>
                    <FieldRow label="Method">
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldRow>
                    <FieldRow label="Reference"><Input className="h-9" placeholder="Ref #" value={payRef} onChange={e => setPayRef(e.target.value)} /></FieldRow>
                    <FieldRow label="Date"><Input type="date" className="h-9" value={payDate} onChange={e => setPayDate(e.target.value)} /></FieldRow>
                  </div>
                  <FieldRow label="Notes"><Textarea rows={2} className="resize-none text-sm" value={payNotes} onChange={e => setPayNotes(e.target.value)} /></FieldRow>
                  {payError && <p className="text-xs text-destructive">{payError}</p>}
                  <Button className="w-full gradient-primary text-primary-foreground border-0 shadow-glow" onClick={handleAddPayment} disabled={payLoading}>
                    {payLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}Record Payment
                  </Button>
                </div>
              )}
            </TabsContent>

            <TabsContent value="timeline" className="mt-6">
              <div className="relative pl-4">
                {statusOrder.map((step, idx) => {
                  const reached = currentStep >= idx;
                  const isCurrent = currentStep === idx && po.status !== "cancelled";
                  const label: Record<string, string> = { draft: "Draft Created", sent: "Sent to Supplier", partial_received: "Partial Receipt", fully_received: "Fully Received" };
                  return (
                    <div key={step} className="relative flex gap-3 pb-6 last:pb-0">
                      {idx < statusOrder.length - 1 && <div className={`absolute left-0 top-5 w-0.5 h-full -translate-x-1/2 ${reached ? "bg-primary" : "bg-border/60"}`} />}
                      <div className={`relative z-10 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${reached ? "bg-primary border-primary" : "bg-background border-border"} ${isCurrent ? "ring-2 ring-primary/30 ring-offset-2" : ""}`}>
                        {reached && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="pt-0.5">
                        <p className={`text-sm font-medium ${reached ? "text-foreground" : "text-muted-foreground"}`}>{label[step]}</p>
                        {step === "draft" && reached && <p className="text-xs text-muted-foreground">{formatDate(po.createdAt)}</p>}
                        {step === "fully_received" && po.receivedDate && <p className="text-xs text-muted-foreground">{formatDate(po.receivedDate)}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <ReceiveSheet open={receiveOpen} onClose={() => setReceiveOpen(false)} po={po} onReceived={() => { setReceiveOpen(false); onRefresh(); }} />
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function PurchaseOrders() {
  const { canCreate, canApprove, canDelete } = usePermission("Purchase Orders");
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [, setBranches] = useState<unknown[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getPurchaseOrders().then(setPos).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.getSuppliers().then(setSuppliers);
    api.getWarehouses().then(setWarehouses);
    api.getBranches().then(setBranches);
    api.getProducts().then(setProducts);
  }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return pos.filter(p => {
      const matchQ = !q || p.poNumber.toLowerCase().includes(q) || (p.supplier?.name ?? "").toLowerCase().includes(q);
      const mdf = !dateFrom || (!!p.createdAt && p.createdAt >= dateFrom);
      const mdt = !dateTo || (!!p.createdAt && p.createdAt <= dateTo + "T23:59:59");
      return matchQ && mdf && mdt;
    });
  }, [pos, search, dateFrom, dateTo]);

  // Metrics
  const totalPOs = pos.length;
  const outstandingPayables = pos.filter(p => p.paymentStatus !== "paid" && p.status !== "cancelled").reduce((s, p) => s + (p.totalAmount - p.paidAmount), 0);
  const supplierCredits = pos.filter(p => p.paymentStatus === "supplier_credit").reduce((s, p) => s + p.totalAmount, 0);
  const paidThisMonth = (() => {
    const now = new Date();
    return pos.filter(p => {
      const d = new Date(p.updatedAt);
      return p.paymentStatus === "paid" && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s, p) => s + p.paidAmount, 0);
  })();

  const handleSend = async (po: PurchaseOrder) => {
    setActionLoading(po.id + "_send");
    try { await api.updatePoStatus(po.id, "sent"); load(); }
    finally { setActionLoading(null); }
  };

  const handleCancel = async (po: PurchaseOrder) => {
    if (!confirm(`Cancel PO ${po.poNumber}?`)) return;
    setActionLoading(po.id + "_cancel");
    try { await api.updatePoStatus(po.id, "cancelled"); load(); }
    finally { setActionLoading(null); }
  };

  const refreshView = () => {
    load();
    if (viewPO) api.getPurchaseOrder(viewPO.id).then(setViewPO).catch(() => {});
  };

  return (
    <PageShell
      title="Purchase Orders"
      subtitle="Accounting & Finance · PO does not increase inventory until Goods Receiving"
      actions={canCreate ? (
        <Button className="gradient-primary text-primary-foreground border-0 shadow-glow h-9 gap-1.5" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" />New Purchase Order
        </Button>
      ) : undefined}
    >
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total POs"            value={String(totalPOs)}                          icon={ShoppingCart} accent="primary" />
        <MetricCard label="Outstanding Payables" value={<><SARIcon />{" "}{fmt(outstandingPayables)}</>}         icon={DollarSign}   accent="warning" />
        <MetricCard label="Supplier Credits"     value={<><SARIcon />{" "}{fmt(supplierCredits)}</>}             icon={FileText}     accent="primary" />
        <MetricCard label="Paid This Month"      value={<><SARIcon />{" "}{fmt(paidThisMonth)}</>}               icon={CheckCircle}  accent="success" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pos">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <TabsList>
            <TabsTrigger value="pos" className="gap-1.5"><FileText className="h-3.5 w-3.5" />Purchase Orders</TabsTrigger>
            <TabsTrigger value="payables" className="gap-1.5"><DollarSign className="h-3.5 w-3.5" />Supplier Payables</TabsTrigger>
            <TabsTrigger value="returns" className="gap-1.5"><Package className="h-3.5 w-3.5" />Return / Credit Entries</TabsTrigger>
          </TabsList>
          <div className="flex items-center gap-1">
            <Input className="h-9 w-48 bg-muted/50" placeholder="Search PO # or supplier…" value={search} onChange={e => setSearch(e.target.value)} />
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
        </div>

        {/* ── Purchase Orders tab ── */}
        <TabsContent value="pos" className="mt-3">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3 font-semibold">PO ID</th>
                    <th className="px-3 py-3 font-semibold">Supplier</th>
                    <th className="px-3 py-3 font-semibold">Type</th>
                    <th className="px-3 py-3 font-semibold">Delivery</th>
                    <th className="px-3 py-3 font-semibold">PO Date</th>
                    <th className="px-3 py-3 font-semibold">ETA</th>
                    <th className="px-3 py-3 font-semibold">Items</th>
                    <th className="px-3 py-3 font-semibold">Total</th>
                    <th className="px-3 py-3 font-semibold">Payment</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Approver</th>
                    <th className="px-3 py-3 font-semibold"></th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={12} className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={12} className="text-center py-12 text-muted-foreground text-sm">No purchase orders found.</td></tr>
                  ) : filtered.map(po => {
                    const dest = po.warehouse?.name ?? po.branch?.name ?? "—";
                    const supplierType = suppliers.find(s => s.id === po.supplierId)?.supplyType ?? "—";
                    const isSending = actionLoading === po.id + "_send";
                    const isCancelling = actionLoading === po.id + "_cancel";
                    return (
                      <tr key={po.id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                        <td className="px-3 py-3 font-mono font-bold text-xs">{po.poNumber}</td>
                        <td className="px-3 py-3 font-medium">{po.supplier?.name ?? "—"}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground capitalize">{supplierType.replace(/_/g, " ")}</td>
                        <td className="px-3 py-3 text-xs">{dest}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(po.createdAt)}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{formatDate(po.expectedDeliveryDate)}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{(po.items ?? []).length}</td>
                        <td className="px-3 py-3 font-semibold tabular-nums"><SARIcon />{fmt(po.totalAmount)}</td>
                        <td className="px-3 py-3"><PayBadge status={po.paymentStatus} /></td>
                        <td className="px-3 py-3"><StatusBadge status={po.status} /></td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">—</td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewPO(po)} title="View"><Eye className="h-3.5 w-3.5" /></Button>
                            {po.status === "draft" && canApprove && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => handleSend(po)} disabled={isSending}>
                                {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}Send
                              </Button>
                            )}
                            {(po.status === "sent" || po.status === "partial_received") && canApprove && (
                              <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setReceiveTarget(po)}>
                                <Package className="h-3 w-3" />{po.status === "partial_received" ? "More" : "Receive"}
                              </Button>
                            )}
                            {po.status !== "cancelled" && po.status !== "fully_received" && canDelete && (
                              <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleCancel(po)} disabled={isCancelling}>
                                {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}Cancel
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── Supplier Payables tab ── */}
        <TabsContent value="payables" className="mt-3">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3 font-semibold">Supplier</th>
                    <th className="px-3 py-3 font-semibold">PO</th>
                    <th className="px-3 py-3 font-semibold">PO Amount</th>
                    <th className="px-3 py-3 font-semibold">Paid</th>
                    <th className="px-3 py-3 font-semibold">Due</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                    <th className="px-3 py-3 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.filter(p => p.paymentStatus !== "paid" && p.status !== "cancelled").map(po => (
                    <tr key={po.id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                      <td className="px-3 py-3 font-medium">{po.supplier?.name ?? "—"}</td>
                      <td className="px-3 py-3 font-mono text-xs font-bold">{po.poNumber}</td>
                      <td className="px-3 py-3 tabular-nums"><SARIcon />{fmt(po.totalAmount)}</td>
                      <td className="px-3 py-3 tabular-nums text-success"><SARIcon />{fmt(po.paidAmount)}</td>
                      <td className="px-3 py-3 tabular-nums text-destructive font-semibold"><SARIcon />{fmt(po.totalAmount - po.paidAmount)}</td>
                      <td className="px-3 py-3"><PayBadge status={po.paymentStatus} /></td>
                      <td className="px-3 py-3">
                        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setViewPO(po)}>
                          <CreditCard className="h-3 w-3" />Pay
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {pos.filter(p => p.paymentStatus !== "paid" && p.status !== "cancelled").length === 0 && (
                    <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No outstanding payables.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* ── Return / Credit Entries tab ── */}
        <TabsContent value="returns" className="mt-3">
          <Card className="overflow-hidden border-border/60 shadow-card">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-3 py-3 font-semibold">Supplier</th>
                    <th className="px-3 py-3 font-semibold">PO</th>
                    <th className="px-3 py-3 font-semibold">Credit Amount</th>
                    <th className="px-3 py-3 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pos.filter(p => p.paymentStatus === "supplier_credit").map(po => (
                    <tr key={po.id} className="border-b border-border/40 hover:bg-muted/20 last:border-0">
                      <td className="px-3 py-3 font-medium">{po.supplier?.name ?? "—"}</td>
                      <td className="px-3 py-3 font-mono text-xs font-bold">{po.poNumber}</td>
                      <td className="px-3 py-3 tabular-nums font-semibold text-primary"><SARIcon />{fmt(po.totalAmount)}</td>
                      <td className="px-3 py-3"><PayBadge status={po.paymentStatus} /></td>
                    </tr>
                  ))}
                  {pos.filter(p => p.paymentStatus === "supplier_credit").length === 0 && (
                    <tr><td colSpan={4} className="text-center py-10 text-muted-foreground text-sm">No credit entries.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      <CreatePOWizard
        open={createOpen} onClose={() => setCreateOpen(false)}
        suppliers={suppliers} warehouses={warehouses} products={products}
        onCreated={load}
      />

      <ViewPOSheet open={!!viewPO} onClose={() => setViewPO(null)} po={viewPO} onRefresh={refreshView} />

      <ReceiveSheet open={!!receiveTarget} onClose={() => setReceiveTarget(null)} po={receiveTarget}
        onReceived={() => { setReceiveTarget(null); load(); }} />
    </PageShell>
  );
}
