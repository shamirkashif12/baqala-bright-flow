import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo, useRef } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { Truck, Eye, Pencil, Plus, Trash2, Package, CheckCircle, Clock, ShoppingCart } from "lucide-react";
import { SARIcon } from "@/lib/currency";
import { toast } from "sonner";
import { api, type Supplier, type SupplierDocument, type PurchaseOrder, type SupplierCreditNote, type StockTransfer } from "@/lib/api";
import { usePermission } from "@/lib/use-permission";
import { fileToDataUrl } from "@/lib/image";

export const Route = createFileRoute("/_app/suppliers")({ component: Suppliers });

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}


type SupplierForm = {
  name: string; contactPerson: string; contactNumber: string; email: string; city: string; supplyType: string; status: string;
  legalName: string; crNumber: string; vatNumber: string; address: string; category: string; paymentTerms: string; creditLimit: string;
  bankName: string; bankAccountHolder: string; bankAccountNumber: string; bankIban: string; notes: string;
};
const emptyForm: SupplierForm = {
  name: "", contactPerson: "", contactNumber: "", email: "", city: "", supplyType: "warehouse", status: "active",
  legalName: "", crNumber: "", vatNumber: "", address: "", category: "", paymentTerms: "", creditLimit: "",
  bankName: "", bankAccountHolder: "", bankAccountNumber: "", bankIban: "", notes: "",
};

const SUPPLIER_CATEGORIES = ["Food & Beverage", "Tobacco", "Packaging", "Cleaning & Hygiene", "General Goods", "Other"];

