import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { Truck, Eye, Pencil, Plus, Trash2, Package, CheckCircle, Clock, ShoppingCart } from "lucide-react";
import { SARIcon } from "@/lib/currency";
import { api, type Supplier, type PurchaseOrder, type SupplierCreditNote } from "@/lib/api";

export const Route = createFileRoute("/_app/suppliers")({ component: Suppliers });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}


type SupplierForm = { name: string; contactPerson: string; contactNumber: string; email: string; city: string; supplyType: string; status: string; };
const emptyForm: SupplierForm = { name: "", contactPerson: "", contactNumber: "", email: "", city: "", supplyType: "warehouse", status: "active" };

// Module-scope component — NOT inside SuppliersTab, so it never remounts on parent re-render
function SupplierFormFields({
  form,
  setForm,
  onSave,
  saving,
}: {
  form: SupplierForm;
  setForm: React.Dispatch<React.SetStateAction<SupplierForm>>;
  onSave: () => void;
  saving: boolean;
}) {
  const set = (k: keyof SupplierForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof SupplierForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));
  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Name"><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Al-Barakah Trading" /></FieldRow>
      <FieldRow label="Contact Person"><Input value={form.contactPerson} onChange={set("contactPerson")} className="h-9" /></FieldRow>
      <FieldRow label="Phone"><Input value={form.contactNumber} onChange={set("contactNumber")} className="h-9" /></FieldRow>
      <FieldRow label="Email"><Input value={form.email} onChange={set("email")} className="h-9" type="email" /></FieldRow>
      <FieldRow label="City"><Input value={form.city} onChange={set("city")} className="h-9" /></FieldRow>
      <FieldRow label="Supply Type">
        <Select value={form.supplyType} onValueChange={setS("supplyType")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="warehouse">Warehouse</SelectItem>
            <SelectItem value="both">Both (Direct + Warehouse)</SelectItem>
            <SelectItem value="mart_to_mart">Mart to Mart</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Status">
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving}>
        {saving ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}

const PO_STATUS_CLASS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-primary/15 text-primary",
  ordered: "bg-primary/15 text-primary",
  partial_received: "bg-warning/15 text-warning-foreground",
  fully_received: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

