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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  FileText,
  Package,
  DollarSign,
  CheckCircle,
  Clock,
  Truck,
  Plus,
  Trash2,
  Eye,
  CreditCard,
  Loader2,
} from "lucide-react";
import {
  api,
  type PurchaseOrder,
  type PurchaseOrderItem,
  type SupplierPayment,
  type Supplier,
  type Warehouse,
  type Branch,
  type Product,
} from "@/lib/api";

export const Route = createFileRoute("/_app/purchase-orders")({
  component: PurchaseOrders,
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return n.toLocaleString("en-SA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(d?: string) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-SA", { year: "numeric", month: "short", day: "numeric" });
}

// ─── Badges ─────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    sent: "bg-primary/15 text-primary",
    partial_received: "bg-warning/20 text-warning-foreground",
    fully_received: "bg-success/15 text-success",
    cancelled: "bg-destructive/15 text-destructive",
  };
  const labels: Record<string, string> = {
    draft: "Draft",
    sent: "Sent",
    partial_received: "Partial",
    fully_received: "Received",
    cancelled: "Cancelled",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {labels[status] ?? status}
    </span>
  );
}

function PaymentBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    unpaid: "bg-destructive/15 text-destructive",
    partial: "bg-warning/20 text-warning-foreground",
    paid: "bg-success/15 text-success",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── FieldRow ────────────────────────────────────────────────────────────────

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

// ─── Create PO Sheet ─────────────────────────────────────────────────────────

interface POItemDraft {
  productId: string;
  quantity: number;
  unitCost: number;
  expiryDate: string;
}

const emptyItem = (): POItemDraft => ({ productId: "", quantity: 1, unitCost: 0, expiryDate: "" });

