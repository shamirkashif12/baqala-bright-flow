import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useMemo, Fragment } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ArrowLeft, Pencil, MapPin, Phone, User, Package, Boxes,
  ChevronDown, ChevronRight, Loader2, Warehouse as WarehouseIcon,
} from "lucide-react";
import {
  api,
  type Warehouse, type WarehouseStock,
  type PurchaseOrder, type StockTransfer, type SupplierCreditNote, type InventoryBatch,
} from "@/lib/api";
import { BatchExpandRow } from "@/components/batch-expand-row";
import { WarehouseFormSheet } from "@/components/warehouse-form-sheet";
import { SARIcon } from "@/lib/currency";
import { usePermission } from "@/lib/use-permission";

export const Route = createFileRoute("/_app/warehouses_/$warehouseId")({
  component: WarehouseDetail,
  notFoundComponent: () => (
    <PageShell title="Warehouse not found"><p className="text-sm text-muted-foreground">No warehouse with that ID.</p></PageShell>
  ),
});

function F({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

function WarehouseDetail() {
  const { warehouseId } = Route.useParams();
  const { canEdit } = usePermission("Warehouses");
  const [warehouse, setWarehouse] = useState<Warehouse | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFoundFlag, setNotFoundFlag] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [productFilter, setProductFilter] = useState("all");
  const [stock, setStock] = useState<WarehouseStock[]>([]);
  const [loadingStock, setLoadingStock] = useState(false);
  const [stockLoadError, setStockLoadError] = useState(false);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [wPos, setWPos] = useState<PurchaseOrder[]>([]);
  const [rtsTransfers, setRtsTransfers] = useState<StockTransfer[]>([]);
  const [wCreditNotes, setWCreditNotes] = useState<SupplierCreditNote[]>([]);
  const [loadingLedger, setLoadingLedger] = useState(false);
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const load = () => {
    setLoading(true);
    api.getWarehouse(warehouseId)
      .then(setWarehouse)
      .catch(() => setNotFoundFlag(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, [warehouseId]);

  const loadStock = () => {
    if (!warehouse) return;
    setLoadingStock(true);
    api.getWarehouseStock(warehouse.id)
      .then(s => { setStock(s); setStockLoadError(false); })
      .catch(() => setStockLoadError(true))
      .finally(() => setLoadingStock(false));
  };

  useEffect(() => {
    if (!warehouse) return;
    loadStock();
    api.getBatches({ warehouseId: warehouse.id }).then(setBatches).catch(() => {});
    setLoadingLedger(true);
    Promise.allSettled([
      api.getPurchaseOrders({ warehouseId: warehouse.id }),
      api.getStockTransfers({ sourceWarehouseId: warehouse.id, transferType: "warehouse_to_supplier" }),
      api.getCreditNotes({ sourceWarehouseId: warehouse.id }),
    ]).then(([posRes, rtsRes, cnRes]) => {
      if (posRes.status === "fulfilled") setWPos(posRes.value);
      if (rtsRes.status === "fulfilled") setRtsTransfers(rtsRes.value);
      if (cnRes.status === "fulfilled") setWCreditNotes(cnRes.value);
    }).finally(() => setLoadingLedger(false));
  }, [warehouse?.id]);

  // Options come from this warehouse's own stock rows — a product held elsewhere can never match
  // here, so listing the whole catalogue would only offer choices that return nothing.
  const productOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const s of stock) {
      if (s.productId && s.product?.name) byId.set(s.productId, s.product.name);
    }
    return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [stock]);

  // Stock reloads when the warehouse changes; drop a selection that isn't held here.
  useEffect(() => {
    if (productFilter !== "all" && !productOptions.some(p => p.id === productFilter)) setProductFilter("all");
  }, [productOptions, productFilter]);

  const filteredStock = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return stock.filter(s => {
      const mq = !needle
        || s.product?.name.toLowerCase().includes(needle)
        || s.product?.sku?.toLowerCase().includes(needle);
      const mp = productFilter === "all" || s.productId === productFilter;
      return mq && mp;
    });
  }, [stock, q, productFilter]);

  const totalStock = stock.reduce((s, r) => s + r.quantity, 0);
  const totalReserved = stock.reduce((s, r) => s + r.reservedQuantity, 0);
  const skuCount = stock.length;

  if (loading) {
    return (
      <PageShell title="Loading…">
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading warehouse details…</div>
      </PageShell>
    );
  }

  if (notFoundFlag || !warehouse) {
    return (
      <PageShell title="Warehouse not found">
        <p className="text-sm text-muted-foreground">No warehouse with that ID.</p>
      </PageShell>
    );
  }

  const transferById = new Map(rtsTransfers.map(t => [t.id, t]));
  const activeCreditNotes = wCreditNotes.filter(cn => cn.status !== "cancelled");
  const receivedPos = wPos.filter(p => p.status === "partial_received" || p.status === "fully_received");
  const totalReceived = receivedPos.reduce((s, p) => s + p.totalAmount, 0);
  const totalPaid = wPos.reduce((s, p) => s + p.paidAmount, 0);
  const rtsCredits = activeCreditNotes.reduce((s, cn) => s + cn.amount, 0);
  const netBalance = totalReceived - totalPaid - rtsCredits;
  const allPayments = wPos
    .flatMap(p => (p.payments ?? []).map(pay => ({ ...pay, poNumber: p.poNumber })))
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));

  return (
    <PageShell
      title={warehouse.name}
      subtitle={`${warehouse.code} · ${warehouse.city ?? "—"}`}
      actions={
        <>
          <Link to="/warehouses" className={buttonVariants({ variant: "outline", size: "sm" }) + " gap-1.5"}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Warehouses
          </Link>
          <Badge variant="outline" className={warehouse.status === "active" ? "bg-success/15 text-success border-success/30" : "bg-muted text-muted-foreground"}>
            {warehouse.status}
          </Badge>
        </>
      }
    >
      {stockLoadError && <LoadErrorBanner onRetry={loadStock} />}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <MetricCard label="SKUs" value={String(skuCount)} icon={Package} accent="primary" />
        <MetricCard label="Total Units" value={String(Math.round(totalStock))} icon={Boxes} accent="success" />
        <MetricCard label="Reserved" value={String(Math.round(totalReserved))} icon={Boxes} accent="default" />
        <MetricCard label="Capacity" value={warehouse.capacity ? warehouse.capacity.toLocaleString() : "—"} icon={WarehouseIcon} />
      </div>

      <Card className="p-5 border-border/60 shadow-card">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h3 className="font-bold text-sm flex items-center gap-2"><WarehouseIcon className="h-4 w-4 text-primary" /> Warehouse Info</h3>
          {canEdit && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => setEditOpen(true)}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {warehouse.city && (
            <div className="flex items-start gap-2 text-sm">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <span>{warehouse.address ? `${warehouse.address}, ` : ""}{warehouse.city}</span>
            </div>
          )}
          {warehouse.contactPerson && (
            <div className="flex items-center gap-2 text-sm">
              <User className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{warehouse.contactPerson}</span>
            </div>
          )}
          {warehouse.contactNumber && (
            <div className="flex items-center gap-2 text-sm">
              <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
              <span>{warehouse.contactNumber}</span>
            </div>
          )}
          <F label="Created" value={new Date(warehouse.createdAt).toLocaleDateString("en-SA")} />
        </div>
      </Card>

      <Tabs defaultValue="inventory">
        <TabsList className="h-9">
          <TabsTrigger value="inventory" className="text-xs">Stock & Batches</TabsTrigger>
          <TabsTrigger value="ledger" className="text-xs">Ledger</TabsTrigger>
        </TabsList>

        {/* Inventory */}
        <TabsContent value="inventory" className="mt-4">
          <Card className="p-5 border-border/60 shadow-card">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-bold text-sm flex items-center gap-2"><Package className="h-4 w-4 text-primary" /> Stock by Product</h3>
              <div className="flex items-center gap-2">
                <Select value={productFilter} onValueChange={setProductFilter}>
                  <SelectTrigger className="h-8 w-48 text-xs"><SelectValue placeholder="All Products" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Products</SelectItem>
                    {productOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search product name or SKU…" className="h-8 w-64 text-xs" />
              </div>
            </div>
            {loadingStock ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
            ) : filteredStock.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground">
                {stock.length === 0 ? "No stock records yet." : "No products match your search."}
              </div>
            ) : (
              <div className="rounded-lg border border-border/60">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="w-8 px-2 py-2.5" />
                        <th className="text-left px-3 py-2.5 font-semibold">Product</th>
                        <th className="text-right px-3 py-2.5 font-semibold">On Hand</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Reserved</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Available</th>
                        <th className="text-right px-3 py-2.5 font-semibold">Reorder Level</th>
                        <th className="text-left px-3 py-2.5 font-semibold">Nearest Expiry</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredStock.map(s => {
                        const isExpanded = expandedRow === s.id;
                        const productBatches = batches.filter(b => b.productId === s.productId && b.remainingQuantity > 0);
                        const earliestExpiry = productBatches.reduce<string | undefined>((min, b) => {
                          if (!b.expiryDate) return min;
                          return !min || new Date(b.expiryDate) < new Date(min) ? b.expiryDate : min;
                        }, undefined);
                        const days = earliestExpiry ? Math.ceil((new Date(earliestExpiry).getTime() - Date.now()) / 86400000) : null;
                        return (
                          <Fragment key={s.id}>
                            <tr className="border-t border-border/40 hover:bg-muted/20 cursor-pointer" onClick={() => setExpandedRow(isExpanded ? null : s.id)}>
                              <td className="px-2 py-2.5">
                                <button type="button" className="text-muted-foreground hover:text-foreground" title="Show batches"
                                  onClick={e => { e.stopPropagation(); setExpandedRow(isExpanded ? null : s.id); }}>
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                                </button>
                              </td>
                              <td className="px-3 py-2.5">
                                <p className="font-medium">{s.product?.name ?? "—"}</p>
                                <p className="text-[11px] font-mono text-muted-foreground">{s.product?.sku ?? "—"}</p>
                              </td>
                              <td className="px-3 py-2.5 text-right font-semibold">{s.quantity}</td>
                              <td className="px-3 py-2.5 text-right text-warning-foreground">{s.reservedQuantity}</td>
                              <td className="px-3 py-2.5 text-right text-success">{Math.max(0, s.quantity - s.reservedQuantity)}</td>
                              <td className="px-3 py-2.5 text-right text-muted-foreground">{s.reorderLevel}</td>
                              <td className="px-3 py-2.5">
                                {!earliestExpiry ? <span className="text-muted-foreground">—</span> : (
                                  <span className={days !== null && days < 0 ? "text-destructive font-medium" : days !== null && days <= 30 ? "text-warning-foreground font-medium" : "text-muted-foreground"}>
                                    {new Date(earliestExpiry).toLocaleDateString("en-SA", { day: "2-digit", month: "short", year: "numeric" })}
                                  </span>
                                )}
                              </td>
                            </tr>
                            {isExpanded && (
                              <BatchExpandRow productId={s.productId} locationType="warehouse" locationId={warehouse.id} colSpan={7} batches={batches} aggregateQuantity={s.quantity} />
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Ledger */}
        <TabsContent value="ledger" className="mt-4">
          <Card className="p-5 border-border/60 shadow-card">
            {loadingLedger ? (
              <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
            ) : (
              <div className="space-y-4">
                {/* Summary cards */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Total Invoiced", val: totalReceived, cls: "" },
                    { label: "Paid", val: totalPaid, cls: "text-success" },
                    { label: "RTS Credits", val: rtsCredits, cls: "text-primary" },
                  ].map(({ label, val, cls }) => (
                    <div key={label} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center">
                      <p className={`text-base font-bold ${cls}`}><SARIcon />{val.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">{label}</p>
                    </div>
                  ))}
                </div>
                {netBalance !== 0 && (
                  <div className={`rounded-xl border px-4 py-2.5 text-sm font-semibold flex justify-between ${netBalance > 0 ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-success/40 bg-success/5 text-success"}`}>
                    <span>{netBalance > 0 ? "Net Amount Owed to Suppliers" : "Net Credit from Suppliers"}</span>
                    <span><SARIcon />{Math.abs(netBalance).toLocaleString()}</span>
                  </div>
                )}

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* Goods received */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Goods Received (Payables)</p>
                    {receivedPos.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No goods received yet.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                        {receivedPos.map(p => (
                          <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border/30 text-xs">
                            <div>
                              <p className="font-medium font-mono">{p.poNumber}</p>
                              <p className="text-muted-foreground">
                                {new Date(p.receivedDate ?? p.updatedAt).toLocaleDateString("en-SA")}
                                {p.supplier?.name ? ` · ${p.supplier.name}` : ""}
                                {" · "}
                                <span className={p.paymentStatus === "paid" ? "text-success" : p.paymentStatus === "partial" ? "text-amber-600" : "text-destructive"}>
                                  {p.paymentStatus === "paid" ? "Paid" : p.paymentStatus === "partial" ? `Partial — SAR ${p.paidAmount.toLocaleString()} paid` : "Unpaid"}
                                </span>
                              </p>
                            </div>
                            <span className="font-semibold text-destructive flex items-center gap-0.5"><SARIcon />{p.totalAmount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Payments made */}
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Payments Made</p>
                    {allPayments.length === 0 ? (
                      <p className="text-sm text-muted-foreground py-4 text-center">No payments recorded yet.</p>
                    ) : (
                      <div className="space-y-1.5 max-h-96 overflow-y-auto pr-1">
                        {allPayments.map(pay => (
                          <div key={pay.id} className="flex items-center justify-between py-1.5 border-b border-border/30 text-xs">
                            <div>
                              <p className="font-medium">{new Date(pay.paymentDate).toLocaleDateString("en-SA")}</p>
                              <p className="text-muted-foreground">{pay.poNumber} · {pay.paymentMethod.replace(/_/g, " ")}</p>
                            </div>
                            <span className="font-semibold text-success flex items-center gap-0.5"><SARIcon />{pay.amount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Returns to Supplier */}
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Returns to Supplier (RTS)</p>
                  {wCreditNotes.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">No returns to supplier yet.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {wCreditNotes.map(cn => {
                        const t = cn.transferId ? transferById.get(cn.transferId) : undefined;
                        return (
                          <div key={cn.id} className="flex items-center justify-between py-1.5 border-b border-border/30 text-xs">
                            <div>
                              <p className="font-medium font-mono">
                                {t?.transferNumber ?? cn.creditNoteNumber ?? "—"}
                                {t?.transferNumber && cn.creditNoteNumber && (
                                  <span className="ml-1 text-muted-foreground font-normal">({cn.creditNoteNumber})</span>
                                )}
                              </p>
                              <p className="text-muted-foreground">
                                {new Date(cn.issuedDate).toLocaleDateString("en-SA")}
                                {(cn.supplier?.name ?? t?.destSupplier?.name) ? ` · ${cn.supplier?.name ?? t?.destSupplier?.name}` : ""}
                                {t?.returnReason ? ` · ${t.returnReason}` : ""}
                                {" · "}
                                <span className={cn.status === "applied" ? "text-success" : cn.status === "cancelled" ? "text-destructive" : "text-primary"}>{cn.status}</span>
                              </p>
                            </div>
                            <span className="font-semibold text-primary flex items-center gap-0.5"><SARIcon />{cn.amount.toLocaleString()}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <WarehouseFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        warehouse={warehouse}
        onSaved={load}
      />
    </PageShell>
  );
}