function SupplierProfileDrawer({ supplier, onClose, onEdit }: { supplier: Supplier | null; onClose: () => void; onEdit: (s: Supplier) => void }) {
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [creditNotes, setCreditNotes] = useState<SupplierCreditNote[]>([]);
  const [loadingPos, setLoadingPos] = useState(false);

  useEffect(() => {
    if (!supplier) return;
    setLoadingPos(true);
    Promise.allSettled([
      api.getPurchaseOrders({ supplierId: supplier.id }),
      api.getCreditNotes({ supplierId: supplier.id }),
    ]).then(([posResult, cnsResult]) => {
      if (posResult.status === "fulfilled") setPos(posResult.value);
      if (cnsResult.status === "fulfilled") setCreditNotes(cnsResult.value);
    }).finally(() => setLoadingPos(false));
  }, [supplier?.id]);

  const totalOwed = pos.reduce((s, p) => s + (p.totalAmount - p.paidAmount), 0);
  const rtsValue = creditNotes.filter(cn => cn.status !== "cancelled").reduce((s, cn) => s + cn.amount, 0);
  const netBalance = totalOwed - rtsValue;
  const pendingPos = pos.filter(p => p.status === "draft" || p.status === "approved" || p.status === "ordered").length;

  return (
    <Sheet open={!!supplier} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[540px] overflow-y-auto">
        {supplier && (
          <>
            <SheetHeader className="pb-4 border-b border-border/60">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <SheetTitle className="text-base">{supplier.name}</SheetTitle>
                  <p className="text-xs text-muted-foreground font-mono mt-0.5">{supplier.supplierCode}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={supplier.status} />
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(supplier)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-2 mt-4 mb-4">
              {[
                { label: "Total POs", value: String(pos.length), icon: ShoppingCart },
                { label: "Pending", value: String(pendingPos), icon: Clock },
                { label: "Net Balance", value: `SAR ${Math.abs(netBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}`, sub: netBalance > 0 ? "Owed" : "Credit", icon: Package },
              ].map(({ label, value, sub, icon: Icon }) => (
                <div key={label} className="rounded-xl border border-border/60 bg-muted/20 p-3 text-center">
                  <Icon className="h-4 w-4 text-primary mx-auto mb-1" />
                  <p className="text-xs font-bold truncate">{value}</p>
                  {sub && <p className={`text-[10px] font-semibold ${sub === "Credit" ? "text-success" : "text-destructive"}`}>{sub}</p>}
                  <p className="text-xs text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>

            <Tabs defaultValue="overview">
              <TabsList className="grid grid-cols-3 h-8">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="purchase-orders" className="text-xs">Orders</TabsTrigger>
                <TabsTrigger value="ledger" className="text-xs">Ledger</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-3">
                {([
                  ["Contact Person", supplier.contactPerson ?? "—"],
                  ["Phone", supplier.contactNumber ?? "—"],
                  ["Email", supplier.email ?? "—"],
                  ["City", supplier.city ?? "—"],
                  ["Supply Type", supplier.supplyType ?? "—"],
                  ["Status", supplier.status],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between border-b border-border/40 pb-2 text-sm">
                    <span className="text-muted-foreground">{l}</span>
                    <span className="font-medium capitalize">{v}</span>
                  </div>
                ))}
              </TabsContent>

              <TabsContent value="purchase-orders" className="mt-4">
                {loadingPos ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
                ) : pos.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">No purchase orders for this supplier.</div>
                ) : (
                  <div className="space-y-2">
                    {pos.map(po => (
                      <div key={po.id} className="rounded-xl border border-border/40 px-3 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="font-mono text-xs font-bold">{po.poNumber}</p>
                            <p className="text-xs text-muted-foreground">
                              {new Date(po.createdAt).toLocaleDateString("en-SA")}
                              {po.warehouse && ` · WH: ${po.warehouse.name}`}
                              {po.branch && ` · Branch: ${po.branch.name}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PO_STATUS_CLASS[po.status] ?? "bg-muted text-muted-foreground"}`}>
                              {po.status.replace(/_/g, " ")}
                            </span>
                            <span className="text-sm font-semibold flex items-center gap-0.5">
                              <SARIcon />
                              {po.totalAmount.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                          <span>{po.items?.length ?? 0} item{(po.items?.length ?? 0) !== 1 ? "s" : ""}</span>
                          <span className={po.paymentStatus === "paid" ? "text-success" : po.paymentStatus === "partial" ? "text-warning-foreground" : "text-destructive"}>
                            {po.paymentStatus === "paid" ? "Paid" : po.paymentStatus === "partial" ? `Partial (SAR ${po.paidAmount.toLocaleString()})` : "Unpaid"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              <TabsContent value="ledger" className="mt-4">
                {loadingPos ? (
                  <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
                ) : (
                  <div className="space-y-1.5">
                    {/* Summary */}
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      {[
                        { label: "Total Invoiced", val: pos.reduce((s, p) => s + p.totalAmount, 0), cls: "" },
                        { label: "Paid", val: pos.reduce((s, p) => s + p.paidAmount, 0), cls: "text-success" },
                        { label: "RTS Credits", val: rtsValue, cls: "text-primary" },
                      ].map(({ label, val, cls }) => (
                        <div key={label} className="rounded-xl border border-border/60 bg-muted/20 p-2.5 text-center">
                          <p className={`text-sm font-bold ${cls}`}>SAR {val.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className={`rounded-xl border px-3 py-2 text-sm font-semibold flex justify-between ${netBalance > 0 ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-success/40 bg-success/5 text-success"}`}>
                      <span>{netBalance > 0 ? "Net Amount Owed to Supplier" : "Net Credit from Supplier"}</span>
                      <span>SAR {Math.abs(netBalance).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                    </div>
                    {/* Goods Received — creates a payable */}
                    {pos.filter(p => p.status === "partial_received" || p.status === "fully_received").length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Payables to Supplier</p>
                        {pos.filter(p => p.status === "partial_received" || p.status === "fully_received").map(p => (
                          <div key={p.id} className="flex items-center justify-between py-1.5 border-b border-border/30 text-xs">
                            <div>
                              <p className="font-medium font-mono">{p.poNumber}</p>
                              <p className="text-muted-foreground">
                                {p.receivedDate ? new Date(p.receivedDate).toLocaleDateString("en-SA") : new Date(p.updatedAt).toLocaleDateString("en-SA")}
                                {" · "}
                                <span className={p.paymentStatus === "paid" ? "text-success" : p.paymentStatus === "partial" ? "text-warning-foreground" : "text-destructive"}>
                                  {p.paymentStatus === "paid" ? "Paid" : p.paymentStatus === "partial" ? `Partial — SAR ${p.paidAmount.toLocaleString()} paid` : "Unpaid"}
                                </span>
                              </p>
                            </div>
                            <span className="font-semibold text-destructive flex items-center gap-0.5"><SARIcon />{p.totalAmount.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Payments */}
                    {pos.flatMap(p => p.payments ?? []).length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Payments to Supplier</p>
                        {pos.flatMap(p => (p.payments ?? []).map(pay => ({ ...pay, poNumber: p.poNumber }))).sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).map(pay => (
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
                    {/* Credit Notes (RTS + Shortage Claims) */}
                    {creditNotes.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Credit Notes from Supplier</p>
                        {creditNotes.map(cn => (
                          <div key={cn.id} className="flex items-center justify-between py-1.5 border-b border-border/30 text-xs">
                            <div>
                              <p className="font-medium font-mono">{cn.creditNoteNumber ?? "—"}</p>
                              <p className="text-muted-foreground">
                                {new Date(cn.issuedDate).toLocaleDateString("en-SA")}
                                {" · "}
                                <span className="capitalize">{cn.creditType.replace(/_/g, " ")}</span>
                                {" · "}
                                <span className={cn.status === "applied" ? "text-success" : cn.status === "cancelled" ? "text-destructive" : "text-primary"}>
                                  {cn.status}
                                </span>
                              </p>
                            </div>
                            <span className="font-semibold text-primary flex items-center gap-0.5"><SARIcon />{cn.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {pos.flatMap(p => p.payments ?? []).length === 0 && creditNotes.length === 0 && (
                      <p className="text-center py-6 text-sm text-muted-foreground">No ledger entries yet.</p>
                    )}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getSuppliers().then(setSuppliers).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openEdit = (s: Supplier) => {
    setEditSupplier(s);
    setForm({ name: s.name, contactPerson: s.contactPerson ?? "", contactNumber: s.contactNumber ?? "", email: s.email ?? "", city: s.city ?? "", supplyType: s.supplyType ?? "warehouse", status: s.status });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editSupplier) {
        await api.updateSupplier(editSupplier.id, form);
        setEditSupplier(null);
      } else {
        await api.createSupplier(form);
        setCreateOpen(false);
      }
      load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Supplier) => {
    if (!confirm(`Deactivate supplier "${s.name}"?`)) return;
    await api.deleteSupplier(s.id);
    load();
  };

  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter(s => s.status === "active").length;

  const filtered = suppliers.filter(s => {
    const mq = !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.supplierCode.toLowerCase().includes(q.toLowerCase()) || (s.city?.toLowerCase().includes(q.toLowerCase()) ?? false);
    const ms = statusFilter === "all" || s.status === statusFilter;
    return mq && ms;
  });

  return (
    <div className="space-y-5">
      {/* Metric cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Suppliers" value={String(totalSuppliers)} icon={Truck} accent="primary" />
        <MetricCard label="Active" value={String(activeSuppliers)} icon={CheckCircle} accent="success" />
        <MetricCard label="Inactive" value={String(totalSuppliers - activeSuppliers)} icon={Clock} accent="warning" />
        <MetricCard label="Supply Types" value={String(new Set(suppliers.map(s => s.supplyType)).size)} icon={Package} accent="default" />
      </div>

      {/* Filters + Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, city…" className="h-9 w-60" />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
          <Plus className="h-4 w-4" /> Add Supplier
        </Button>
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-3 py-3 font-semibold">Code</th>
                  <th className="px-3 py-3 font-semibold">Name</th>
                  <th className="px-3 py-3 font-semibold">Contact</th>
                  <th className="px-3 py-3 font-semibold">Phone</th>
                  <th className="px-3 py-3 font-semibold">Supply Type</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-mono text-xs">{s.supplierCode}</td>
                    <td className="px-3 py-3 font-semibold">{s.name}</td>
                    <td className="px-3 py-3 text-xs">{s.contactPerson ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{s.contactNumber ?? "—"}</td>
                    <td className="px-3 py-3"><Badge variant="outline" className="text-xs capitalize">{s.supplyType ?? "—"}</Badge></td>
                    <td className="px-3 py-3"><StatusBadge status={s.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewSupplier(s)}><Eye className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s)}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No suppliers found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Supplier profile drawer */}
      <SupplierProfileDrawer
        supplier={viewSupplier}
        onClose={() => setViewSupplier(null)}
        onEdit={s => { setViewSupplier(null); openEdit(s); }}
      />

      {/* Edit sheet */}
      <Sheet open={!!editSupplier} onOpenChange={v => !v && setEditSupplier(null)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Edit Supplier</SheetTitle></SheetHeader>
          <SupplierFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} />
        </SheetContent>
      </Sheet>

      {/* Create sheet */}
      <Sheet open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <SheetContent>
          <SheetHeader><SheetTitle>Add Supplier</SheetTitle></SheetHeader>
          <SupplierFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} />
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Suppliers() {
  return (
    <PageShell title="Suppliers" subtitle="Vendor management · warehouses · supply channels">
      <SuppliersTab />
    </PageShell>
  );
}