// Module-scope component — NOT inside SuppliersTab, so it never remounts on parent re-render
function SupplierFormFields({
  form,
  setForm,
  onSave,
  saving,
  mode,
}: {
  form: SupplierForm;
  setForm: React.Dispatch<React.SetStateAction<SupplierForm>>;
  onSave: () => void;
  saving: boolean;
  mode: "create" | "edit";
}) {
  const set = (k: keyof SupplierForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));
  const setS = (k: keyof SupplierForm) => (v: string) =>
    setForm(p => ({ ...p, [k]: v }));
  const req = mode === "create";
  const label = (text: string, required: boolean) => required ? `${text} *` : text;
  return (
    <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
      <FieldRow label={label("Name", true)}><Input value={form.name} onChange={set("name")} className="h-9" placeholder="Al-Barakah Trading" required={req} /></FieldRow>
      <FieldRow label="Legal Name"><Input value={form.legalName} onChange={set("legalName")} className="h-9" placeholder="Registered legal business name (if different)" /></FieldRow>
      <FieldRow label={label("CR Number", true)}><Input value={form.crNumber} onChange={set("crNumber")} className="h-9" placeholder="Commercial Registration number" required={req} /></FieldRow>
      <FieldRow label={label("VAT Number", true)}><Input value={form.vatNumber} onChange={set("vatNumber")} className="h-9" placeholder="15-digit VAT registration number" required={req} /></FieldRow>
      <FieldRow label={label("Contact Person", true)}><Input value={form.contactPerson} onChange={set("contactPerson")} className="h-9" required={req} /></FieldRow>
      <FieldRow label={label("Phone", true)}><Input value={form.contactNumber} onChange={set("contactNumber")} className="h-9" required={req} /></FieldRow>
      <FieldRow label="Email"><Input value={form.email} onChange={set("email")} className="h-9" type="email" /></FieldRow>
      <FieldRow label="City"><Input value={form.city} onChange={set("city")} className="h-9" /></FieldRow>
      <div className="sm:col-span-2">
        <FieldRow label={label("Address", true)}><Textarea value={form.address} onChange={set("address")} rows={2} placeholder="Street, building, city, postal code" required={req} /></FieldRow>
      </div>
      <FieldRow label={label("Supplier Type / Category", true)}>
        <Select value={form.category} onValueChange={setS("category")}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select category" /></SelectTrigger>
          <SelectContent>
            {SUPPLIER_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Supply Channel">
        <Select value={form.supplyType} onValueChange={setS("supplyType")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="warehouse">Warehouse</SelectItem>
            <SelectItem value="both">Both (Direct + Warehouse)</SelectItem>
            <SelectItem value="mart_to_mart">Mart to Mart</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <FieldRow label="Payment Terms"><Input value={form.paymentTerms} onChange={set("paymentTerms")} className="h-9" placeholder="e.g. Net 30, COD, Advance Payment" /></FieldRow>
      <FieldRow label="Credit Limit (SAR)"><Input value={form.creditLimit} onChange={set("creditLimit")} className="h-9" type="number" min="0" step="0.01" /></FieldRow>
      <FieldRow label="Bank Name"><Input value={form.bankName} onChange={set("bankName")} className="h-9" /></FieldRow>
      <FieldRow label="Bank Account Holder"><Input value={form.bankAccountHolder} onChange={set("bankAccountHolder")} className="h-9" /></FieldRow>
      <FieldRow label="Bank Account Number"><Input value={form.bankAccountNumber} onChange={set("bankAccountNumber")} className="h-9" /></FieldRow>
      <FieldRow label="IBAN"><Input value={form.bankIban} onChange={set("bankIban")} className="h-9" placeholder="SAxx xxxx xxxx xxxx xxxx xxxx" /></FieldRow>
      <div className="sm:col-span-2">
        <FieldRow label="Notes"><Textarea value={form.notes} onChange={set("notes")} rows={2} placeholder="Any other useful information about this supplier" /></FieldRow>
      </div>
      <FieldRow label="Status">
        <Select value={form.status} onValueChange={setS("status")}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>
      <div className="sm:col-span-2">
        <Button className="w-full gradient-primary text-primary-foreground border-0" onClick={onSave} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

const SUPPLIER_DOC_TYPES = ["CR Certificate", "VAT Certificate", "Contract", "Bank Letter", "Other"];

function supplierDocStatus(doc: SupplierDocument): { label: string; tone: string } {
  if (!doc.expiryDate) return { label: "Complete", tone: "bg-success/15 text-success" };
  const days = Math.ceil((new Date(doc.expiryDate).getTime() - Date.now()) / 86400000);
  if (days < 0) return { label: "Expired", tone: "bg-destructive/15 text-destructive" };
  if (days <= 30) return { label: "Expiring Soon", tone: "bg-warning/20 text-warning-foreground" };
  return { label: "Complete", tone: "bg-success/15 text-success" };
}

function SupplierDocumentsSection({ supplier }: { supplier: Supplier }) {
  const { canEdit, canDelete } = usePermission("Suppliers");
  const [documents, setDocuments] = useState<SupplierDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState(SUPPLIER_DOC_TYPES[0]);
  const [expiryDate, setExpiryDate] = useState("");
  const [file, setFile] = useState<{ name: string; url: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reload = () => { api.getSupplierDocuments(supplier.id).then(setDocuments).catch(() => {}); };
  useEffect(reload, [supplier.id]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const url = await fileToDataUrl(f);
      setFile({ name: f.name, url });
    } catch {
      toast.error("Failed to read file.");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setSaving(true);
    try {
      await api.uploadSupplierDocument(supplier.id, { documentType, fileName: file.name, fileUrl: file.url, expiryDate: expiryDate || undefined });
      setUploading(false);
      setFile(null);
      setExpiryDate("");
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to upload document.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (docId: string) => {
    if (!confirm("Delete this document?")) return;
    try {
      await api.deleteSupplierDocument(supplier.id, docId);
      reload();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete document.");
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Legal Documents</p>
        {canEdit && !uploading && (
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setUploading(true)}>Upload Document</Button>
        )}
      </div>
      {uploading && (
        <div className="rounded-xl border border-border/60 p-3 space-y-2 mb-3">
          <Select value={documentType} onValueChange={setDocumentType}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{SUPPLIER_DOC_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} placeholder="Expiry date (optional)" className="h-9" />
          <Button size="sm" variant="outline" className="w-full" onClick={() => fileInputRef.current?.click()}>{file ? file.name : "Choose File (PDF/JPG/PNG)"}</Button>
          <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFile} />
          <div className="flex gap-2">
            <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0" disabled={!file || saving} onClick={handleUpload}>
              {saving ? "Uploading…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setUploading(false); setFile(null); }}>Cancel</Button>
          </div>
        </div>
      )}
      {documents.length === 0 ? (
        <p className="text-xs text-muted-foreground">No documents uploaded yet.</p>
      ) : (
        <div className="space-y-1.5">
          {documents.map(d => {
            const st = supplierDocStatus(d);
            return (
              <div key={d.id} className="flex items-center justify-between text-xs border-b border-border/40 pb-1.5">
                <div>
                  <span className="font-medium">{d.documentType}</span>
                  <span className="text-muted-foreground"> · {d.fileName}{d.expiryDate && ` · exp. ${d.expiryDate}`}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Badge variant="outline" className={`text-[10px] border-0 ${st.tone}`}>{st.label}</Badge>
                  {canDelete && <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDelete(d.id)}><Trash2 className="h-3 w-3" /></Button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
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
  const { canEdit } = usePermission("Suppliers");
  const [pos, setPos] = useState<PurchaseOrder[]>([]);
  const [inboundTransfers, setInboundTransfers] = useState<StockTransfer[]>([]);
  const [creditNotes, setCreditNotes] = useState<SupplierCreditNote[]>([]);
  const [loadingPos, setLoadingPos] = useState(false);

  useEffect(() => {
    if (!supplier) return;
    setLoadingPos(true);
    Promise.allSettled([
      api.getPurchaseOrders({ supplierId: supplier.id }),
      api.getCreditNotes({ supplierId: supplier.id }),
      api.getStockTransfers({ transferType: "supplier_to_warehouse", sourceSupplierId: supplier.id }),
    ]).then(([posResult, cnsResult, trfResult]) => {
      if (posResult.status === "fulfilled") setPos(posResult.value);
      if (cnsResult.status === "fulfilled") setCreditNotes(cnsResult.value);
      if (trfResult.status === "fulfilled") setInboundTransfers(trfResult.value);
    }).finally(() => setLoadingPos(false));
  }, [supplier?.id]);

  // Group batch inbound transfers for display (same batchId = one row)
  const inboundGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: Array<{ key: string; items: StockTransfer[]; isBatch: boolean }> = [];
    for (const t of inboundTransfers) {
      if (t.batchId) {
        if (!seen.has(t.batchId)) {
          seen.add(t.batchId);
          groups.push({ key: t.batchId, items: inboundTransfers.filter(x => x.batchId === t.batchId), isBatch: true });
        }
      } else {
        groups.push({ key: t.id, items: [t], isBatch: false });
      }
    }
    return groups;
  }, [inboundTransfers]);

  const poTotalOwed = pos.reduce((s, p) => s + (p.totalAmount - p.paidAmount), 0);
  // Inbound transfers that are received/completed create a payable (no payment tracking yet)
  const inboundTotalOwed = inboundTransfers
    .filter(t => t.status === "completed" || t.status === "partial_received" || t.status === "fully_received")
    .reduce((s, t) => s + (t.items ?? []).reduce((si, i) => si + i.requestedQuantity * (i.unitCost ?? 0), 0), 0);
  const totalOwed = poTotalOwed + inboundTotalOwed;
  const rtsValue = creditNotes.filter(cn => cn.status !== "cancelled").reduce((s, cn) => s + cn.amount, 0);
  const netBalance = totalOwed - rtsValue;
  const pendingPos = pos.filter(p => p.status === "draft" || p.status === "approved" || p.status === "ordered").length;

  // Group batch POs into single display entries so amounts don't appear split
  const poGroups = useMemo(() => {
    const seen = new Set<string>();
    const groups: Array<{ key: string; items: PurchaseOrder[]; isBatch: boolean }> = [];
    for (const po of pos) {
      if (po.batchId) {
        if (!seen.has(po.batchId)) {
          seen.add(po.batchId);
          groups.push({ key: po.batchId, items: pos.filter(p => p.batchId === po.batchId), isBatch: true });
        }
      } else {
        groups.push({ key: po.id, items: [po], isBatch: false });
      }
    }
    return groups;
  }, [pos]);

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
                  {canEdit && (
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => onEdit(supplier)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </SheetHeader>

            <div className="grid grid-cols-3 gap-2 mt-4 mb-4">
              {[
                { label: "Total POs", value: String(pos.length), icon: ShoppingCart },
                { label: "Pending", value: String(pendingPos), icon: Clock },
                { label: "Net Balance", value: `SAR ${Math.abs(netBalance).toLocaleString()}`, sub: netBalance > 0 ? "Owed" : "Credit", icon: Package },
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
              <TabsList className="grid grid-cols-4 h-8">
                <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
                <TabsTrigger value="purchase-orders" className="text-xs">Orders</TabsTrigger>
                <TabsTrigger value="ledger" className="text-xs">Ledger</TabsTrigger>
                <TabsTrigger value="documents" className="text-xs">Documents</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-4 space-y-3">
                {([
                  ["Legal Name", supplier.legalName ?? "—"],
                  ["CR Number", supplier.crNumber ?? "—"],
                  ["VAT Number", supplier.vatNumber ?? "—"],
                  ["Contact Person", supplier.contactPerson ?? "—"],
                  ["Phone", supplier.contactNumber ?? "—"],
                  ["Email", supplier.email ?? "—"],
                  ["Address", supplier.address ?? "—"],
                  ["City", supplier.city ?? "—"],
                  ["Category", supplier.category ?? "—"],
                  ["Supply Channel", supplier.supplyType ?? "—"],
                  ["Payment Terms", supplier.paymentTerms ?? "—"],
                  ["Credit Limit", supplier.creditLimit != null ? `SAR ${supplier.creditLimit.toLocaleString()}` : "—"],
                  ["Bank Name", supplier.bankName ?? "—"],
                  ["Bank Account Holder", supplier.bankAccountHolder ?? "—"],
                  ["Bank Account Number", supplier.bankAccountNumber ?? "—"],
                  ["IBAN", supplier.bankIban ?? "—"],
                  ["Notes", supplier.notes ?? "—"],
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
                ) : poGroups.length === 0 && inboundGroups.length === 0 ? (
                  <div className="text-center py-8 text-sm text-muted-foreground">No purchase orders for this supplier.</div>
                ) : (
                  <div className="space-y-2">
                    {inboundGroups.map(({ key, items, isBatch }) => {
                      const t = items[0];
                      const groupTotal = items.reduce((s, x) => s + (x.items ?? []).reduce((si, i) => si + i.requestedQuantity * (i.unitCost ?? 0), 0), 0);
                      const destinations = isBatch
                        ? items.map(x => x.destWarehouse?.name).filter(Boolean).join(", ")
                        : (t.destWarehouse?.name ? `WH: ${t.destWarehouse.name}` : "");
                      return (
                        <div key={key} className="rounded-xl border border-border/40 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-bold">
                                {t.transferNumber}
                                {isBatch && <span className="ml-1.5 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">×{items.length}</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(t.createdAt).toLocaleDateString("en-SA")}
                                {destinations && ` · ${destinations}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium bg-primary/10 text-primary`}>
                                {t.status.replace(/_/g, " ")}
                              </span>
                              {groupTotal > 0 && <span className="text-sm font-semibold flex items-center gap-0.5 text-primary"><SARIcon />{groupTotal.toLocaleString()}</span>}
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{t.items?.length ?? 0} item{(t.items?.length ?? 0) !== 1 ? "s" : ""}</span>
                            <span className="text-primary">Delivery (STF)</span>
                          </div>
                        </div>
                      );
                    })}
                    {poGroups.map(({ key, items, isBatch }) => {
                      const po = items[0];
                      const groupTotal = items.reduce((s, p) => s + p.totalAmount, 0);
                      const groupPaid = items.reduce((s, p) => s + p.paidAmount, 0);
                      const destinations = isBatch
                        ? items.map(p => p.warehouse?.name ?? p.branch?.name).filter(Boolean).join(", ")
                        : (po.warehouse?.name ? `WH: ${po.warehouse.name}` : po.branch?.name ? `Branch: ${po.branch.name}` : "");
                      return (
                        <div key={key} className="rounded-xl border border-border/40 px-3 py-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-mono text-xs font-bold">
                                {po.poNumber}
                                {isBatch && <span className="ml-1.5 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-semibold">×{items.length}</span>}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {new Date(po.createdAt).toLocaleDateString("en-SA")}
                                {destinations && ` · ${destinations}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${PO_STATUS_CLASS[po.status] ?? "bg-muted text-muted-foreground"}`}>
                                {po.status.replace(/_/g, " ")}
                              </span>
                              <span className={`text-sm font-semibold flex items-center gap-0.5 ${isBatch ? "text-primary" : ""}`}>
                                <SARIcon />{groupTotal.toLocaleString()}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1.5 flex items-center gap-3 text-xs text-muted-foreground">
                            <span>{po.items?.length ?? 0} item{(po.items?.length ?? 0) !== 1 ? "s" : ""}</span>
                            <span className={groupPaid >= groupTotal ? "text-success" : groupPaid > 0 ? "text-warning-foreground" : "text-destructive"}>
                              {groupPaid >= groupTotal ? "Paid" : groupPaid > 0 ? `Partial (SAR ${groupPaid.toLocaleString()} paid)` : "Unpaid"}
                            </span>
                          </div>
                        </div>
                      );
                    })}
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
                        { label: "Total Invoiced", val: totalOwed + pos.reduce((s, p) => s + p.paidAmount, 0), cls: "" },
                        { label: "Paid", val: pos.reduce((s, p) => s + p.paidAmount, 0), cls: "text-success" },
                        { label: "RTS Credits", val: rtsValue, cls: "text-primary" },
                      ].map(({ label, val, cls }) => (
                        <div key={label} className="rounded-xl border border-border/60 bg-muted/20 p-2.5 text-center">
                          <p className={`text-sm font-bold ${cls}`}>SAR {val.toLocaleString()}</p>
                          <p className="text-[10px] text-muted-foreground">{label}</p>
                        </div>
                      ))}
                    </div>
                    <div className={`rounded-xl border px-3 py-2 text-sm font-semibold flex justify-between ${netBalance > 0 ? "border-destructive/40 bg-destructive/5 text-destructive" : "border-success/40 bg-success/5 text-success"}`}>
                      <span>{netBalance > 0 ? "Net Amount Owed to Supplier" : "Net Credit from Supplier"}</span>
                      <span>SAR {Math.abs(netBalance).toLocaleString()}</span>
                    </div>
                    {/* Goods Received — creates a payable (PO-based) */}
                    {(poGroups.filter(g => g.items.some(p => p.status === "partial_received" || p.status === "fully_received")).length > 0 ||
                      inboundGroups.filter(g => g.items.some(t => t.status === "completed" || t.status === "partial_received" || t.status === "fully_received")).length > 0) && (
                      <div className="mt-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Payables to Supplier</p>
                        {/* PO-based payables */}
                        {poGroups
                          .filter(g => g.items.some(p => p.status === "partial_received" || p.status === "fully_received"))
                          .map(({ key, items, isBatch }) => {
                            const po = items[0];
                            const groupTotal = items.reduce((s, p) => s + p.totalAmount, 0);
                            const groupPaid = items.reduce((s, p) => s + p.paidAmount, 0);
                            return (
                              <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/30 text-xs">
                                <div>
                                  <p className="font-medium font-mono">
                                    {po.poNumber}
                                    {isBatch && <span className="ml-1 text-[10px] bg-primary/15 text-primary px-1 py-0.5 rounded-full">×{items.length}</span>}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {po.receivedDate ? new Date(po.receivedDate).toLocaleDateString("en-SA") : new Date(po.updatedAt).toLocaleDateString("en-SA")}
                                    {" · "}
                                    <span className={groupPaid >= groupTotal ? "text-success" : groupPaid > 0 ? "text-warning-foreground" : "text-destructive"}>
                                      {groupPaid >= groupTotal ? "Paid" : groupPaid > 0 ? `Partial — SAR ${groupPaid.toLocaleString()} paid` : "Unpaid"}
                                    </span>
                                  </p>
                                </div>
                                <span className="font-semibold text-destructive flex items-center gap-0.5"><SARIcon />{groupTotal.toLocaleString()}</span>
                              </div>
                            );
                          })}
                        {/* Stock-transfer-based payables (supplier_to_warehouse) */}
                        {inboundGroups
                          .filter(g => g.items.some(t => t.status === "completed" || t.status === "partial_received" || t.status === "fully_received"))
                          .map(({ key, items, isBatch }) => {
                            const t = items[0];
                            const groupTotal = items.reduce((s, x) => s + (x.items ?? []).reduce((si, i) => si + i.requestedQuantity * (i.unitCost ?? 0), 0), 0);
                            const destinations = isBatch
                              ? items.map(x => x.destWarehouse?.name).filter(Boolean).join(", ")
                              : (t.destWarehouse?.name ?? "");
                            return (
                              <div key={key} className="flex items-center justify-between py-1.5 border-b border-border/30 text-xs">
                                <div>
                                  <p className="font-medium font-mono">
                                    {t.transferNumber}
                                    {isBatch && <span className="ml-1 text-[10px] bg-primary/15 text-primary px-1 py-0.5 rounded-full">×{items.length}</span>}
                                  </p>
                                  <p className="text-muted-foreground">
                                    {new Date(t.updatedAt).toLocaleDateString("en-SA")}
                                    {destinations && ` · ${destinations}`}
                                    {" · "}
                                    <span className="text-warning-foreground">Delivery (STF)</span>
                                  </p>
                                </div>
                                <span className="font-semibold text-destructive flex items-center gap-0.5"><SARIcon />{groupTotal.toLocaleString()}</span>
                              </div>
                            );
                          })}
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
                            <span className="font-semibold text-primary flex items-center gap-0.5"><SARIcon />{cn.amount.toLocaleString()}</span>
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

              <TabsContent value="documents" className="mt-4">
                <SupplierDocumentsSection supplier={supplier} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function SuppliersTab() {
  const { canCreate, canEdit, canDelete } = usePermission("Suppliers");
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [viewSupplier, setViewSupplier] = useState<Supplier | null>(null);
  const [editSupplier, setEditSupplier] = useState<Supplier | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<SupplierForm>(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    api.getSuppliers()
      .then(s => { setSuppliers(s); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const openEdit = (s: Supplier) => {
    setEditSupplier(s);
    setForm({
      name: s.name, contactPerson: s.contactPerson ?? "", contactNumber: s.contactNumber ?? "", email: s.email ?? "", city: s.city ?? "",
      supplyType: s.supplyType ?? "warehouse", status: s.status,
      legalName: s.legalName ?? "", crNumber: s.crNumber ?? "", vatNumber: s.vatNumber ?? "", address: s.address ?? "", category: s.category ?? "",
      paymentTerms: s.paymentTerms ?? "", creditLimit: s.creditLimit != null ? String(s.creditLimit) : "",
      bankName: s.bankName ?? "", bankAccountHolder: s.bankAccountHolder ?? "", bankAccountNumber: s.bankAccountNumber ?? "", bankIban: s.bankIban ?? "",
      notes: s.notes ?? "",
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...form, creditLimit: form.creditLimit === "" ? undefined : Number(form.creditLimit) };
      if (editSupplier) {
        await api.updateSupplier(editSupplier.id, payload);
        setEditSupplier(null);
      } else {
        await api.createSupplier(payload);
        setCreateOpen(false);
      }
      load();
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Failed to save supplier.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (s: Supplier) => {
    if (!confirm(`Deactivate supplier "${s.name}"?`)) return;
    try {
      await api.deleteSupplier(s.id);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete supplier.");
    }
  };

  const totalSuppliers = suppliers.length;
  const activeSuppliers = suppliers.filter(s => s.status === "active").length;

  const filtered = suppliers.filter(s => {
    const mq = !q || s.name.toLowerCase().includes(q.toLowerCase()) || s.supplierCode.toLowerCase().includes(q.toLowerCase()) || (s.city?.toLowerCase().includes(q.toLowerCase()) ?? false);
    const ms = !(statusFilter.length && !statusFilter.includes(s.status));
    return mq && ms;
  });

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}
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
        <div className="w-36">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={[
              { id: "active", label: "Active" },
              { id: "inactive", label: "Inactive" },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="flex-1" />
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => { setForm(emptyForm); setCreateOpen(true); }}>
            <Plus className="h-4 w-4" /> Add Supplier
          </Button>
        )}
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
                        {canEdit && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(s)}><Pencil className="h-3.5 w-3.5" /></Button>}
                        {canDelete && <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => handleDelete(s)}><Trash2 className="h-3.5 w-3.5" /></Button>}
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

      {/* Edit dialog — centered instead of a side sheet since the form has too many fields to feel cramped in a narrow panel */}
      <Dialog open={!!editSupplier} onOpenChange={v => !v && setEditSupplier(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Supplier</DialogTitle></DialogHeader>
          <SupplierFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} mode="edit" />
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={v => !v && setCreateOpen(false)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Add Supplier</DialogTitle></DialogHeader>
          <SupplierFormFields form={form} setForm={setForm} onSave={handleSave} saving={saving} mode="create" />
        </DialogContent>
      </Dialog>
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