function CreatePOSheet({
  open,
  onClose,
  suppliers,
  warehouses,
  branches,
  products,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  suppliers: Supplier[];
  warehouses: Warehouse[];
  branches: Branch[];
  products: Product[];
  onCreated: () => void;
}) {
  const [supplierId, setSupplierId] = useState("");
  const [destType, setDestType] = useState<"warehouse" | "branch">("warehouse");
  const [warehouseId, setWarehouseId] = useState("");
  const [branchId, setBranchId] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("on_delivery");
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<POItemDraft[]>([emptyItem()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setSupplierId("");
    setDestType("warehouse");
    setWarehouseId("");
    setBranchId("");
    setPaymentTerms("on_delivery");
    setExpectedDeliveryDate("");
    setNotes("");
    setItems([emptyItem()]);
    setError("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addItem = () => setItems((p) => [...p, emptyItem()]);
  const removeItem = (i: number) => setItems((p) => p.filter((_, idx) => idx !== i));
  const setItem = (i: number, key: keyof POItemDraft, val: string | number) =>
    setItems((p) => p.map((row, idx) => (idx === i ? { ...row, [key]: val } : row)));

  const total = items.reduce((s, it) => s + it.quantity * it.unitCost, 0);

  const handleCreate = async () => {
    if (!supplierId) return setError("Please select a supplier.");
    if (destType === "warehouse" && !warehouseId) return setError("Please select a warehouse.");
    if (destType === "branch" && !branchId) return setError("Please select a branch.");
    const validItems = items.filter((it) => it.productId && it.quantity > 0 && it.unitCost >= 0);
    if (!validItems.length) return setError("Add at least one valid item.");

    setSaving(true);
    setError("");
    try {
      await api.createPurchaseOrder({
        supplierId,
        warehouseId: destType === "warehouse" ? warehouseId : undefined,
        branchId: destType === "branch" ? branchId : undefined,
        paymentTerms,
        expectedDeliveryDate: expectedDeliveryDate || undefined,
        notes: notes || undefined,
        orderedBy: "system",
        items: validItems.map((it) => ({
          productId: it.productId,
          orderedQuantity: it.quantity,
          unitCost: it.unitCost,
          expiryDate: it.expiryDate || undefined,
        })) as unknown as PurchaseOrderItem[],
      });
      onCreated();
      handleClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create PO.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={(v) => !v && handleClose()}>
      <SheetContent style={{ width: 480, maxWidth: "100vw" }} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>New Purchase Order</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          <FieldRow label="Supplier *">
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select supplier" /></SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Destination Type">
            <Select value={destType} onValueChange={(v) => setDestType(v as "warehouse" | "branch")}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="warehouse">Warehouse</SelectItem>
                <SelectItem value="branch">Branch</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          {destType === "warehouse" && (
            <FieldRow label="Warehouse *">
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select warehouse" /></SelectTrigger>
                <SelectContent>
                  {warehouses.map((w) => (
                    <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          )}

          {destType === "branch" && (
            <FieldRow label="Branch *">
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FieldRow>
          )}

          <FieldRow label="Payment Terms">
            <Select value={paymentTerms} onValueChange={setPaymentTerms}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="on_delivery">On Delivery</SelectItem>
                <SelectItem value="immediate">Immediate</SelectItem>
                <SelectItem value="net_30">Net 30</SelectItem>
                <SelectItem value="net_60">Net 60</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          <FieldRow label="Expected Delivery Date">
            <Input
              type="date"
              className="h-9"
              value={expectedDeliveryDate}
              onChange={(e) => setExpectedDeliveryDate(e.target.value)}
            />
          </FieldRow>

          <FieldRow label="Notes">
            <Textarea
              rows={2}
              className="resize-none text-sm"
              placeholder="Optional notes…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </FieldRow>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Items</Label>
              <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={addItem}>
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            </div>

            <div className="rounded-lg border border-border/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Product</th>
                    <th className="text-right px-2 py-1.5 font-medium">Qty</th>
                    <th className="text-right px-2 py-1.5 font-medium">Cost</th>
                    <th className="text-right px-2 py-1.5 font-medium">Expiry</th>
                    <th className="text-right px-2 py-1.5 font-medium">Sub</th>
                    <th className="w-8" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((it, i) => (
                    <tr key={i} className="border-t border-border/40">
                      <td className="px-1 py-1">
                        <Select value={it.productId} onValueChange={(v) => setItem(i, "productId", v)}>
                          <SelectTrigger className="h-7 text-xs border-0 shadow-none bg-transparent px-1">
                            <SelectValue placeholder="Select" />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          min={1}
                          className="h-7 w-14 text-xs text-right"
                          value={it.quantity}
                          onChange={(e) => setItem(i, "quantity", Number(e.target.value))}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          className="h-7 w-16 text-xs text-right"
                          value={it.unitCost}
                          onChange={(e) => setItem(i, "unitCost", Number(e.target.value))}
                        />
                      </td>
                      <td className="px-1 py-1">
                        <Input
                          type="date"
                          className="h-7 w-28 text-xs"
                          value={it.expiryDate}
                          onChange={(e) => setItem(i, "expiryDate", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">
                        {fmt(it.quantity * it.unitCost)}
                      </td>
                      <td className="px-1 py-1 text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-destructive hover:text-destructive"
                          onClick={() => removeItem(i)}
                          disabled={items.length === 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex justify-end px-3 py-2 border-t border-border/40 bg-muted/20">
                <span className="text-xs font-semibold">Total: SAR {fmt(total)}</span>
              </div>
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            className="w-full gradient-primary text-primary-foreground border-0 shadow-glow"
            onClick={handleCreate}
            disabled={saving}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Create PO
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Receive Goods Sheet ──────────────────────────────────────────────────────

function ReceiveSheet({
  open,
  onClose,
  po,
  onReceived,
}: {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrder | null;
  onReceived: () => void;
}) {
  const [qtys, setQtys] = useState<Record<string, number>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const items = useMemo(
    () => (po?.items ?? []).filter((it) => it.receivedQuantity < it.orderedQuantity),
    [po],
  );

  useEffect(() => {
    if (open && po) {
      const q: Record<string, number> = {};
      const e: Record<string, string> = {};
      (po.items ?? []).forEach((it) => {
        q[it.productId] = it.orderedQuantity - it.receivedQuantity;
        e[it.productId] = it.expiryDate ?? "";
      });
      setQtys(q);
      setExpiries(e);
      setError("");
    }
  }, [open, po]);

  const handleConfirm = async () => {
    if (!po) return;
    const payload = items
      .filter((it) => qtys[it.productId] > 0)
      .map((it) => ({
        productId: it.productId,
        quantity: qtys[it.productId],
        expiryDate: expiries[it.productId] || undefined,
      }));
    if (!payload.length) return setError("Enter at least one quantity.");
    setSaving(true);
    setError("");
    try {
      await api.receivePurchaseOrder(po.id, payload);
      onReceived();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to receive goods.");
    } finally {
      setSaving(false);
    }
  };

  if (!po) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent style={{ width: 480, maxWidth: "100vw" }} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Receive Goods — {po.poNumber}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">All items have been fully received.</p>
          ) : (
            <div className="rounded-lg border border-border/60 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Product</th>
                    <th className="text-right px-2 py-2 font-medium">Ordered</th>
                    <th className="text-right px-2 py-2 font-medium">Received</th>
                    <th className="text-right px-2 py-2 font-medium">Now</th>
                    <th className="text-right px-2 py-2 font-medium">Expiry</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => (
                    <tr key={it.id} className="border-t border-border/40">
                      <td className="px-3 py-2">{it.product?.name ?? it.productId}</td>
                      <td className="px-2 py-2 text-right">{it.orderedQuantity}</td>
                      <td className="px-2 py-2 text-right text-muted-foreground">{it.receivedQuantity}</td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="number"
                          min={0}
                          max={it.orderedQuantity - it.receivedQuantity}
                          className="h-7 w-14 text-xs text-right"
                          value={qtys[it.productId] ?? 0}
                          onChange={(e) =>
                            setQtys((p) => ({ ...p, [it.productId]: Number(e.target.value) }))
                          }
                        />
                      </td>
                      <td className="px-2 py-2 text-right">
                        <Input
                          type="date"
                          className="h-7 w-28 text-xs"
                          value={expiries[it.productId] ?? ""}
                          onChange={(e) =>
                            setExpiries((p) => ({ ...p, [it.productId]: e.target.value }))
                          }
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}

          <Button
            className="w-full gradient-primary text-primary-foreground border-0 shadow-glow"
            onClick={handleConfirm}
            disabled={saving || items.length === 0}
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Confirm Receipt
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── View PO Sheet ────────────────────────────────────────────────────────────

function ViewPOSheet({
  open,
  onClose,
  po,
  onRefresh,
}: {
  open: boolean;
  onClose: () => void;
  po: PurchaseOrder | null;
  onRefresh: () => void;
}) {
  const [receiveOpen, setReceiveOpen] = useState(false);

  // Add Payment form state
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState("bank_transfer");
  const [payRef, setPayRef] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().split("T")[0]);
  const [payNotes, setPayNotes] = useState("");
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState("");

  if (!po) return null;

  const statusOrder = ["draft", "sent", "partial_received", "fully_received"];
  const currentStep = statusOrder.indexOf(po.status);

  const handleAddPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) return setPayError("Enter a valid amount.");
    setPayLoading(true);
    setPayError("");
    try {
      await api.addSupplierPayment(po.id, {
        amount,
        paymentMethod: payMethod,
        referenceNumber: payRef || undefined,
        paymentDate: payDate,
        notes: payNotes || undefined,
        recordedBy: "system",
        supplierId: po.supplierId,
      });
      setPayAmount("");
      setPayRef("");
      setPayNotes("");
      onRefresh();
    } catch (e: unknown) {
      setPayError(e instanceof Error ? e.message : "Failed to record payment.");
    } finally {
      setPayLoading(false);
    }
  };

  const destName =
    po.warehouse?.name ?? po.branch?.name ?? "—";

  return (
    <>
      <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
        <SheetContent style={{ width: 560, maxWidth: "100vw" }} className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {po.poNumber}
              <StatusBadge status={po.status} />
            </SheetTitle>
          </SheetHeader>

          <Tabs defaultValue="overview" className="mt-4">
            <TabsList className="grid grid-cols-4 h-8 text-xs">
              <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
              <TabsTrigger value="items" className="text-xs">Items</TabsTrigger>
              <TabsTrigger value="payments" className="text-xs">Payments</TabsTrigger>
              <TabsTrigger value="timeline" className="text-xs">Timeline</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">PO Number</p>
                  <p className="font-medium">{po.poNumber}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Created</p>
                  <p className="font-medium">{formatDate(po.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Supplier</p>
                  <p className="font-medium">{po.supplier?.name ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Supplier Code</p>
                  <p className="font-medium">{po.supplier?.supplierCode ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Destination</p>
                  <p className="font-medium">{destName}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment Terms</p>
                  <p className="font-medium capitalize">{po.paymentTerms?.replace("_", " ") ?? "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Payment Status</p>
                  <PaymentBadge status={po.paymentStatus} />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Expected Delivery</p>
                  <p className="font-medium">{formatDate(po.expectedDeliveryDate)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Received Date</p>
                  <p className="font-medium">{formatDate(po.receivedDate)}</p>
                </div>
              </div>

              <div className="rounded-lg border border-border/60 p-3 space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Amount</span>
                  <span className="font-semibold">SAR {fmt(po.totalAmount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Paid Amount</span>
                  <span className="font-semibold text-success">SAR {fmt(po.paidAmount)}</span>
                </div>
                <div className="flex justify-between text-sm border-t border-border/40 pt-1.5">
                  <span className="text-muted-foreground">Balance Due</span>
                  <span className="font-bold text-destructive">SAR {fmt(po.totalAmount - po.paidAmount)}</span>
                </div>
              </div>

              {po.notes && (
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm bg-muted/30 rounded-lg px-3 py-2">{po.notes}</p>
                </div>
              )}
            </TabsContent>

            {/* Items */}
            <TabsContent value="items" className="mt-4 space-y-3">
              <div className="rounded-lg border border-border/60 overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Product</th>
                      <th className="text-right px-2 py-2 font-medium">Ordered</th>
                      <th className="text-right px-2 py-2 font-medium">Received</th>
                      <th className="text-right px-2 py-2 font-medium">Cost</th>
                      <th className="text-right px-2 py-2 font-medium">Subtotal</th>
                      <th className="text-right px-2 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(po.items ?? []).map((it) => (
                      <tr key={it.id} className="border-t border-border/40">
                        <td className="px-3 py-2">{it.product?.name ?? it.productId}</td>
                        <td className="px-2 py-2 text-right">{it.orderedQuantity}</td>
                        <td className="px-2 py-2 text-right text-muted-foreground">{it.receivedQuantity}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{fmt(it.unitCost)}</td>
                        <td className="px-2 py-2 text-right tabular-nums font-medium">{fmt(it.subtotal)}</td>
                        <td className="px-2 py-2 text-right">
                          <StatusBadge status={it.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {(po.status === "sent" || po.status === "partial_received") && (
                <Button
                  className="w-full gradient-primary text-primary-foreground border-0 shadow-glow"
                  onClick={() => setReceiveOpen(true)}
                >
                  <Truck className="h-4 w-4 mr-2" />
                  {po.status === "partial_received" ? "Receive More" : "Receive Goods"}
                </Button>
              )}
            </TabsContent>

            {/* Payments */}
            <TabsContent value="payments" className="mt-4 space-y-4">
              <div className="space-y-2">
                {(po.payments ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No payments recorded.</p>
                ) : (
                  (po.payments ?? []).map((pay) => (
                    <div key={pay.id} className="rounded-lg border border-border/60 px-3 py-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">SAR {fmt(pay.amount)}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {pay.paymentMethod.replace("_", " ")} · {formatDate(pay.paymentDate)}
                          </p>
                          {pay.referenceNumber && (
                            <p className="text-xs text-muted-foreground">Ref: {pay.referenceNumber}</p>
                          )}
                        </div>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${pay.status === "confirmed" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                          {pay.status}
                        </span>
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
                    <FieldRow label="Amount (SAR) *">
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        className="h-9"
                        placeholder="0.00"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </FieldRow>
                    <FieldRow label="Payment Method">
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cash">Cash</SelectItem>
                          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
                          <SelectItem value="cheque">Cheque</SelectItem>
                          <SelectItem value="card">Card</SelectItem>
                        </SelectContent>
                      </Select>
                    </FieldRow>
                    <FieldRow label="Reference">
                      <Input
                        className="h-9"
                        placeholder="Reference #"
                        value={payRef}
                        onChange={(e) => setPayRef(e.target.value)}
                      />
                    </FieldRow>
                    <FieldRow label="Payment Date">
                      <Input
                        type="date"
                        className="h-9"
                        value={payDate}
                        onChange={(e) => setPayDate(e.target.value)}
                      />
                    </FieldRow>
                  </div>
                  <FieldRow label="Notes">
                    <Textarea
                      rows={2}
                      className="resize-none text-sm"
                      value={payNotes}
                      onChange={(e) => setPayNotes(e.target.value)}
                    />
                  </FieldRow>
                  {payError && <p className="text-xs text-destructive">{payError}</p>}
                  <Button
                    className="w-full gradient-primary text-primary-foreground border-0 shadow-glow"
                    onClick={handleAddPayment}
                    disabled={payLoading}
                  >
                    {payLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CreditCard className="h-4 w-4 mr-2" />}
                    Record Payment
                  </Button>
                </div>
              )}
            </TabsContent>

            {/* Timeline */}
            <TabsContent value="timeline" className="mt-6">
              <div className="relative pl-4">
                {statusOrder.map((step, idx) => {
                  const reached = currentStep >= idx;
                  const isCurrent = currentStep === idx && po.status !== "cancelled";
                  const label: Record<string, string> = {
                    draft: "Draft Created",
                    sent: "Sent to Supplier",
                    partial_received: "Partial Receipt",
                    fully_received: "Fully Received",
                  };
                  return (
                    <div key={step} className="relative flex gap-3 pb-6 last:pb-0">
                      {idx < statusOrder.length - 1 && (
                        <div
                          className={`absolute left-0 top-5 w-0.5 h-full -translate-x-1/2 ${reached ? "bg-primary" : "bg-border/60"}`}
                        />
                      )}
                      <div
                        className={`relative z-10 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${reached ? "bg-primary border-primary" : "bg-background border-border"} ${isCurrent ? "ring-2 ring-primary/30 ring-offset-2 ring-offset-background" : ""}`}
                      >
                        {reached && <CheckCircle className="h-3 w-3 text-primary-foreground" />}
                      </div>
                      <div className="pt-0.5">
                        <p className={`text-sm font-medium ${reached ? "text-foreground" : "text-muted-foreground"}`}>
                          {label[step]}
                        </p>
                        {step === "draft" && reached && (
                          <p className="text-xs text-muted-foreground">{formatDate(po.createdAt)}</p>
                        )}
                        {step === "fully_received" && po.receivedDate && (
                          <p className="text-xs text-muted-foreground">{formatDate(po.receivedDate)}</p>
                        )}
                        {step === "sent" && po.status !== "draft" && (
                          <p className="text-xs text-muted-foreground">{formatDate(po.updatedAt)}</p>
                        )}
                      </div>
                    </div>
                  );
                })}

                {po.status === "cancelled" && (
                  <div className="mt-4 flex gap-3">
                    <div className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full bg-destructive/15 border-2 border-destructive">
                      <span className="h-2 w-2 rounded-full bg-destructive" />
                    </div>
                    <div className="pt-0.5">
                      <p className="text-sm font-medium text-destructive">Cancelled</p>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </SheetContent>
      </Sheet>

      <ReceiveSheet
        open={receiveOpen}
        onClose={() => setReceiveOpen(false)}
        po={po}
        onReceived={() => {
          setReceiveOpen(false);
          onRefresh();
        }}
      />
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function PurchaseOrders() {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [payFilter, setPayFilter] = useState("all");

  const [createOpen, setCreateOpen] = useState(false);
  const [viewPO, setViewPO] = useState<PurchaseOrder | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<PurchaseOrder | null>(null);

  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter !== "all") params.status = statusFilter;
    if (payFilter !== "all") params.paymentStatus = payFilter;
    api
      .getPurchaseOrders(params)
      .then(setPos)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.getSuppliers().then(setSuppliers);
    api.getWarehouses().then(setWarehouses);
    api.getBranches().then(setBranches);
    api.getProducts().then(setProducts);
  }, []);

  useEffect(() => {
    load();
  }, [statusFilter, payFilter]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return pos;
    return pos.filter(
      (p) =>
        p.poNumber.toLowerCase().includes(q) ||
        (p.supplier?.name ?? "").toLowerCase().includes(q),
    );
  }, [pos, search]);

  // Metrics
  const totalPOs = pos.length;
  const pending = pos.filter((p) => p.status === "draft" || p.status === "sent").length;
  const totalValue = pos.reduce((s, p) => s + p.totalAmount, 0);
  const unpaidAmount = pos
    .filter((p) => p.paymentStatus !== "paid" && p.status !== "cancelled")
    .reduce((s, p) => s + (p.totalAmount - p.paidAmount), 0);

  const handleSendToSupplier = async (po: PurchaseOrder) => {
    setActionLoading(po.id + "_send");
    try {
      await api.updatePoStatus(po.id, "sent");
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async (po: PurchaseOrder) => {
    if (!confirm(`Cancel PO ${po.poNumber}?`)) return;
    setActionLoading(po.id + "_cancel");
    try {
      await api.updatePoStatus(po.id, "cancelled");
      load();
    } finally {
      setActionLoading(null);
    }
  };

  const refreshView = () => {
    load();
    if (viewPO) {
      api.getPurchaseOrder(viewPO.id).then(setViewPO).catch(() => {});
    }
  };

  return (
    <PageShell
      title="Purchase Orders"
      subtitle="Manage supplier purchase orders and goods receipt"
    >
      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total POs"
          value={String(totalPOs)}
          icon={FileText}
          accent="primary"
        />
        <MetricCard
          label="Pending"
          value={String(pending)}
          icon={Clock}
          accent="warning"
        />
        <MetricCard
          label="Total Ordered Value"
          value={`SAR ${fmt(totalValue)}`}
          icon={Package}
          accent="default"
        />
        <MetricCard
          label="Unpaid Amount"
          value={`SAR ${fmt(unpaidAmount)}`}
          icon={DollarSign}
          accent="destructive"
        />
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-9 w-56 bg-muted/50"
          placeholder="Search PO # or supplier…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-44">
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="sent">Sent</SelectItem>
            <SelectItem value="partial_received">Partial Received</SelectItem>
            <SelectItem value="fully_received">Fully Received</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={payFilter} onValueChange={setPayFilter}>
          <SelectTrigger className="h-9 w-36">
            <SelectValue placeholder="All payments" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Payments</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="partial">Partial</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button
          className="gradient-primary text-primary-foreground border-0 shadow-glow h-9"
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4 mr-1.5" />
          New PO
        </Button>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/40 border-b border-border/60">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">PO #</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Supplier</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Destination</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Payment</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Total</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Paid</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Exp. Delivery</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground text-xs uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={9} className="text-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                filtered.map((po) => {
                  const dest = po.warehouse?.name ?? po.branch?.name ?? "—";
                  const isSending = actionLoading === po.id + "_send";
                  const isCancelling = actionLoading === po.id + "_cancel";
                  return (
                    <tr key={po.id} className="border-t border-border/40 hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium text-xs">{po.poNumber}</td>
                      <td className="px-4 py-3">{po.supplier?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{dest}</td>
                      <td className="px-4 py-3"><StatusBadge status={po.status} /></td>
                      <td className="px-4 py-3"><PaymentBadge status={po.paymentStatus} /></td>
                      <td className="px-4 py-3 text-right tabular-nums font-medium">SAR {fmt(po.totalAmount)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">SAR {fmt(po.paidAmount)}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(po.expectedDeliveryDate)}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => setViewPO(po)}
                            title="View"
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </Button>

                          {po.status === "draft" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => handleSendToSupplier(po)}
                              disabled={isSending}
                            >
                              {isSending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Truck className="h-3 w-3" />}
                              Send
                            </Button>
                          )}

                          {(po.status === "sent" || po.status === "partial_received") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs gap-1"
                              onClick={() => setReceiveTarget(po)}
                            >
                              <Package className="h-3 w-3" />
                              {po.status === "partial_received" ? "More" : "Receive"}
                            </Button>
                          )}

                          {po.status !== "cancelled" && po.status !== "fully_received" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 text-xs gap-1 text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleCancel(po)}
                              disabled={isCancelling}
                            >
                              {isCancelling ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                              Cancel
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Sheets */}
      <CreatePOSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        suppliers={suppliers}
        warehouses={warehouses}
        branches={branches}
        products={products}
        onCreated={load}
      />

      <ViewPOSheet
        open={!!viewPO}
        onClose={() => setViewPO(null)}
        po={viewPO}
        onRefresh={refreshView}
      />

      <ReceiveSheet
        open={!!receiveTarget}
        onClose={() => setReceiveTarget(null)}
        po={receiveTarget}
        onReceived={() => {
          setReceiveTarget(null);
          load();
        }}
      />
    </PageShell>
  );
}
