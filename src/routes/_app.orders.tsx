import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useCallback } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader as DHeader, DialogTitle as DTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Pagination, PaginationContent, PaginationItem, PaginationPrevious, PaginationNext } from "@/components/ui/pagination";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import {
  Printer, Download, Globe, Pencil, Package, CreditCard,
  User, Store, Loader2, RefreshCw, MoreHorizontal, Eye,
  CheckCircle2, XCircle, Clock, Truck, AlertCircle, X, RotateCcw, Trash2, Ban,
  MapPin, Minus, Plus, Save, Phone, Mail,
} from "lucide-react";
import { toast } from "sonner";
import { api, type Order, type OrderPayment, type Branch, type CustomerReturnItem, type Product, type OnlineOrder, type OnlineOrderItemEdit } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { useCompanyHeader } from "@/lib/use-company-header";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { AddressMapPreview } from "@/components/address-map-picker";
import { OrderInvoiceDialog } from "@/components/order-invoice-dialog";

export const Route = createFileRoute("/_app/orders")({
  // Lets other pages (e.g. Sales) deep-link straight to a specific order's detail sheet instead of
  // duplicating the receipt/print/refund UI that already lives here.
  // Both keys are declared OPTIONAL rather than left to inference: inferred `string | undefined`
  // is a *required* key holding undefined, so adding `tab` would force every existing
  // navigate({ to: "/orders", search: { orderId } }) call elsewhere to pass it too.
  validateSearch: (search): { orderId?: string; tab?: "pos" | "online" } => ({
    orderId: (search.orderId as string) || undefined,
    // Which tab to open on. Set by the "New Online Order" notification, which is about an order
    // that lives on the Online tab — landing on POS Orders would show everything except the thing
    // that was clicked.
    tab: (search.tab as "pos" | "online" | undefined) || undefined,
  }),
  component: Orders,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
const ORDER_STATUSES = ["pending", "processing", "ready_to_deliver", "delivered", "completed", "cancelled", "refunded"];
const PAYMENT_STATUSES = ["pending", "paid", "partially_paid", "refunded"];

// Mirrors the Approval Center's labels for the two request types that can be raised against an
// order, so the same request reads identically on both screens.
const APPROVAL_TYPE_LABELS: Record<string, string> = {
  order_cancellation: "Cancellation pending",
  order_modification: "Modification pending",
};

// Statuses reachable from the "Update Status" editor — deliberately excludes "cancelled": voiding
// an order has to reverse stock and the cashier shift's totals (see OrdersController.VoidOrder /
// ApplyVoidAsync), which this simple status editor doesn't do, so cancelling only ever happens
// through the dedicated Void button. Once completed, the only legitimate move left is a refund
// (routed through the Returns approval flow below) — not back through the fulfillment pipeline.
const FULFILLMENT_STATUSES = ["pending", "processing", "ready_to_deliver", "delivered", "completed"];
function editableStatusOptions(current: string): string[] {
  return current === "completed" ? ["completed", "refunded"] : [...FULFILLMENT_STATUSES, "refunded"];
}

function statusColor(s: string) {
  switch (s) {
    case "paid": case "completed": case "delivered": return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400";
    case "pending": return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "processing": case "ready_to_deliver": return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400";
    case "cancelled": case "refunded": return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
    case "partially_paid": return "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "bg-muted text-muted-foreground";
  }
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: "bg-green-500", completed: "bg-green-500", delivered: "bg-green-500",
    pending: "bg-yellow-500", processing: "bg-blue-500", ready_to_deliver: "bg-blue-400",
    cancelled: "bg-red-500", refunded: "bg-red-400", partially_paid: "bg-orange-500",
  };
  return <span className={`inline-block w-2 h-2 rounded-full mr-1.5 ${colors[status] ?? "bg-muted-foreground"}`} />;
}

function SBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium capitalize ${statusColor(status)}`}>
      <StatusDot status={status} />{label ?? status.replace(/_/g, " ")}
    </span>
  );
}

// A voided order keeps whatever PaymentStatus it had at checkout ("paid"/"partially_paid") until
// the backend explicitly flips it to "cancelled" (OrderVoidService.VoidAsync) — money was taken
// but the order never completed, so it still needs reconciling/refunding. The generic "Cancelled"
// label reads as just another status; spelling it out as "Refund Due" is what actually answers
// the owner's question of whether money still needs to go back to the customer.
function paymentBadgeLabel(paymentStatus: string): string | undefined {
  return paymentStatus === "cancelled" ? "Refund Due" : undefined;
}

function statusIcon(s: string) {
  if (["completed", "delivered", "paid"].includes(s)) return <CheckCircle2 className="h-4 w-4 text-green-500" />;
  if (["cancelled", "refunded"].includes(s)) return <XCircle className="h-4 w-4 text-red-500" />;
  if (["processing", "ready_to_deliver"].includes(s)) return <Truck className="h-4 w-4 text-blue-500" />;
  return <Clock className="h-4 w-4 text-yellow-500" />;
}

function paymentMethodLabel(method: string): string {
  if (method === "qr") return "QR";
  return method.charAt(0).toUpperCase() + method.slice(1);
}

// A cash+card split still only ever carried payments[0]'s method almost everywhere it was
// rendered (detail drawer, printed receipt) — silently dropping every other payment line. These
// two helpers are the single source of truth for "how does this order's payment break down",
// shared by the list table, the detail drawer and the printed receipt so all three agree.
function paymentBreakdownText(payments: OrderPayment[]): string {
  return payments.map(p => `${paymentMethodLabel(p.paymentMethod)} ${p.amount.toFixed(2)}`).join(" + ");
}

function PaymentBreakdown({ payments, className }: { payments?: OrderPayment[]; className?: string }) {
  if (!payments || payments.length === 0) return null;
  if (payments.length === 1) return <span className={className}>{paymentMethodLabel(payments[0].paymentMethod)}</span>;
  return <span className={className}>{paymentBreakdownText(payments)}</span>;
}

function exportCSV(orders: Order[], companyHeader: string) {
  const rows = [
    ["Order#", "Branch", "Cashier", "Subtotal", "Discount", "Loyalty Pts Redeemed", "Loyalty Discount", "Tax", "Total", "Order Status", "Payment Status", "Date"],
    ...orders.map(o => [
      o.orderNumber, o.branch?.name ?? "", o.cashier?.fullName ?? "",
      o.subtotal.toFixed(2), o.discountAmount.toFixed(2),
      String(o.loyaltyPointsRedeemed ?? 0), (o.loyaltyDiscountAmount ?? 0).toFixed(2),
      o.taxAmount.toFixed(2),
      o.totalAmount.toFixed(2), o.orderStatus, o.paymentStatus,
      new Date(o.createdAt).toLocaleString("en-SA"),
    ]),
  ];
  const lines = rows.map(r => r.map(c => `"${c}"`).join(","));
  if (companyHeader) lines.unshift(`"${companyHeader.replace(/"/g, '""')}"`, "");
  const csv = lines.join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
}

