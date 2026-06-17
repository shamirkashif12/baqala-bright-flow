import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import React from "react";
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
import {
  Eye,
  Pencil,
  CheckCircle,
  XCircle,
  Truck,
  Info,
  Package,
  Plus,
  Warehouse as WarehouseIcon,
  Building2,
  Link2,
  BoxesIcon,
} from "lucide-react";
import {
  api,
  type Warehouse,
  type WarehouseStock,
  type WarehouseRequest,
  type Branch,
  type Supplier,
} from "@/lib/api";

export const Route = createFileRoute("/_app/warehouses")({ component: Warehouses });

// ─── Shared helpers ───────────────────────────────────────────────────────────

function F({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

// ─── Warehouse status badge ───────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "bg-success/15 text-success"
      : "bg-muted text-muted-foreground";
  return (
    <Badge className={`${cls} border-0 text-xs capitalize`}>{status}</Badge>
  );
}

// ─── Requests helpers ─────────────────────────────────────────────────────────

function ApprovalBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    approved: "bg-success/15 text-success",
    request_generated: "bg-warning/20 text-warning-foreground",
    unapproved: "bg-destructive/15 text-destructive",
  };
  return (
    <Badge className={`${map[status] ?? "bg-muted"} border-0 text-xs capitalize`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

function DeliveryBadge({ status }: { status?: string | null }) {
  if (!status) return <span className="text-xs text-muted-foreground">—</span>;
  const map: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    in_transit: "bg-primary/15 text-primary",
    delivered: "bg-success/15 text-success",
    failed: "bg-destructive/15 text-destructive",
  };
  return (
    <Badge className={`${map[status] ?? "bg-muted"} border-0 text-xs`}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

// ─── Warehouse form type ──────────────────────────────────────────────────────

type WForm = {
  code: string;
  name: string;
  nameAr: string;
  city: string;
  address: string;
  capacity: string;
  contactPerson: string;
  contactNumber: string;
  status: string;
};

const emptyWForm: WForm = {
  code: "",
  name: "",
  nameAr: "",
  city: "",
  address: "",
  capacity: "",
  contactPerson: "",
  contactNumber: "",
  status: "active",
};

// ─── Warehouse form sheet (defined OUTSIDE parent to keep stable identity) ────

function WarehouseFormSheet({
  open,
  onClose,
  onSubmit,
  title,
  wForm,
  setWForm,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  title: string;
  wForm: WForm;
  setWForm: React.Dispatch<React.SetStateAction<WForm>>;
  saving: boolean;
}) {
  const setWF = (k: keyof WForm) => (v: string) =>
    setWForm((p) => ({ ...p, [k]: v }));

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent style={{ width: 420 }} className="overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
        </SheetHeader>
        <div className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Code *</Label>
              <Input
                value={wForm.code}
                onChange={(e) => setWF("code")(e.target.value)}
                className="h-9"
                placeholder="WH-001"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={wForm.status} onValueChange={setWF("status")}>
                <SelectTrigger className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input
              value={wForm.name}
              onChange={(e) => setWF("name")(e.target.value)}
              className="h-9"
              placeholder="Main Warehouse"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Name (Arabic)</Label>
            <Input
              value={wForm.nameAr}
              onChange={(e) => setWF("nameAr")(e.target.value)}
              className="h-9 text-right"
              placeholder="المستودع الرئيسي"
              dir="rtl"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">City</Label>
              <Input
                value={wForm.city}
                onChange={(e) => setWF("city")(e.target.value)}
                className="h-9"
                placeholder="Riyadh"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Capacity (units)</Label>
              <Input
                type="number"
                value={wForm.capacity}
                onChange={(e) => setWF("capacity")(e.target.value)}
                className="h-9"
                placeholder="5000"
                min={0}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Address</Label>
            <Input
              value={wForm.address}
              onChange={(e) => setWF("address")(e.target.value)}
              className="h-9"
              placeholder="Street, District"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Contact Person</Label>
              <Input
                value={wForm.contactPerson}
                onChange={(e) => setWF("contactPerson")(e.target.value)}
                className="h-9"
                placeholder="Ahmed Ali"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Contact Number</Label>
              <Input
                value={wForm.contactNumber}
                onChange={(e) => setWF("contactNumber")(e.target.value)}
                className="h-9"
                placeholder="+966 5x xxx xxxx"
              />
            </div>
          </div>
          <Button
            className="w-full gradient-primary text-primary-foreground border-0 shadow-glow"
            onClick={onSubmit}
            disabled={saving || !wForm.code || !wForm.name}
          >
            {saving ? "Saving…" : title}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

type CreateReqForm = {
  destinationBranchId: string;
  sourceBranchId: string;
  supplierId: string;
  notes: string;
};
const emptyReqForm: CreateReqForm = {
  destinationBranchId: "",
  sourceBranchId: "",
  supplierId: "",
  notes: "",
};

// ─── Main component ───────────────────────────────────────────────────────────

function Warehouses() {
  // Shared data
  const [branches, setBranches] = useState<Branch[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  // Warehouses tab
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [whLoading, setWhLoading] = useState(true);
  const [whSearch, setWhSearch] = useState("");
  const [newWhOpen, setNewWhOpen] = useState(false);
  const [editWhOpen, setEditWhOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Warehouse | null>(null);
  const [wForm, setWForm] = useState<WForm>(emptyWForm);
  const [whSaving, setWhSaving] = useState(false);

  // View sheet
  const [viewWh, setViewWh] = useState<Warehouse | null>(null);
  const [viewStock, setViewStock] = useState<WarehouseStock[]>([]);
  const [viewStockLoading, setViewStockLoading] = useState(false);

  // Link branch state
  const [linkBranchId, setLinkBranchId] = useState("");
  const [linkBranchPrimary, setLinkBranchPrimary] = useState(false);
  const [linkBranchSaving, setLinkBranchSaving] = useState(false);

  // Link supplier state
  const [linkSupplierId, setLinkSupplierId] = useState("");
  const [linkSupplierPrimary, setLinkSupplierPrimary] = useState(false);
  const [linkSupplierNotes, setLinkSupplierNotes] = useState("");
  const [linkSupplierSaving, setLinkSupplierSaving] = useState(false);

  // Requests tab
  const [requests, setRequests] = useState<WarehouseRequest[]>([]);
  const [reqLoading, setReqLoading] = useState(true);
  const [reqSearch, setReqSearch] = useState("");
  const [viewReq, setViewReq] = useState<WarehouseRequest | null>(null);
  const [createReqOpen, setCreateReqOpen] = useState(false);
  const [reqForm, setReqForm] = useState<CreateReqForm>(emptyReqForm);
  const [reqSaving, setReqSaving] = useState(false);

  // ── Load all data ──
  const loadWarehouses = () => {
    setWhLoading(true);
    api
      .getWarehouses()
      .then(setWarehouses)
      .finally(() => setWhLoading(false));
  };

  const loadRequests = () => {
    setReqLoading(true);
    api
      .getWarehouseRequests()
      .then(setRequests)
      .finally(() => setReqLoading(false));
  };

  useEffect(() => {
    loadWarehouses();
    loadRequests();
    api.getBranches().then(setBranches);
    api.getSuppliers().then(setSuppliers);
  }, []);

  // ── Warehouse metric helpers ──
  const totalStock = warehouses.reduce((acc, w) => acc + (w.stock?.length ?? 0), 0);
  const activeCount = warehouses.filter((w) => w.status === "active").length;
  const linkedSuppliers = new Set(
    warehouses.flatMap((w) => (w.warehouseSuppliers ?? []).map((ws) => ws.supplierId))
  ).size;

  // ── Filtered tables ──
  const filteredWh = warehouses.filter(
    (w) =>
      !whSearch ||
      w.code.toLowerCase().includes(whSearch.toLowerCase()) ||
      w.name.toLowerCase().includes(whSearch.toLowerCase()) ||
      (w.city ?? "").toLowerCase().includes(whSearch.toLowerCase())
  );

  const filteredReqs = requests.filter(
    (r) =>
      !reqSearch ||
      r.requestNumber?.toLowerCase().includes(reqSearch.toLowerCase()) ||
      r.sourceBranch?.name?.toLowerCase().includes(reqSearch.toLowerCase()) ||
      r.destinationBranch?.name?.toLowerCase().includes(reqSearch.toLowerCase()) ||
      r.supplier?.name?.toLowerCase().includes(reqSearch.toLowerCase())
  );

  // ── Warehouse CRUD ──
  const handleCreateWarehouse = async () => {
    setWhSaving(true);
    try {
      await api.createWarehouse({
        code: wForm.code,
        name: wForm.name,
        nameAr: wForm.nameAr || undefined,
        city: wForm.city || undefined,
        address: wForm.address || undefined,
        capacity: wForm.capacity ? Number(wForm.capacity) : undefined,
        contactPerson: wForm.contactPerson || undefined,
        contactNumber: wForm.contactNumber || undefined,
        status: wForm.status,
      });
      setNewWhOpen(false);
      setWForm(emptyWForm);
      loadWarehouses();
    } catch (e) {
      console.error(e);
    } finally {
      setWhSaving(false);
    }
  };

  const handleUpdateWarehouse = async () => {
    if (!editTarget) return;
    setWhSaving(true);
    try {
      await api.updateWarehouse(editTarget.id, {
        code: wForm.code,
        name: wForm.name,
        nameAr: wForm.nameAr || undefined,
        city: wForm.city || undefined,
        address: wForm.address || undefined,
        capacity: wForm.capacity ? Number(wForm.capacity) : undefined,
        contactPerson: wForm.contactPerson || undefined,
        contactNumber: wForm.contactNumber || undefined,
        status: wForm.status,
      });
      setEditWhOpen(false);
      setEditTarget(null);
      setWForm(emptyWForm);
      loadWarehouses();
    } catch (e) {
      console.error(e);
    } finally {
      setWhSaving(false);
    }
  };

  const openEdit = (w: Warehouse) => {
    setEditTarget(w);
    setWForm({
      code: w.code,
      name: w.name,
      nameAr: w.nameAr ?? "",
      city: w.city ?? "",
      address: w.address ?? "",
      capacity: w.capacity != null ? String(w.capacity) : "",
      contactPerson: w.contactPerson ?? "",
      contactNumber: w.contactNumber ?? "",
      status: w.status,
    });
    setEditWhOpen(true);
  };

  // ── View sheet ──
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState<string | null>(null);

  const showFeedback = (msg: string, isError = false) => {
    if (isError) { setLinkError(msg); setTimeout(() => setLinkError(null), 4000); }
    else { setLinkSuccess(msg); setTimeout(() => setLinkSuccess(null), 3000); }
  };

  const openView = (w: Warehouse) => {
    setLinkBranchId(""); setLinkBranchPrimary(false);
    setLinkSupplierId(""); setLinkSupplierPrimary(false); setLinkSupplierNotes("");
    setLinkError(null); setLinkSuccess(null);
    // Open sheet immediately with list data, then swap in fresh linked data
    setViewWh(w);
    setViewStock(w.stock ?? []);
    setViewStockLoading(true);
    api.getWarehouse(w.id)
      .then((fresh) => { setViewWh(fresh); setViewStock(fresh.stock ?? []); })
      .catch(() => { /* keep list data on error */ })
      .finally(() => setViewStockLoading(false));
  };

  const refreshViewWh = async (id: string) => {
    // Fetch single warehouse (faster + always includes linked data)
    const updated = await api.getWarehouse(id);
    setViewWh(updated);
    setViewStock(updated.stock ?? []);
    // Also update the list row in-place
    setWarehouses((prev) => prev.map((w) => w.id === id ? updated : w));
  };

  const handleLinkBranch = async () => {
    if (!viewWh || !linkBranchId) return;
    setLinkBranchSaving(true);
    try {
      await api.addWarehouseBranch(viewWh.id, {
        branchId: linkBranchId,
        isPrimary: linkBranchPrimary,
      });
      setLinkBranchId(""); setLinkBranchPrimary(false);
      await refreshViewWh(viewWh.id);
      showFeedback("Branch linked successfully");
    } catch (e: unknown) {
      showFeedback((e as Error).message ?? "Failed to link branch", true);
    } finally {
      setLinkBranchSaving(false);
    }
  };

  const handleUnlinkBranch = async (branchId: string) => {
    if (!viewWh) return;
    try {
      await api.removeWarehouseBranch(viewWh.id, branchId);
      await refreshViewWh(viewWh.id);
      showFeedback("Branch removed");
    } catch (e: unknown) {
      showFeedback((e as Error).message ?? "Failed to remove branch", true);
    }
  };

  const handleLinkSupplier = async () => {
    if (!viewWh || !linkSupplierId) return;
    setLinkSupplierSaving(true);
    try {
      await api.addWarehouseSupplier(viewWh.id, {
        supplierId: linkSupplierId,
        isPrimary: linkSupplierPrimary,
        notes: linkSupplierNotes || undefined,
      });
      setLinkSupplierId(""); setLinkSupplierPrimary(false); setLinkSupplierNotes("");
      await refreshViewWh(viewWh.id);
      showFeedback("Supplier linked successfully");
    } catch (e: unknown) {
      showFeedback((e as Error).message ?? "Failed to link supplier", true);
    } finally {
      setLinkSupplierSaving(false);
    }
  };

  const handleUnlinkSupplier = async (supplierId: string) => {
    if (!viewWh) return;
    try {
      await api.removeWarehouseSupplier(viewWh.id, supplierId);
      await refreshViewWh(viewWh.id);
      showFeedback("Supplier removed");
    } catch (e: unknown) {
      showFeedback((e as Error).message ?? "Failed to remove supplier", true);
    }
  };

  // ── Requests ──
  const setRF = (k: keyof CreateReqForm) => (v: string) =>
    setReqForm((p) => ({ ...p, [k]: v }));

  const handleApprove = async (r: WarehouseRequest, approved: boolean) => {
    setReqSaving(true);
    try {
      await api.approveWarehouseRequest(
        r.id,
        approved,
        "00000000-0000-0000-0000-000000000000"
      );
      loadRequests();
    } catch (e) {
      console.error(e);
    } finally {
      setReqSaving(false);
    }
  };

  const handleCreateRequest = async () => {
    setReqSaving(true);
    try {
      await api.createWarehouseRequest({
        destinationBranchId: reqForm.destinationBranchId,
        sourceBranchId: reqForm.sourceBranchId || undefined,
        supplierId: reqForm.supplierId || undefined,
        notes: reqForm.notes || undefined,
        items: [],
      } as Partial<WarehouseRequest>);
      setCreateReqOpen(false);
      setReqForm(emptyReqForm);
      loadRequests();
    } catch (e) {
      console.error(e);
    } finally {
      setReqSaving(false);
    }
  };

  // ── Linked branch/supplier sets for view sheet dropdowns ──
  const linkedBranchIds = new Set(
    (viewWh?.branchWarehouses ?? []).map((bw) => bw.branchId)
  );
  const linkedSupplierIds = new Set(
    (viewWh?.warehouseSuppliers ?? []).map((ws) => ws.supplierId)
  );
  const availableBranches = branches.filter((b) => !linkedBranchIds.has(b.id));
  const availableSuppliers = suppliers.filter((s) => !linkedSupplierIds.has(s.id));

  return (
    <PageShell
      title="Warehouses"
      subtitle="Manage physical warehouses and inter-branch transfer requests"
    >
      <Tabs defaultValue="warehouses" className="space-y-5">
        <TabsList>
          <TabsTrigger value="warehouses" className="gap-1.5">
            <WarehouseIcon className="h-3.5 w-3.5" />
            Warehouses
          </TabsTrigger>
          <TabsTrigger value="requests" className="gap-1.5">
            <Truck className="h-3.5 w-3.5" />
            Requests
          </TabsTrigger>
        </TabsList>

        {/* ══════════════════════════════════════════════════════════════════
            WAREHOUSES TAB
        ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="warehouses" className="space-y-5">
          {/* Metric cards */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <MetricCard
              label="Total Warehouses"
              value={String(warehouses.length)}
              icon={WarehouseIcon}
              accent="primary"
            />
            <MetricCard
              label="Active"
              value={String(activeCount)}
              icon={Building2}
              accent="success"
            />
            <MetricCard
              label="Total Stock Items"
              value={String(totalStock)}
              icon={BoxesIcon}
              accent="default"
            />
            <MetricCard
              label="Suppliers Linked"
              value={String(linkedSuppliers)}
              icon={Link2}
              accent="default"
            />
          </div>

          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={whSearch}
              onChange={(e) => setWhSearch(e.target.value)}
              placeholder="Search code, name, city…"
              className="h-9 w-64 flex-shrink-0"
            />
            <div className="flex-1" />
            <Button
              size="sm"
              className="gradient-primary text-primary-foreground border-0 shadow-glow h-9 gap-1.5"
              onClick={() => {
                setWForm(emptyWForm);
                setNewWhOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Warehouse
            </Button>
          </div>

          {/* Table */}
          {whLoading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 font-semibold">Code</th>
                      <th className="px-3 py-3 font-semibold">Name</th>
                      <th className="px-3 py-3 font-semibold">City</th>
                      <th className="px-3 py-3 font-semibold">Linked Branches</th>
                      <th className="px-3 py-3 font-semibold">Linked Suppliers</th>
                      <th className="px-3 py-3 font-semibold">Stock Items</th>
                      <th className="px-3 py-3 font-semibold">Status</th>
                      <th className="px-3 py-3 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredWh.map((w) => (
                      <tr
                        key={w.id}
                        className="border-b border-border/40 hover:bg-muted/30 last:border-0"
                      >
                        <td className="px-3 py-3 font-mono text-xs font-bold">
                          {w.code}
                        </td>
                        <td className="px-3 py-3 font-medium text-xs">{w.name}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">
                          {w.city ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {(w.branchWarehouses ?? []).length}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {(w.warehouseSuppliers ?? []).length}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {(w.stock ?? []).length}
                        </td>
                        <td className="px-3 py-3">
                          <StatusBadge status={w.status} />
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openView(w)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => openEdit(w)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredWh.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center py-10 text-muted-foreground text-sm"
                        >
                          No warehouses found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* ══════════════════════════════════════════════════════════════════
            REQUESTS TAB
        ══════════════════════════════════════════════════════════════════ */}
        <TabsContent value="requests" className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={reqSearch}
              onChange={(e) => setReqSearch(e.target.value)}
              placeholder="Search request#, branch, supplier…"
              className="h-9 w-64 flex-shrink-0"
            />
            <div className="flex-1" />
            <Button
              size="sm"
              className="gradient-primary text-primary-foreground border-0 shadow-glow h-9 gap-1.5"
              onClick={() => {
                setReqForm(emptyReqForm);
                setCreateReqOpen(true);
              }}
            >
              <Plus className="h-4 w-4" />
              New Request
            </Button>
          </div>

          {reqLoading ? (
            <div className="text-muted-foreground text-sm">Loading…</div>
          ) : (
            <Card className="overflow-hidden border-border/60 shadow-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-3 font-semibold">Request#</th>
                      <th className="px-3 py-3 font-semibold">Source</th>
                      <th className="px-3 py-3 font-semibold">Destination</th>
                      <th className="px-3 py-3 font-semibold">Supplier</th>
                      <th className="px-3 py-3 font-semibold">Approval</th>
                      <th className="px-3 py-3 font-semibold">Delivery</th>
                      <th className="px-3 py-3 font-semibold">Date</th>
                      <th className="px-3 py-3 font-semibold"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReqs.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-border/40 hover:bg-muted/30 last:border-0"
                      >
                        <td className="px-3 py-3 font-mono text-xs font-bold">
                          {r.requestNumber}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {r.sourceBranch?.name ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {r.destinationBranch?.name ?? "—"}
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {r.supplier?.name ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <ApprovalBadge status={r.approvalStatus} />
                        </td>
                        <td className="px-3 py-3">
                          <DeliveryBadge status={r.deliveryStatus} />
                        </td>
                        <td className="px-3 py-3 text-xs">
                          {new Date(r.createdAt).toLocaleDateString("en-SA")}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex gap-1 justify-end">
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-7 w-7"
                              onClick={() => setViewReq(r)}
                            >
                              <Eye className="h-3.5 w-3.5" />
                            </Button>
                            {r.approvalStatus === "request_generated" && (
                              <>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-success"
                                  disabled={reqSaving}
                                  onClick={() => handleApprove(r, true)}
                                >
                                  <CheckCircle className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  disabled={reqSaving}
                                  onClick={() => handleApprove(r, false)}
                                >
                                  <XCircle className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredReqs.length === 0 && (
                      <tr>
                        <td
                          colSpan={8}
                          className="text-center py-10 text-muted-foreground text-sm"
                        >
                          No requests found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── New Warehouse Sheet ── */}
      <WarehouseFormSheet
        open={newWhOpen}
        onClose={() => setNewWhOpen(false)}
        onSubmit={handleCreateWarehouse}
        title="New Warehouse"
        wForm={wForm}
        setWForm={setWForm}
        saving={whSaving}
      />

      {/* ── Edit Warehouse Sheet ── */}
      <WarehouseFormSheet
        open={editWhOpen}
        onClose={() => {
          setEditWhOpen(false);
          setEditTarget(null);
        }}
        onSubmit={handleUpdateWarehouse}
        title="Edit Warehouse"
        wForm={wForm}
        setWForm={setWForm}
        saving={whSaving}
      />

      {/* ── View Warehouse Sheet ── */}
      <Sheet open={!!viewWh} onOpenChange={(v) => !v && setViewWh(null)}>
        <SheetContent style={{ width: 520 }} className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <WarehouseIcon className="h-5 w-5 text-primary" />
              {viewWh?.name}
              {viewWh && (
                <Badge className="ml-1 bg-muted text-muted-foreground border-0 text-xs font-mono">
                  {viewWh.code}
                </Badge>
              )}
            </SheetTitle>
          </SheetHeader>

          {/* Feedback banners */}
          {linkSuccess && (
            <div className="mt-3 rounded-lg bg-success/15 border border-success/30 px-3 py-2 text-xs text-success font-medium">
              {linkSuccess}
            </div>
          )}
          {linkError && (
            <div className="mt-3 rounded-lg bg-destructive/15 border border-destructive/30 px-3 py-2 text-xs text-destructive font-medium">
              {linkError}
            </div>
          )}

          {viewWh && (
            <Tabs defaultValue="overview" className="mt-4">
              <TabsList className="w-full">
                <TabsTrigger value="overview" className="flex-1 text-xs">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="branches" className="flex-1 text-xs">
                  Branches
                </TabsTrigger>
                <TabsTrigger value="suppliers" className="flex-1 text-xs">
                  Suppliers
                </TabsTrigger>
                <TabsTrigger value="stock" className="flex-1 text-xs">
                  Stock
                </TabsTrigger>
              </TabsList>

              {/* Overview */}
              <TabsContent value="overview" className="mt-4 space-y-3">
                <F label="Code" value={viewWh.code} />
                <F label="Name" value={viewWh.name} />
                {viewWh.nameAr && <F label="Name (Arabic)" value={viewWh.nameAr} />}
                <F label="City" value={viewWh.city ?? "—"} />
                <F label="Address" value={viewWh.address ?? "—"} />
                <F
                  label="Capacity"
                  value={viewWh.capacity != null ? String(viewWh.capacity) : "—"}
                />
                <F label="Contact Person" value={viewWh.contactPerson ?? "—"} />
                <F label="Contact Number" value={viewWh.contactNumber ?? "—"} />
                <F label="Status" value={viewWh.status} />
                <F
                  label="Created"
                  value={new Date(viewWh.createdAt).toLocaleDateString("en-SA")}
                />
              </TabsContent>

              {/* Branches */}
              <TabsContent value="branches" className="mt-4 space-y-4">
                <div className="space-y-2">
                  {(viewWh.branchWarehouses ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No branches linked yet.
                    </p>
                  ) : (
                    (viewWh.branchWarehouses ?? []).map((bw) => (
                      <div
                        key={bw.id}
                        className="flex items-center justify-between rounded-xl border border-border/40 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <span className="font-medium">
                            {bw.branch?.name ?? bw.branchId}
                          </span>
                          {bw.isPrimary && (
                            <Badge className="bg-primary/15 text-primary border-0 text-xs">
                              Primary
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleUnlinkBranch(bw.branchId)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                {availableBranches.length > 0 && (
                  <div className="rounded-xl border border-dashed border-border/60 p-3 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Link Branch
                    </p>
                    <Select value={linkBranchId} onValueChange={setLinkBranchId}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select branch" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableBranches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        id="linkBranchPrimary"
                        checked={linkBranchPrimary}
                        onChange={(e) => setLinkBranchPrimary(e.target.checked)}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <Label htmlFor="linkBranchPrimary" className="text-xs cursor-pointer">
                        Mark as Primary
                      </Label>
                    </div>
                    <Button
                      size="sm"
                      className="w-full gradient-primary text-primary-foreground border-0 shadow-glow"
                      onClick={handleLinkBranch}
                      disabled={linkBranchSaving || !linkBranchId}
                    >
                      {linkBranchSaving ? "Linking…" : "Add Branch"}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Suppliers */}
              <TabsContent value="suppliers" className="mt-4 space-y-4">
                <div className="space-y-2">
                  {(viewWh.warehouseSuppliers ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">
                      No suppliers linked yet.
                    </p>
                  ) : (
                    (viewWh.warehouseSuppliers ?? []).map((ws) => (
                      <div
                        key={ws.id}
                        className="flex items-center justify-between rounded-xl border border-border/40 px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Link2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <div>
                            <span className="font-medium">
                              {ws.supplier?.name ?? ws.supplierId}
                            </span>
                            {ws.notes && (
                              <p className="text-xs text-muted-foreground">
                                {ws.notes}
                              </p>
                            )}
                          </div>
                          {ws.isPrimary && (
                            <Badge className="bg-primary/15 text-primary border-0 text-xs">
                              Primary
                            </Badge>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive hover:text-destructive"
                          onClick={() => handleUnlinkSupplier(ws.supplierId)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))
                  )}
                </div>

                {availableSuppliers.length > 0 && (
                  <div className="rounded-xl border border-dashed border-border/60 p-3 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Link Supplier
                    </p>
                    <Select
                      value={linkSupplierId}
                      onValueChange={setLinkSupplierId}
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select supplier" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSuppliers.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      value={linkSupplierNotes}
                      onChange={(e) => setLinkSupplierNotes(e.target.value)}
                      className="h-9"
                      placeholder="Notes (optional)"
                    />
                    <div className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        id="linkSupplierPrimary"
                        checked={linkSupplierPrimary}
                        onChange={(e) => setLinkSupplierPrimary(e.target.checked)}
                        className="h-4 w-4 rounded border-border accent-primary"
                      />
                      <Label
                        htmlFor="linkSupplierPrimary"
                        className="text-xs cursor-pointer"
                      >
                        Mark as Primary
                      </Label>
                    </div>
                    <Button
                      size="sm"
                      className="w-full gradient-primary text-primary-foreground border-0 shadow-glow"
                      onClick={handleLinkSupplier}
                      disabled={linkSupplierSaving || !linkSupplierId}
                    >
                      {linkSupplierSaving ? "Linking…" : "Add Supplier"}
                    </Button>
                  </div>
                )}
              </TabsContent>

              {/* Stock */}
              <TabsContent value="stock" className="mt-4">
                {viewStockLoading ? (
                  <p className="text-xs text-muted-foreground">Loading stock…</p>
                ) : viewStock.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No stock records for this warehouse.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-xl border border-border/40">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                          <th className="px-3 py-2 font-semibold">Product</th>
                          <th className="px-3 py-2 font-semibold text-right">Qty</th>
                          <th className="px-3 py-2 font-semibold text-right">Reserved</th>
                          <th className="px-3 py-2 font-semibold text-right">Reorder</th>
                        </tr>
                      </thead>
                      <tbody>
                        {viewStock.map((s) => (
                          <tr
                            key={s.id}
                            className="border-b border-border/40 hover:bg-muted/30 last:border-0"
                          >
                            <td className="px-3 py-2">
                              <div>
                                <p className="font-medium">{s.product?.name ?? s.productId}</p>
                                {s.product?.sku && (
                                  <p className="font-mono text-muted-foreground">
                                    {s.product.sku}
                                  </p>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-2 text-right font-mono">{s.quantity}</td>
                            <td className="px-3 py-2 text-right font-mono">
                              {s.reservedQuantity}
                            </td>
                            <td className="px-3 py-2 text-right font-mono">
                              {s.reorderLevel}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* ── View Request Sheet ── */}
      <Sheet open={!!viewReq} onOpenChange={(v) => !v && setViewReq(null)}>
        <SheetContent style={{ width: 480 }} className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Truck className="h-5 w-5 text-primary" />
              {viewReq?.requestNumber}
            </SheetTitle>
          </SheetHeader>
          {viewReq && (
            <Tabs defaultValue="items" className="mt-4">
              <TabsList>
                <TabsTrigger value="items" className="gap-1.5">
                  <Package className="h-3.5 w-3.5" />
                  Items
                </TabsTrigger>
                <TabsTrigger value="notes" className="gap-1.5">
                  <Info className="h-3.5 w-3.5" />
                  Notes
                </TabsTrigger>
                <TabsTrigger value="tracking" className="gap-1.5">
                  <Truck className="h-3.5 w-3.5" />
                  Tracking
                </TabsTrigger>
              </TabsList>
              <TabsContent value="items" className="mt-4 space-y-3">
                <F label="Source" value={viewReq.sourceBranch?.name ?? "—"} />
                <F label="Destination" value={viewReq.destinationBranch?.name ?? "—"} />
                <F label="Supplier" value={viewReq.supplier?.name ?? "—"} />
                <F
                  label="Approval"
                  value={viewReq.approvalStatus.replace(/_/g, " ")}
                />
                <F
                  label="Delivery"
                  value={viewReq.deliveryStatus?.replace(/_/g, " ") ?? "—"}
                />
                {viewReq.items && viewReq.items.length > 0 && (
                  <div className="mt-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Items
                    </p>
                    <div className="space-y-2">
                      {viewReq.items.map((item, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-xl border border-border/40 p-3 text-sm"
                        >
                          <div>
                            <p className="font-medium">{item.product?.name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground font-mono">
                              {item.product?.sku ?? ""}
                            </p>
                          </div>
                          <div className="text-right text-xs text-muted-foreground">
                            <p>Req: {item.requestedQuantity}</p>
                            {item.approvedQuantity != null && (
                              <p>Approved: {item.approvedQuantity}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>
              <TabsContent value="notes" className="mt-4">
                <p className="text-xs text-muted-foreground">
                  {viewReq.notes ?? "No notes for this request."}
                </p>
              </TabsContent>
              <TabsContent value="tracking" className="mt-4 space-y-3">
                <div className="flex items-center gap-3 text-sm">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      viewReq.approvalStatus === "approved"
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <CheckCircle className="h-4 w-4" />
                  </div>
                  <span>
                    Approval:{" "}
                    <strong className="capitalize">
                      {viewReq.approvalStatus.replace(/_/g, " ")}
                    </strong>
                  </span>
                </div>
                <div className="flex items-center gap-3 text-sm">
                  <div
                    className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      viewReq.deliveryStatus === "delivered"
                        ? "bg-success/15 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Truck className="h-4 w-4" />
                  </div>
                  <span>
                    Delivery:{" "}
                    <strong className="capitalize">
                      {viewReq.deliveryStatus?.replace(/_/g, " ") ?? "Pending"}
                    </strong>
                  </span>
                </div>
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Create Request Sheet ── */}
      <Sheet open={createReqOpen} onOpenChange={(v) => !v && setCreateReqOpen(false)}>
        <SheetContent style={{ width: 420 }} className="overflow-y-auto">
          <SheetHeader>
            <SheetTitle>New Warehouse Request</SheetTitle>
          </SheetHeader>
          <div className="mt-5 space-y-4">
            <div className="space-y-1">
              <Label className="text-xs">Destination Branch *</Label>
              <Select
                value={reqForm.destinationBranchId}
                onValueChange={setRF("destinationBranchId")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select destination" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Source Branch (optional)</Label>
              <Select
                value={reqForm.sourceBranchId}
                onValueChange={setRF("sourceBranchId")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="None (supplier order)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Supplier (optional)</Label>
              <Select
                value={reqForm.supplierId}
                onValueChange={setRF("supplierId")}
              >
                <SelectTrigger className="h-9">
                  <SelectValue placeholder="Select supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Input
                value={reqForm.notes}
                onChange={(e) => setReqForm((p) => ({ ...p, notes: e.target.value }))}
                className="h-9"
                placeholder="Optional notes…"
              />
            </div>
            <Button
              className="w-full gradient-primary text-primary-foreground border-0 shadow-glow"
              onClick={handleCreateRequest}
              disabled={reqSaving || !reqForm.destinationBranchId}
            >
              {reqSaving ? "Creating…" : "Create Request"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </PageShell>
  );
}