function printOrders(orders: Order[], companyHeader: string) {
  const rows = orders.map(o => `
    <tr>
      <td>${o.orderNumber}</td>
      <td>${o.branch?.name ?? "—"}</td>
      <td>${o.cashier?.fullName ?? "—"}</td>
      <td>SAR ${o.totalAmount.toFixed(2)}</td>
      <td>${o.orderStatus.replace(/_/g, " ")}</td>
      <td>${o.paymentStatus.replace(/_/g, " ")}</td>
      <td>${new Date(o.createdAt).toLocaleDateString("en-SA")}</td>
    </tr>`).join("");

  const win = window.open("", "_blank", "width=900,height=650");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
    <title>Orders</title>
    <style>
      body { font-family: Arial, sans-serif; font-size: 12px; margin: 24px; color: #000; }
      h2 { font-size: 16px; margin-bottom: 4px; }
      p.sub { font-size: 11px; color: #666; margin: 0 0 16px; }
      table { width: 100%; border-collapse: collapse; }
      th { background: #000; color: #fff; padding: 7px 10px; text-align: left; font-size: 11px; text-transform: uppercase; }
      td { padding: 7px 10px; border-bottom: 1px solid #e0e0e0; }
      tr:nth-child(even) td { background: #f9f9f9; }
      td:nth-child(4) { font-weight: bold; }
    </style>
  </head><body>
    <h2>Orders Report</h2>
    ${companyHeader ? `<p class="sub" style="font-weight:600;color:#333">${companyHeader}</p>` : ""}
    <p class="sub">Printed ${new Date().toLocaleString("en-SA")} &nbsp;·&nbsp; ${orders.length} orders</p>
    <table>
      <thead><tr>
        <th>Order #</th><th>Branch</th><th>Cashier</th>
        <th>Total</th><th>Status</th><th>Payment</th><th>Date</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 400);
}

// ─── Refund Dialog ────────────────────────────────────────────────────────────
const REFUND_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card / Bank Transfer" },
  { value: "online", label: "Online" },
  { value: "loyalty_points", label: "Loyalty Points" },
  { value: "store_credit", label: "Store Credit" },
];

// Same reason list as the dedicated Returns page (_app.returns.tsx) — kept identical so a
// return filed from either place gets the same condition/restock outcome for the same reason.
const REFUND_REASONS = [
  "Damaged packaging", "Wrong item received", "Expired product",
  "Quality issue", "Customer changed mind", "Duplicate purchase", "Other",
];

// This dialog used to hardcode every returned item as condition "good" / restock true no matter
// what reason was picked — a refund for "Damaged packaging" or "Expired product" still silently
// put the stock back on the shelf as sellable. Mirrors the same derivation _app.returns.tsx
// already uses: only genuinely non-sellable reasons are written off instead of restocked.
function deriveReturnCondition(reason: string): { condition: string; restock: boolean } {
  const nonSellable = reason === "Damaged packaging" || reason === "Expired product" || reason === "Quality issue";
  return { condition: reason === "Expired product" ? "expired" : nonSellable ? "damaged" : "good", restock: !nonSellable };
}

function RefundDialog({ order, open, onClose, onDone }: {
  order: Order; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const items = order.items ?? [];
  type ItemState = { selected: boolean; qty: number };
  const [itemStates, setItemStates] = useState<Record<number, ItemState>>(() =>
    Object.fromEntries(items.map((item, i) => [i, { selected: true, qty: item.quantity }]))
  );
  const [refundMethod, setRefundMethod] = useState("cash");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const allSelected = items.length > 0 && items.every((_, i) => itemStates[i]?.selected);
  const someSelected = items.some((_, i) => itemStates[i]?.selected);
  const refundTotal = items.reduce((sum, item, i) => {
    const s = itemStates[i];
    return s?.selected ? sum + item.unitPrice * s.qty : sum;
  }, 0);

  const toggleAll = (checked: boolean) =>
    setItemStates(prev => Object.fromEntries(items.map((item, i) => [i, { selected: checked, qty: prev[i]?.qty ?? item.quantity }])));

  const handleConfirm = async () => {
    if (!reason.trim()) { setError("Please provide a reason for the refund."); return; }
    if (!someSelected) { setError("Please select at least one item to refund."); return; }
    setError("");
    setSaving(true);
    try {
      const { condition, restock } = deriveReturnCondition(reason);
      const returnItems: CustomerReturnItem[] = items
        .map((item, i) => ({ item, state: itemStates[i] }))
        .filter(({ state }) => state?.selected)
        .map(({ item, state }) => ({
          productId: item.productId,
          orderItemId: item.id,
          quantity: state!.qty,
          unitPrice: item.unitPrice,
          refundAmount: +(item.unitPrice * state!.qty).toFixed(2),
          condition,
          restock,
        }));

      // MIMONY-RETURNS-ORDERSTATUS-001: this used to mark the order OrderStatus="refunded"
      // immediately on submit — before any approval. The backend always creates a return as
      // "pending" regardless of the status sent here, so a return raised from this dialog and
      // later REJECTED (via the normal Returns page) left the order permanently mislabeled
      // "refunded" with no completed return behind it. The order now only flips to "refunded"
      // server-side, once this same return is actually approved and completed
      // (ReturnsController.Complete) — this dialog raises the request, it doesn't finalize it.
      await api.createReturn({
        orderId: order.id,
        branchId: order.branchId,
        ...(order.customerId ? { customerId: order.customerId } : {}),
        returnType: "refund",
        refundMethod,
        refundAmount: +refundTotal.toFixed(2),
        reason: reason.trim(),
        items: returnItems,
      });
      toast.success("Refund request submitted — pending manager approval.");
      onDone();
    } catch (e: any) {
      setError(e.message ?? "Failed to process refund.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
        <DHeader>
          <DTitle className="flex items-center gap-2 text-base">
            <RotateCcw className="h-4 w-4 text-red-500" /> Process Refund — {order.orderNumber}
          </DTitle>
          <DialogDescription className="text-xs">
            Select the items to refund and choose the refund payment method.
          </DialogDescription>
        </DHeader>

        <div className="overflow-y-auto flex-1 space-y-4 py-1 pr-1">
          {/* Items */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Checkbox id="refund-all" checked={allSelected} onCheckedChange={v => toggleAll(!!v)} />
              <label htmlFor="refund-all" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground cursor-pointer select-none">
                Items to Refund
              </label>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => {
                const s = itemStates[i] ?? { selected: false, qty: item.quantity };
                return (
                  <div key={i} className={`flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors ${s.selected ? "border-primary/40 bg-primary/5" : "border-border bg-muted/20 opacity-60"}`}>
                    <Checkbox
                      checked={s.selected}
                      onCheckedChange={v => setItemStates(prev => ({ ...prev, [i]: { ...prev[i], selected: !!v } }))}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{(item as any).product?.name ?? "Product"}</p>
                      <p className="text-xs text-muted-foreground">SAR {item.unitPrice.toFixed(2)} × each</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="h-6 w-6 rounded border flex items-center justify-center text-sm leading-none disabled:opacity-30 hover:bg-muted"
                        disabled={!s.selected || s.qty <= 1}
                        onClick={() => setItemStates(prev => ({ ...prev, [i]: { ...prev[i], qty: prev[i].qty - 1 } }))}
                      >−</button>
                      <span className="w-6 text-center text-sm tabular-nums font-medium">{s.qty}</span>
                      <button
                        className="h-6 w-6 rounded border flex items-center justify-center text-sm leading-none disabled:opacity-30 hover:bg-muted"
                        disabled={!s.selected || s.qty >= item.quantity}
                        onClick={() => setItemStates(prev => ({ ...prev, [i]: { ...prev[i], qty: prev[i].qty + 1 } }))}
                      >+</button>
                    </div>
                    <p className="text-sm font-semibold w-20 text-end tabular-nums">
                      SAR {(item.unitPrice * s.qty).toFixed(2)}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Refund method */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Refund Method</p>
            <Select value={refundMethod} onValueChange={setRefundMethod}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REFUND_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Reason */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
              Reason <span className="text-red-500">*</span>
            </p>
            <Select value={reason} onValueChange={v => { setReason(v); setError(""); }}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select reason" /></SelectTrigger>
              <SelectContent>
                {REFUND_REASONS.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
            {reason && (
              <p className="text-xs text-muted-foreground mt-1">
                {deriveReturnCondition(reason).restock
                  ? "Items will be returned to sellable stock."
                  : "Items will be written off, not returned to sellable stock."}
              </p>
            )}
          </div>

          {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded px-3 py-2">{error}</p>}
        </div>

        <DialogFooter className="mt-2 flex-row items-center gap-2">
          <div className="flex-1 text-sm">
            <span className="text-muted-foreground">Refund total:</span>
            <span className="font-bold ml-1.5 text-primary">SAR {refundTotal.toFixed(2)}</span>
          </div>
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="gradient-primary text-primary-foreground border-0"
            onClick={handleConfirm}
            disabled={saving || !someSelected}
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Confirm Refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Order Dialog ────────────────────────────────────────────────────────
// Order Editing (FR: "Edit orders from dashboard", "Editable order with audit log"). Management-
// level correction tool for urgent operational situations: quantities, prices, adding/removing
// lines, discount override, payment method (single-payment orders), and which customer the order
// is attributed to. Every change is recomputed and audit-logged server-side (OrdersController.EditOrder).
function EditOrderDialog({ order, open, onClose, onDone }: {
  order: Order; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const items = order.items ?? [];
  type Line = { productId: string; name: string; unitPrice: number; quantity: number; removed: boolean };
  const [lines, setLines] = useState<Line[]>(() => items.map(i => ({
    productId: i.productId,
    name: (i as any).product?.name ?? "Product",
    unitPrice: i.unitPrice,
    quantity: i.quantity,
    removed: false,
  })));
  const [notes, setNotes] = useState(order.notes ?? "");
  const [discount, setDiscount] = useState(order.discountAmount);
  const singlePayment = (order.payments ?? []).length === 1 ? order.payments![0] : null;
  const [paymentMethod, setPaymentMethod] = useState(singlePayment?.paymentMethod ?? "cash");

  const [customer, setCustomer] = useState(order.customer ?? null);
  const [customerChanged, setCustomerChanged] = useState(false);
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerLookupError, setCustomerLookupError] = useState("");

  const [productQuery, setProductQuery] = useState("");
  const [productResults, setProductResults] = useState<Product[]>([]);
  const [searchingProducts, setSearchingProducts] = useState(false);
  const [hasSearchedProducts, setHasSearchedProducts] = useState(false);
  const [stockMap, setStockMap] = useState<Map<string, number>>(new Map());

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Only products actually stocked at this order's branch can be added — an item with no stock
  // here can't be picked, packed or handed to the customer at this location.
  useEffect(() => {
    api.getStock({ branchId: order.branchId }).then(stocks => {
      const map = new Map<string, number>();
      stocks.forEach(s => map.set(s.productId, Math.max(0, s.quantity - (s.reservedQuantity ?? 0))));
      setStockMap(map);
    }).catch(() => {});
  }, [order.branchId]);

  const activeLines = lines.filter(l => !l.removed);
  const newSubtotal = activeLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);

  const setQty = (idx: number, d: number) =>
    setLines(ls => ls.map((l, i) => (i === idx ? { ...l, quantity: Math.max(1, l.quantity + d) } : l)));
  const setPrice = (idx: number, price: number) =>
    setLines(ls => ls.map((l, i) => (i === idx ? { ...l, unitPrice: Math.max(0, price) } : l)));
  const toggleRemove = (idx: number) =>
    setLines(ls => ls.map((l, i) => (i === idx ? { ...l, removed: !l.removed } : l)));

  const searchProducts = async () => {
    if (!productQuery.trim()) return;
    setSearchingProducts(true);
    try {
      const results = await api.getProducts({ search: productQuery.trim(), status: "active" });
      setProductResults(results.filter(p => (stockMap.get(p.id) ?? 0) > 0));
    } catch {
      setProductResults([]);
    } finally {
      setSearchingProducts(false);
      setHasSearchedProducts(true);
    }
  };

  const addProduct = (p: Product) => {
    setLines(ls => {
      const existing = ls.findIndex(l => l.productId === p.id && !l.removed);
      if (existing >= 0) return ls.map((l, i) => (i === existing ? { ...l, quantity: l.quantity + 1 } : l));
      return [...ls, { productId: p.id, name: p.name, unitPrice: p.basePrice, quantity: 1, removed: false }];
    });
    setProductQuery("");
    setProductResults([]);
    setHasSearchedProducts(false);
  };

  const lookupCustomer = async () => {
    if (!customerPhone.trim()) return;
    setCustomerLookupError("");
    try {
      const c = await api.getCustomerByPhone(customerPhone.trim());
      setCustomer({ id: c.id, fullName: c.fullName, phone: c.phone, email: c.email });
      setCustomerChanged(true);
      setCustomerPhone("");
    } catch {
      setCustomerLookupError("No customer found with that phone number.");
    }
  };

  const removeCustomer = () => {
    setCustomer(null);
    setCustomerChanged(true);
  };

  const handleSave = async () => {
    if (activeLines.length === 0) { setError("An order must have at least one item."); return; }
    if (discount > newSubtotal) { setError("Discount can't exceed the new subtotal."); return; }
    setSaving(true);
    setError("");
    try {
      const result = await api.editOrder(order.id, {
        items: activeLines.map(l => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })),
        notes: notes || undefined,
        discountAmount: discount,
        paymentMethod: singlePayment && paymentMethod !== singlePayment.paymentMethod ? paymentMethod : undefined,
        updateCustomer: customerChanged,
        customerId: customerChanged ? (customer?.id ?? null) : undefined,
      });
      // Without Orders:Approve the edit is queued, not applied — say so rather than letting the
      // dialog close as if the order had already changed.
      if (result.approvalRequestId) toast.info(result.message ?? "Order modification sent for manager approval.");
      else toast.success("Order updated.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save changes.");
    } finally {
      setSaving(false);
    }
  };

  return (
      <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
          <DHeader>
            <DTitle className="flex items-center gap-2 text-base">
              <Pencil className="h-4 w-4" /> Edit Order — {order.orderNumber}
            </DTitle>
            <DialogDescription className="text-xs">
              Management-level correction tool. Every change here is recorded in the audit log with before/after values.
            </DialogDescription>
          </DHeader>

          <div className="overflow-y-auto flex-1 space-y-3 py-1 pr-1">
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors ${l.removed ? "border-border bg-muted/20 opacity-50" : "border-border/60"}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{l.name}</p>
                    {!l.removed ? (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className="text-xs text-muted-foreground">SAR</span>
                        <Input
                          type="number" min={0} step="0.01" value={l.unitPrice}
                          onChange={e => setPrice(i, parseFloat(e.target.value) || 0)}
                          className="h-6 w-20 text-xs px-1.5"
                        />
                        <span className="text-xs text-muted-foreground">× each</span>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground">SAR {l.unitPrice.toFixed(2)} × each</p>
                    )}
                  </div>
                  {!l.removed && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        className="h-6 w-6 rounded border flex items-center justify-center text-sm leading-none disabled:opacity-30 hover:bg-muted"
                        disabled={l.quantity <= 1}
                        onClick={() => setQty(i, -1)}
                      >−</button>
                      <span className="w-6 text-center text-sm tabular-nums font-medium">{l.quantity}</span>
                      <button
                        className="h-6 w-6 rounded border flex items-center justify-center text-sm leading-none hover:bg-muted"
                        onClick={() => setQty(i, 1)}
                      >+</button>
                    </div>
                  )}
                  <Button
                    size="icon" variant="ghost"
                    className={`h-7 w-7 shrink-0 ${l.removed ? "text-success" : "text-destructive"}`}
                    onClick={() => toggleRemove(i)}
                  >
                    {l.removed ? <RotateCcw className="h-3.5 w-3.5" /> : <Trash2 className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              ))}
            </div>

            {/* Add item */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Add Item</p>
              <div className="flex gap-1.5">
                <Input
                  value={productQuery} onChange={e => { setProductQuery(e.target.value); setHasSearchedProducts(false); }}
                  onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); searchProducts(); } }}
                  placeholder="Search in-stock products by name or SKU…" className="h-9"
                />
                <Button variant="outline" className="h-9" onClick={searchProducts} disabled={searchingProducts}>
                  {searchingProducts ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Search"}
                </Button>
              </div>
              {productResults.length > 0 && (
                <div className="mt-1.5 space-y-1 max-h-32 overflow-y-auto rounded-lg border p-1.5">
                  {productResults.map(p => (
                    <button
                      key={p.id} onClick={() => addProduct(p)}
                      className="w-full flex items-center justify-between text-xs rounded px-2 py-1.5 hover:bg-muted text-start"
                    >
                      <span className="truncate">{p.name}</span>
                      <span className="flex items-center gap-2 shrink-0 ml-2 text-muted-foreground">
                        <span className="text-[10px]">Stock: {stockMap.get(p.id) ?? 0}</span>
                        <span><SARIcon />{p.basePrice.toFixed(2)}</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {hasSearchedProducts && productResults.length === 0 && !searchingProducts && (
                <p className="text-xs text-muted-foreground mt-1.5">No in-stock products match at this branch.</p>
              )}
            </div>

            {/* Discount override */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Discount (SAR)</p>
              <Input
                type="number" min={0} step="0.01" value={discount}
                onChange={e => setDiscount(Math.max(0, parseFloat(e.target.value) || 0))}
                className="h-9"
              />
            </div>

            {/* Payment method */}
            {singlePayment && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Payment Method</p>
                <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="wallet">Wallet</SelectItem>
                    <SelectItem value="qr">QR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Customer */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Customer</p>
              {customer ? (
                <div className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium">{customer.fullName}</p>
                    <p className="text-xs text-muted-foreground">{customer.phone}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={removeCustomer}>
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <Input
                    value={customerPhone} onChange={e => { setCustomerPhone(e.target.value); setCustomerLookupError(""); }}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); lookupCustomer(); } }}
                    placeholder="Customer phone number…" className="h-9"
                  />
                  <Button variant="outline" className="h-9" onClick={lookupCustomer}>Attach</Button>
                </div>
              )}
              {customerLookupError && <p className="text-xs text-red-600 mt-1">{customerLookupError}</p>}
            </div>

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Notes</p>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Reason for edit / internal note…" className="h-9" />
            </div>

            {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded px-3 py-2">{error}</p>}
          </div>

          <DialogFooter className="mt-2 flex-row items-center gap-2">
            <div className="flex-1 text-sm">
              <span className="text-muted-foreground">New subtotal:</span>
              <span className="font-bold ml-1.5 text-primary">SAR {newSubtotal.toFixed(2)}</span>
            </div>
            <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button className="gradient-primary text-primary-foreground border-0" onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  );
}

// ─── Void Order Dialog ────────────────────────────────────────────────────────
function VoidOrderDialog({ order, open, onClose, onDone }: {
  order: Order; open: boolean; onClose: () => void; onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleVoid = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await api.voidOrder(order.id, { reason: reason.trim() || undefined });
      if (result.approvalRequestId) toast.info(result.message ?? "Void request sent for manager approval.");
      else toast.success("Order voided.");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to void order.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !saving) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DHeader>
          <DTitle className="flex items-center gap-2 text-base">
            <Ban className="h-4 w-4 text-red-500" /> Void Order — {order.orderNumber}
          </DTitle>
          <DialogDescription className="text-xs">
            This cancels the order and restores stock for its items.
          </DialogDescription>
        </DHeader>

        <div className="space-y-2 py-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Reason</p>
          <Input
            value={reason}
            onChange={e => { setReason(e.target.value); setError(""); }}
            placeholder="e.g. Duplicate sale, customer cancelled…"
            className="h-9"
          />
          {error && <p className="text-xs text-red-600 bg-red-50 dark:bg-red-950/30 rounded px-3 py-2">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="destructive" onClick={handleVoid} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
            Void Order
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Order Detail Drawer ──────────────────────────────────────────────────────
function OrderDetail({ orderId, onStatusChanged, autoAction }: {
  orderId: string; onStatusChanged: () => void;
  // Lets a row's Actions dropdown jump straight to Edit/Void instead of landing on the plain
  // detail view first — reuses this drawer's own dialogs/permission checks rather than
  // duplicating them at the table level.
  autoAction?: "edit" | "void" | null;
}) {
  const { canEdit, canApprove, canDelete: canDeleteOrder } = usePermission("Orders");
  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [newStatus, setNewStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [showRefundDialog, setShowRefundDialog] = useState(false);
  const [showEditOrderDialog, setShowEditOrderDialog] = useState(false);
  const [showVoidOrderDialog, setShowVoidOrderDialog] = useState(false);
  const [showInvoice, setShowInvoice] = useState(false);

  useEffect(() => {
    setLoading(true);
    api.getOrder(orderId).then(o => {
      setOrder(o);
      setNewStatus(o.orderStatus);
      if (autoAction === "edit" && canEdit) setShowEditOrderDialog(true);
      if (autoAction === "void" && canDeleteOrder) setShowVoidOrderDialog(true);
    }).finally(() => setLoading(false));
    // autoAction is only meant to fire once, right after this order loads — omitting it from deps
    // is deliberate so it doesn't re-open if the dialogs above get closed and the effect re-runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  const saveStatus = async () => {
    if (!order) return;
    if (newStatus === "refunded") {
      if (!canApprove) return;
      setShowRefundDialog(true);
      return;
    }
    setSaving(true);
    try {
      await api.updateOrderStatus(order.id, newStatus);
      setOrder(o => o ? { ...o, orderStatus: newStatus } : o);
      setEditing(false);
      onStatusChanged();
    } catch (e: any) {
      toast.error(e?.message || "Failed to update order status.");
    } finally { setSaving(false); }
  };

  if (loading) return (
    <div className="flex items-center justify-center h-48">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!order) return <div className="text-center py-12 text-muted-foreground">Order not found.</div>;

  return (
    <div className="space-y-5 pb-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="font-mono text-lg font-bold">{order.orderNumber}</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {new Date(order.createdAt).toLocaleString("en-SA", { dateStyle: "medium", timeStyle: "short" })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <SBadge status={order.orderStatus} />
          <SBadge status={order.paymentStatus} label={paymentBadgeLabel(order.paymentStatus)} />
          <div className="flex gap-1.5 mt-0.5">
            <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setShowInvoice(true)}>
              <Printer className="h-3.5 w-3.5" /> Print
            </Button>
            {/* A voided order that was already paid needs its money actually sent back — voiding
                alone only cancels the order, it never creates a refund/return (see OrderVoidService).
                Previously the only path to RefundDialog was picking "Refunded" from the status
                selector below, which disappears the instant orderStatus flips to "cancelled" on
                void — leaving no way to reach this screen at all for a voided-but-paid order. */}
            {canApprove && order.orderStatus === "cancelled" && order.paymentStatus === "cancelled" && (
              <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs text-destructive" onClick={() => setShowRefundDialog(true)}>
                <RotateCcw className="h-3.5 w-3.5" /> Process Refund
              </Button>
            )}
          </div>
        </div>
      </div>

      <Separator />

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Store className="h-4 w-4 shrink-0" />
          <div>
            <p className="text-[11px]">Branch</p>
            <p className="font-medium text-foreground">{order.branch?.name ?? "—"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-muted-foreground">
          <User className="h-4 w-4 shrink-0" />
          <div>
            <p className="text-[11px]">Cashier</p>
            <p className="font-medium text-foreground">{order.cashier?.fullName ?? "—"}</p>
          </div>
        </div>
        {order.customer && (
          <div className="flex items-center gap-2 text-muted-foreground col-span-2">
            <User className="h-4 w-4 shrink-0" />
            <div>
              <p className="text-[11px]">Customer</p>
              <p className="font-medium text-foreground">{order.customer.fullName}</p>
              {order.customer.phone && <p className="text-xs text-muted-foreground">{order.customer.phone}</p>}
              {order.customer.email && <p className="text-xs text-muted-foreground">{order.customer.email}</p>}
            </div>
          </div>
        )}
        {!!order.payments?.length && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <CreditCard className="h-4 w-4 shrink-0" />
            <div>
              <p className="text-[11px]">Payment</p>
              <p className="font-medium text-foreground">
                <PaymentBreakdown payments={order.payments} />
              </p>
            </div>
          </div>
        )}
      </div>

      <Separator />

      {/* Items */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
          <Package className="h-3.5 w-3.5" /> Items
        </p>
        <div className="space-y-2">
          {(order.items ?? []).map((item, i) => (
            <div key={i} className="flex items-center justify-between text-sm bg-muted/30 rounded-lg px-3 py-2">
              <div>
                <p className="font-medium">{(item as any).product?.name ?? "Product"}</p>
                <p className="text-xs text-muted-foreground"><SARIcon />{item.unitPrice.toFixed(2)} × {item.quantity}</p>
              </div>
              <p className="font-semibold tabular-nums"><SARIcon />{item.totalPrice.toFixed(2)}</p>
            </div>
          ))}
          {(order.items ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground italic">No items</p>
          )}
        </div>
      </div>

      <Separator />

      {/* Totals */}
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between text-muted-foreground">
          <span>Subtotal</span><span><SARIcon />{order.subtotal.toFixed(2)}</span>
        </div>
        {/* discountAmount is the all-inclusive total (coupon + named discounts + loyalty) — show
            each manually-applied discount by name (order.discounts), then a fallback "Discount"
            line for whatever's left unaccounted (a coupon, or a legacy order predating this
            breakdown), so the lines below always sum to the total exactly. */}
        {(order.discounts ?? []).map(d => (
          <div key={d.id} className="flex justify-between text-red-600">
            <span>{d.name}</span><span>-<SARIcon />{d.amount.toFixed(2)}</span>
          </div>
        ))}
        {(() => {
          const named = (order.discounts ?? []).reduce((s, d) => s + d.amount, 0);
          const other = order.discountAmount - (order.loyaltyDiscountAmount ?? 0) - named;
          return other > 0.005 ? (
            <div className="flex justify-between text-red-600">
              <span>Discount</span><span>-<SARIcon />{other.toFixed(2)}</span>
            </div>
          ) : null;
        })()}
        {!!order.loyaltyPointsRedeemed && order.loyaltyPointsRedeemed > 0 && (
          <div className="flex justify-between text-red-600">
            <span>Loyalty Redeemed ({order.loyaltyPointsRedeemed.toLocaleString()} pts)</span>
            <span>-<SARIcon />{(order.loyaltyDiscountAmount ?? 0).toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between text-muted-foreground">
          <span>VAT</span><span><SARIcon />{order.taxAmount.toFixed(2)}</span>
        </div>
        {/* Both fold into totalAmount but previously had no line here at all, so the total
            didn't visibly reconcile against subtotal/discount/VAT for any order that had one. */}
        {!!order.tobaccoFeeAmount && order.tobaccoFeeAmount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Tobacco Excise</span><span><SARIcon />{order.tobaccoFeeAmount.toFixed(2)}</span>
          </div>
        )}
        {!!order.customFeeAmount && order.customFeeAmount > 0 && (
          <div className="flex justify-between text-muted-foreground">
            <span>Service Charge</span><span><SARIcon />{order.customFeeAmount.toFixed(2)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base border-t pt-2 mt-1">
          <span>Total</span><span className="text-primary"><SARIcon />{order.totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <Separator />

      {/* Status update */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Update Status</p>
        {editing ? (
          <div className="space-y-2">
            <Select value={newStatus} onValueChange={setNewStatus}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {editableStatusOptions(order.orderStatus).map(s => (
                  <SelectItem key={s} value={s}>
                    <span className="capitalize">{s.replace(/_/g, " ")}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" onClick={saveStatus} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
              </Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(false); setNewStatus(order.orderStatus); }}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">{statusIcon(order.orderStatus)}<span className="capitalize text-sm">{order.orderStatus.replace(/_/g, " ")}</span></div>
            {canEdit && !["cancelled", "refunded"].includes(order.orderStatus) && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => setEditing(true)}>
                <Pencil className="h-3.5 w-3.5" /> Change
              </Button>
            )}
          </div>
        )}
      </div>

      {showRefundDialog && (
        <RefundDialog
          order={order}
          open={showRefundDialog}
          onClose={() => setShowRefundDialog(false)}
          onDone={() => {
            setShowRefundDialog(false);
            setEditing(false);
            setOrder(o => o ? { ...o, orderStatus: "refunded", paymentStatus: "refunded" } : o);
            onStatusChanged();
          }}
        />
      )}

      {showEditOrderDialog && (
        <EditOrderDialog
          order={order}
          open={showEditOrderDialog}
          onClose={() => setShowEditOrderDialog(false)}
          onDone={async () => {
            setShowEditOrderDialog(false);
            const refreshed = await api.getOrder(order.id);
            setOrder(refreshed);
            onStatusChanged();
          }}
        />
      )}

      {showVoidOrderDialog && (
        <VoidOrderDialog
          order={order}
          open={showVoidOrderDialog}
          onClose={() => setShowVoidOrderDialog(false)}
          onDone={async () => {
            setShowVoidOrderDialog(false);
            const refreshed = await api.getOrder(order.id);
            setOrder(refreshed);
            onStatusChanged();
          }}
        />
      )}

      {/* Same Tax Invoice view/print/download as Sales and ZATCA Invoices, so the receipt printed
          from here carries the same ZATCA QR instead of the old QR-less plain-HTML print. */}
      <OrderInvoiceDialog orderId={showInvoice ? order.id : null} onClose={() => setShowInvoice(false)} />
    </div>
  );
}

// ─── POS Tab ──────────────────────────────────────────────────────────────────
function POSTab() {
  const { user } = useAuth();
  const companyHeader = useCompanyHeader();
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;

  const PAGE_SIZE = 50;
  const [orders, setOrders] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [stFilter, setStFilter] = useState<string[]>([]);
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  // Seeded from ?orderId= so a link from Sales (or anywhere else) opens straight to that order's
  // detail sheet instead of landing on the bare list.
  const { orderId: linkedOrderId } = Route.useSearch();
  const [selectedId, setSelectedId] = useState<string | null>(linkedOrderId ?? null);
  // Which dialog to jump straight to once the detail drawer's order finishes loading — set by the
  // row Actions dropdown's Edit/Void items, cleared once a row is opened for plain viewing.
  const [autoAction, setAutoAction] = useState<"edit" | "void" | null>(null);
  // Approval Center work that concerns THIS list — a queued cancellation/modification is invisible
  // on the order itself otherwise, which is exactly what made managers miss these requests.
  const { canApprove: canApproveOrders, canEdit: canEditOrders, canDelete: canDeleteOrders } = usePermission("Orders");
  const [decidingId, setDecidingId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<Order | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // Sync if user loads after mount (auth hydration)
  useEffect(() => {
    if (lockedBranchId) setBranchIds([lockedBranchId]);
  }, [lockedBranchId]);

  useEffect(() => {
    if (!lockedBranchId) api.getBranches("active").then(setBranches).catch(() => {});
  }, [lockedBranchId]);

  // Changing a filter invalidates whatever page we were on (page 3 of the old result set may not
  // exist in the new one) — jump back to page 1 rather than requesting a now-meaningless offset.
  useEffect(() => { setPage(1); }, [branchIds, stFilter, paymentMethodFilter, dateFrom, dateTo]);

  const load = useCallback(() => {
    setLoading(true);
    api.getOrdersPaged({
      branchId: branchIds.length ? branchIds : undefined,
      status: stFilter.length ? stFilter : undefined,
      paymentMethod: paymentMethodFilter.length ? paymentMethodFilter : undefined,
      from: dateFrom || undefined,
      to: dateTo || undefined,
      page,
      pageSize: PAGE_SIZE,
    })
      .then(({ items, total }) => { setOrders(items); setTotal(total); setLoadError(false); })
      // Keep previously loaded orders on failure — an unhandled rejection here used to
      // render zero tiles / an empty list as if loaded (86eyag3ny).
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [branchIds, stFilter, paymentMethodFilter, dateFrom, dateTo, page]);

  useEffect(() => { load(); }, [load]);

  // Client-side text search — scoped to the currently loaded page only, since orders are now
  // fetched a page at a time rather than all-at-once (see bug3: "Showing 200 of 200 orders").
  const filtered = useMemo(() => orders.filter(o => {
    if (!q) return true;
    return o.orderNumber?.toLowerCase().includes(q.toLowerCase()) ||
      o.branch?.name?.toLowerCase().includes(q.toLowerCase()) ||
      o.cashier?.fullName?.toLowerCase().includes(q.toLowerCase());
  }), [orders, q]);

  // Summary cards — Total Orders reflects the full filtered result set (server-counted); Revenue
  // and Pending are necessarily scoped to the current page now that orders are paginated.
  const totalRevenue = filtered.reduce((s, o) => s + o.totalAmount, 0);
  const pendingCount = filtered.filter(o => o.orderStatus === "pending").length;
  const pendingApprovalCount = filtered.filter(o => o.pendingApproval).length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = !!q || branchIds.length > (lockedBranchId ? 1 : 0) || stFilter.length > 0 || paymentMethodFilter.length > 0 || !!dateFrom || !!dateTo;
  const clearFilters = () => {
    setQ("");
    setBranchIds(lockedBranchId ? [lockedBranchId] : []);
    setStFilter([]);
    setPaymentMethodFilter([]);
    setDateFrom("");
    setDateTo("");
  };

  const decideApproval = async (order: Order, approved: boolean, reason?: string) => {
    if (!order.pendingApproval) return;
    setDecidingId(order.pendingApproval.id);
    try {
      await api.decideApproval(order.pendingApproval.id, approved, reason);
      toast.success(approved ? "Request approved." : "Request rejected.");
      setRejecting(null);
      setRejectReason("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit decision");
    } finally {
      setDecidingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {loadError && <LoadErrorBanner onRetry={load} />}
      {/* Summary */}
      <div className={`grid gap-3 ${pendingApprovalCount > 0 ? "grid-cols-4" : "grid-cols-3"}`}>
        {[
          { label: "Total Orders", value: total, color: "text-foreground" },
          { label: "Revenue (this page)", value: <><SARIcon />{fmtSAR(totalRevenue)}</>, color: "text-primary" },
          { label: "Pending (this page)", value: pendingCount, color: "text-yellow-600" },
          // Only shown when there is actually something waiting — a permanent "0 awaiting
          // approval" tile trains people to stop reading it.
          ...(pendingApprovalCount > 0
            ? [{ label: canApproveOrders ? "Awaiting your approval" : "Awaiting approval", value: pendingApprovalCount, color: "text-destructive" }]
            : []),
        ].map(c => (
          <Card key={c.label} className="px-4 py-3 border-border/60 shadow-card">
            <p className="text-xs text-muted-foreground">{c.label}</p>
            <p className={`text-lg font-bold tabular-nums ${c.color}`}>{c.value}</p>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search order number, branch, cashier…" className="h-9 w-64 flex-shrink-0" />
        {!lockedBranchId && (
          <div className="w-40">
            <SearchableMultiSelect
              placeholder="All Branches"
              options={branches.map(b => ({ id: b.id, label: b.name }))}
              selected={branchIds}
              onChange={setBranchIds}
            />
          </div>
        )}
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={ORDER_STATUSES.map(s => ({ id: s, label: s.replace(/_/g, " ") }))}
            selected={stFilter}
            onChange={setStFilter}
          />
        </div>
        <div className="w-40">
          <SearchableMultiSelect
            placeholder="All Payment Methods"
            options={["cash", "card", "wallet", "qr"].map(m => ({ id: m, label: paymentMethodLabel(m) }))}
            selected={paymentMethodFilter}
            onChange={setPaymentMethodFilter}
          />
        </div>
        <DateRangeField from={dateFrom} to={dateTo} onFromChange={setDateFrom} onToChange={setDateTo} />
        {hasFilters && (
          <Button variant="ghost" size="sm" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
            <X className="h-3.5 w-3.5" /> Clear Filters
          </Button>
        )}
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => load()}>
          <RefreshCw className="h-4 w-4" /> Refresh
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => exportCSV(filtered, companyHeader)} disabled={filtered.length === 0}>
          <Download className="h-4 w-4" /> Export CSV
        </Button>
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={() => printOrders(filtered, companyHeader)} disabled={filtered.length === 0}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading orders…
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-start text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Order#</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Cashier</th>
                  <th className="px-3 py-3 font-semibold">Customer</th>
                  <th className="px-3 py-3 font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Payment</th>
                  {/* Only rendered for people who can actually decide — for everyone else it would
                      be a column of "waiting" they can do nothing about. */}
                  {(canApproveOrders || pendingApprovalCount > 0) && <th className="px-3 py-3 font-semibold">Approval</th>}
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold w-10">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const orderEditable = !["cancelled", "refunded"].includes(o.orderStatus);
                  return (
                  <tr
                    key={o.id}
                    className="border-b border-border/40 hover:bg-muted/30 last:border-0 transition-colors"
                  >
                    <td className="px-3 py-3 font-mono text-xs font-bold">
                      <button
                        className="text-primary hover:underline focus-visible:underline outline-none"
                        onClick={() => { setAutoAction(null); setSelectedId(o.id); }}
                      >
                        {o.orderNumber}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs">{o.branch?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{o.cashier?.fullName ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{o.customer?.fullName ?? "Walk-in"}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold"><SARIcon />{fmtSAR(o.totalAmount)}</td>
                    <td className="px-3 py-3"><SBadge status={o.orderStatus} /></td>
                    <td className="px-3 py-3">
                      <SBadge status={o.paymentStatus} label={paymentBadgeLabel(o.paymentStatus)} />
                      {(o.payments?.length ?? 0) > 1 && (
                        <p className="mt-1 text-[11px] text-muted-foreground whitespace-nowrap">
                          <PaymentBreakdown payments={o.payments} />
                        </p>
                      )}
                    </td>
                    {(canApproveOrders || pendingApprovalCount > 0) && (
                      <td className="px-3 py-3">
                        {o.pendingApproval ? (
                          <div className="flex flex-col gap-1.5">
                            <Badge variant="secondary" className="w-fit gap-1 text-[10px] whitespace-nowrap">
                              <Clock className="h-3 w-3" />
                              {APPROVAL_TYPE_LABELS[o.pendingApproval.requestType] ?? "Pending approval"}
                            </Badge>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              by {o.pendingApproval.requestedByName ?? "—"}
                            </span>
                            {canApproveOrders && (
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm" className="h-6 px-2 text-[11px] gradient-primary text-primary-foreground border-0"
                                  disabled={decidingId === o.pendingApproval.id}
                                  onClick={() => decideApproval(o, true)}
                                >
                                  Approve
                                </Button>
                                <Button
                                  size="sm" variant="outline" className="h-6 px-2 text-[11px] border-destructive/50 text-destructive"
                                  disabled={decidingId === o.pendingApproval.id}
                                  onClick={() => setRejecting(o)}
                                >
                                  Reject
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3 text-xs text-muted-foreground">
                      {new Date(o.createdAt).toLocaleDateString("en-SA")}
                    </td>
                    <td className="px-3 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Row actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => { setAutoAction(null); setSelectedId(o.id); }}>
                            <Eye className="h-3.5 w-3.5 mr-2" /> View Details
                          </DropdownMenuItem>
                          {canEditOrders && orderEditable && (
                            <DropdownMenuItem onClick={() => { setAutoAction("edit"); setSelectedId(o.id); }}>
                              <Pencil className="h-3.5 w-3.5 mr-2" /> Edit
                            </DropdownMenuItem>
                          )}
                          {canDeleteOrders && orderEditable && (
                            <DropdownMenuItem className="text-destructive" onClick={() => { setAutoAction("void"); setSelectedId(o.id); }}>
                              <Ban className="h-3.5 w-3.5 mr-2" /> Void
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={canApproveOrders || pendingApprovalCount > 0 ? 10 : 9} className="text-center py-12 text-muted-foreground text-sm">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No orders match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 text-xs text-muted-foreground">
              <span>
                Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} orders
              </span>
              {totalPages > 1 && (
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        href="#"
                        onClick={e => { e.preventDefault(); if (page > 1) setPage(p => p - 1); }}
                        className={page <= 1 ? "pointer-events-none opacity-40" : ""}
                      />
                    </PaginationItem>
                    <PaginationItem>
                      <span className="px-2 tabular-nums">Page {page} of {totalPages}</span>
                    </PaginationItem>
                    <PaginationItem>
                      <PaginationNext
                        href="#"
                        onClick={e => { e.preventDefault(); if (page < totalPages) setPage(p => p + 1); }}
                        className={page >= totalPages ? "pointer-events-none opacity-40" : ""}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Reject a queued cancellation/modification — a reason is mandatory server-side. */}
      <Dialog open={!!rejecting} onOpenChange={v => { if (!v) { setRejecting(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DHeader><DTitle className="text-base">Reject request</DTitle></DHeader>
          {rejecting?.pendingApproval && (
            <div className="space-y-3">
              <p className="text-sm">{rejecting.pendingApproval.summary}</p>
              <p className="text-xs text-muted-foreground">
                Requested by {rejecting.pendingApproval.requestedByName ?? "—"} on{" "}
                {new Date(rejecting.pendingApproval.requestedAt).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" })}
              </p>
              <Input
                value={rejectReason}
                onChange={e => setRejectReason(e.target.value)}
                placeholder="Rejection reason (required)"
                className="h-9"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejecting(null); setRejectReason(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim() || decidingId === rejecting?.pendingApproval?.id}
              onClick={() => rejecting && decideApproval(rejecting, false, rejectReason.trim())}
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Order detail drawer */}
      <Sheet open={!!selectedId} onOpenChange={v => { if (!v) { setSelectedId(null); setAutoAction(null); } }}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2">
              <Package className="h-4 w-4" /> Order Details
            </SheetTitle>
          </SheetHeader>
          {selectedId && (
            <OrderDetail
              orderId={selectedId}
              onStatusChanged={load}
              autoAction={autoAction}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Online Tab ───────────────────────────────────────────────────────────────
// Real online orders placed from the public per-branch ordering page (see the "Online Ordering
// QR" panel on /branches) — pending ones need review (edit line items / price overrides / OOS
// removal), Approve or Reject, then a separate "Mark Delivered" step once out for delivery, which
// is the point stock actually leaves the shelf and the StockMovement ledger is written.
const ONLINE_STATUS_TABS = [
  { value: "pending", label: "Pending" },
  { value: "ready_to_deliver", label: "Ready to Deliver" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

function OnlineOrderDetail({ order, onItemsSaved, onStatusChanged }: {
  order: OnlineOrder; onItemsSaved: () => void; onStatusChanged: () => void;
}) {
  const [items, setItems] = useState<OnlineOrderItemEdit[]>(
    order.items.map(i => ({ orderItemId: i.id, productId: i.productId, quantity: i.quantity, unitPrice: i.unitPrice })),
  );
  const [names] = useState<Record<string, string>>(
    () => Object.fromEntries(order.items.map(i => [i.productId, i.productName ?? i.productId])),
  );
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [delivering, setDelivering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [feeAmount, setFeeAmount] = useState(String(order.deliveryFeeAmount ?? 0));
  const [feeReason, setFeeReason] = useState("");

  const editable = order.orderStatus === "pending";
  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);

  const updateItem = (productId: string, patch: Partial<OnlineOrderItemEdit>) => {
    setItems(prev => prev.map(i => i.productId === productId ? { ...i, ...patch } : i));
    setDirty(true);
  };
  const removeItem = (productId: string) => {
    setItems(prev => prev.filter(i => i.productId !== productId));
    setDirty(true);
  };

  const saveItems = async () => {
    setSaving(true);
    try {
      await api.updateOnlineOrderItems(order.id, items);
      toast.success("Order items updated.");
      setDirty(false);
      onItemsSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update items");
    } finally {
      setSaving(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await api.approveOnlineOrder(order.id, "cash");
      toast.success("Order approved for Cash on Delivery.");
      setApproving(false);
      onStatusChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve order");
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    if (!rejectReason.trim()) return;
    setBusy(true);
    try {
      await api.rejectOnlineOrder(order.id, rejectReason.trim());
      toast.success("Order rejected.");
      setRejecting(false);
      setRejectReason("");
      onStatusChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reject order");
    } finally {
      setBusy(false);
    }
  };

  const saveDeliveryFee = async () => {
    const amount = Number(feeAmount);
    if (Number.isNaN(amount) || amount < 0) {
      toast.error("Enter a valid delivery fee.");
      return;
    }
    setBusy(true);
    try {
      await api.updateOnlineOrderDeliveryFee(order.id, amount, feeReason.trim() || undefined);
      toast.success("Delivery fee updated.");
      setFeeOpen(false);
      setFeeReason("");
      onItemsSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update the delivery fee");
    } finally {
      setBusy(false);
    }
  };

  const deliver = async () => {
    setBusy(true);
    try {
      await api.deliverOnlineOrder(order.id);
      toast.success("Marked delivered — stock and ledger updated.");
      setDelivering(false);
      onStatusChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to mark delivered");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm font-bold text-primary">{order.orderNumber}</p>
        <SBadge status={order.orderStatus} />
      </div>

      {order.delivery && (
        <Card className="p-3 space-y-1.5 border-border/60">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Delivery details</p>
          <p className="text-sm font-medium flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-muted-foreground" /> {order.delivery.fullName}</p>
          <p className="text-sm flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 text-muted-foreground" /> {order.delivery.phone}</p>
          {order.delivery.email && <p className="text-sm flex items-center gap-1.5"><Mail className="h-3.5 w-3.5 text-muted-foreground" /> {order.delivery.email}</p>}
          <p className="text-sm flex items-start gap-1.5"><MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" /> {order.delivery.addressLine}</p>
          {order.delivery.notes && <p className="text-xs text-muted-foreground italic">Note: {order.delivery.notes}</p>}
          {order.delivery.latitude != null && order.delivery.longitude != null && (
            <AddressMapPreview latitude={order.delivery.latitude} longitude={order.delivery.longitude} />
          )}
        </Card>
      )}

      <Card className="p-3 space-y-2 border-border/60">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Items</p>
        {items.map(item => (
          <div key={item.productId} className="flex items-center gap-2">
            <span className="flex-1 min-w-0 text-sm truncate">{names[item.productId] ?? item.productId}</span>
            {editable ? (
              <>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateItem(item.productId, { quantity: Math.max(1, item.quantity - 1) })}>
                    <Minus className="h-3 w-3" />
                  </Button>
                  <span className="w-6 text-center text-sm tabular-nums">{item.quantity}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateItem(item.productId, { quantity: item.quantity + 1 })}>
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
                <Input
                  type="number" step="0.01" value={item.unitPrice}
                  onChange={e => updateItem(item.productId, { unitPrice: Number(e.target.value) || 0 })}
                  className="h-7 w-20 text-xs tabular-nums"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeItem(item.productId)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            ) : (
              <span className="text-sm tabular-nums text-muted-foreground">{item.quantity} × <SARIcon />{item.unitPrice.toFixed(2)}</span>
            )}
          </div>
        ))}
        <div className="flex justify-between text-sm font-semibold pt-2 border-t">
          <span>Subtotal</span>
          <span className="tabular-nums"><SARIcon />{subtotal.toFixed(2)}</span>
        </div>

        {/* Delivery is shown in both states, unlike the other fees: it's the line staff most often
            need to change, and while the order is pending it's editable in place. */}
        <div className="flex justify-between items-center text-xs text-muted-foreground gap-2">
          <span className="min-w-0 truncate">
            Delivery
            {order.delivery?.deliveryFeeRuleName && ` · ${order.delivery.deliveryFeeRuleName}`}
            {order.delivery?.deliveryDistanceKm != null && ` · ${order.delivery.deliveryDistanceKm} km`}
          </span>
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="tabular-nums"><SARIcon />{(order.deliveryFeeAmount ?? 0).toFixed(2)}</span>
            {editable && (
              <Button size="sm" variant="ghost" className="h-6 px-1.5 text-[10px]"
                onClick={() => { setFeeAmount(String(order.deliveryFeeAmount ?? 0)); setFeeOpen(true); }}>
                Change
              </Button>
            )}
          </span>
        </div>
        {order.delivery?.deliveryFeeOverriddenAt && (
          <p className="text-[10px] text-muted-foreground italic">
            Fee changed by staff{order.delivery.deliveryFeeOverrideReason ? ` — ${order.delivery.deliveryFeeOverrideReason}` : ""}
          </p>
        )}

        {!editable && (
          <>
            {order.tobaccoFeeAmount > 0 && (
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Tobacco excise fee</span>
                <span className="tabular-nums"><SARIcon />{order.tobaccoFeeAmount.toFixed(2)}</span>
              </div>
            )}
            {order.serviceCharges.map(f => (
              <div key={f.id} className="flex justify-between text-xs text-muted-foreground">
                <span>{f.name}</span>
                <span className="tabular-nums"><SARIcon />{f.amount.toFixed(2)}</span>
              </div>
            ))}
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>VAT</span>
              <span className="tabular-nums"><SARIcon />{order.taxAmount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span>Total (incl. tax)</span>
              <span className="tabular-nums"><SARIcon />{order.totalAmount.toFixed(2)}</span>
            </div>
          </>
        )}
        {editable && dirty && (
          <Button size="sm" className="w-full gap-1.5" disabled={saving || items.length === 0} onClick={saveItems}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Save changes
          </Button>
        )}
      </Card>

      {order.orderStatus === "cancelled" && order.rejectionReason && (
        <p className="text-xs text-destructive">Rejected: {order.rejectionReason}</p>
      )}

      {editable && (
        <div className="flex gap-2">
          <Button className="flex-1 gradient-primary text-primary-foreground border-0" disabled={dirty} onClick={() => setApproving(true)}>
            Approve
          </Button>
          <Button variant="outline" className="flex-1 border-destructive/50 text-destructive" onClick={() => setRejecting(true)}>
            Reject
          </Button>
        </div>
      )}
      {order.orderStatus === "ready_to_deliver" && (
        <Button className="w-full gap-1.5" onClick={() => setDelivering(true)}>
          <Truck className="h-4 w-4" /> Mark Delivered
        </Button>
      )}

      <Dialog open={approving} onOpenChange={v => !busy && setApproving(v)}>
        <DialogContent className="sm:max-w-sm">
          <DHeader><DTitle className="text-base">Approve order</DTitle></DHeader>
          <p className="text-sm text-muted-foreground">
            Payment method: <span className="font-medium text-foreground">Cash on Delivery</span> (the only option available today).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(false)} disabled={busy}>Cancel</Button>
            <Button onClick={approve} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Approve"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rejecting} onOpenChange={v => !busy && setRejecting(v)}>
        <DialogContent className="sm:max-w-sm">
          <DHeader><DTitle className="text-base">Reject order</DTitle></DHeader>
          <Input value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Rejection reason (required)" className="h-9" />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(false)} disabled={busy}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim() || busy} onClick={reject}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={feeOpen} onOpenChange={v => !busy && setFeeOpen(v)}>
        <DialogContent className="sm:max-w-sm">
          <DHeader><DTitle className="text-base">Change delivery fee</DTitle></DHeader>
          <DialogDescription>
            Replaces the fee the delivery zones worked out for this address. The order total adjusts by the difference.
          </DialogDescription>
          <div className="space-y-2">
            <Input type="number" step="0.01" min={0} className="h-9" value={feeAmount}
              onChange={e => setFeeAmount(e.target.value)} placeholder="0.00" />
            <Input className="h-9" value={feeReason} onChange={e => setFeeReason(e.target.value)}
              placeholder="Reason (optional — recorded in the audit trail)" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFeeOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={saveDeliveryFee} disabled={busy}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save fee"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={delivering} onOpenChange={v => !busy && setDelivering(v)}>
        <DialogContent className="sm:max-w-sm">
          <DHeader><DTitle className="text-base">Mark as delivered?</DTitle></DHeader>
          <DialogDescription>
            This deducts stock and records the sale in the inventory ledger — it can't be undone from here.
          </DialogDescription>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelivering(false)} disabled={busy}>Cancel</Button>
            <Button onClick={deliver} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm Delivered"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function OnlineTab() {
  const { user, canViewModule } = useAuth();
  const { canApprove, canEdit } = usePermission("Online Orders");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const canView = canViewModule("Online Orders");

  const PAGE_SIZE = 20;
  const [orders, setOrders] = useState<OnlineOrder[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("pending");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => { setPage(1); }, [status]);

  const load = useCallback(() => {
    if (!canView) { setLoading(false); return; }
    setLoading(true);
    api.getOnlineOrdersPaged({
      branchId: lockedBranchId ? [lockedBranchId] : undefined,
      status: [status],
      page, pageSize: PAGE_SIZE,
    })
      .then(({ items, total }) => { setOrders(items); setTotal(total); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [canView, lockedBranchId, status, page]);

  useEffect(() => { load(); }, [load]);

  const selected = orders.find(o => o.id === selectedId) ?? null;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (!canView) {
    return (
      <Card className="p-8 border-border/60 shadow-card text-center text-muted-foreground text-sm">
        <Globe className="h-8 w-8 mx-auto mb-3 opacity-40" />
        You don't have access to online orders.
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {loadError && <LoadErrorBanner onRetry={load} />}
      <Tabs value={status} onValueChange={setStatus}>
        <TabsList>
          {ONLINE_STATUS_TABS.map(t => <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>)}
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading online orders…
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-start text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Order#</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Customer</th>
                  <th className="px-3 py-3 font-semibold">Items</th>
                  <th className="px-3 py-3 font-semibold">Total</th>
                  <th className="px-3 py-3 font-semibold">Date</th>
                  <th className="px-3 py-3 font-semibold w-10">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orders.map(o => (
                  <tr
                    key={o.id}
                    className="border-b border-border/40 hover:bg-muted/30 last:border-0 transition-colors"
                  >
                    <td className="px-3 py-3 font-mono text-xs font-bold">
                      <button className="text-primary hover:underline focus-visible:underline outline-none" onClick={() => setSelectedId(o.id)}>
                        {o.orderNumber}
                      </button>
                    </td>
                    <td className="px-3 py-3 text-xs">{o.branch?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{o.delivery?.fullName ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{o.items.length}</td>
                    <td className="px-3 py-3 tabular-nums font-semibold"><SARIcon />{fmtSAR(o.totalAmount)}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground">{new Date(o.createdAt).toLocaleDateString("en-SA")}</td>
                    <td className="px-3 py-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground" title="Row actions">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setSelectedId(o.id)}>
                            <Eye className="h-3.5 w-3.5 mr-2" /> View Details
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground text-sm">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2 opacity-40" />
                      No {ONLINE_STATUS_TABS.find(t => t.value === status)?.label.toLowerCase()} online orders.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-2 border-t border-border/40 text-xs text-muted-foreground">
              <span>Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} of {total} orders</span>
              {totalPages > 1 && (
                <Pagination className="mx-0 w-auto">
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious href="#" onClick={e => { e.preventDefault(); if (page > 1) setPage(p => p - 1); }} className={page <= 1 ? "pointer-events-none opacity-40" : ""} />
                    </PaginationItem>
                    <PaginationItem><span className="px-2 tabular-nums">Page {page} of {totalPages}</span></PaginationItem>
                    <PaginationItem>
                      <PaginationNext href="#" onClick={e => { e.preventDefault(); if (page < totalPages) setPage(p => p + 1); }} className={page >= totalPages ? "pointer-events-none opacity-40" : ""} />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              )}
            </div>
          )}
        </Card>
      )}

      <Sheet open={!!selectedId} onOpenChange={v => !v && setSelectedId(null)}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader className="mb-4">
            <SheetTitle className="flex items-center gap-2"><Package className="h-4 w-4" /> Online Order</SheetTitle>
          </SheetHeader>
          {selected && (
            <OnlineOrderDetail
              order={selected}
              onItemsSaved={load}
              onStatusChanged={() => { load(); setSelectedId(null); }}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
function Orders() {
  // `defaultValue`, not a controlled value: the URL decides where you LAND, then switching tabs by
  // hand works normally without rewriting the address bar on every click.
  const { tab } = Route.useSearch();
  return (
    <PageShell title="Orders" subtitle="POS and online order management">
      <Tabs defaultValue={tab ?? "pos"}>
        <TabsList className="mb-4">
          <TabsTrigger value="pos">POS Orders</TabsTrigger>
          <TabsTrigger value="online" className="gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Online Orders
          </TabsTrigger>
        </TabsList>
        <TabsContent value="pos" className="mt-0"><POSTab /></TabsContent>
        <TabsContent value="online" className="mt-0"><OnlineTab /></TabsContent>
      </Tabs>
    </PageShell>
  );
}
