import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  ArrowRight, Warehouse, Building2, Truck, Package, RefreshCcw,
  CheckCircle2, Clock, Plus, Trash2, Eye, ArrowLeftRight, Loader2, X, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  api,
  type StockTransfer, type StockTransferItem, type PurchaseOrder,
  type Branch, type Warehouse as WarehouseType, type Supplier, type Product,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { usePermission } from "@/lib/use-permission";
import { SARIcon } from "@/lib/currency";

export const Route = createFileRoute("/_app/stock-transfers")({ component: StockTransfers });

// ─── Constants ──────────────────────────────────────────────────────────────

type TransferType =
  | "supplier_to_warehouse"
  | "warehouse_to_branch"
  | "branch_to_warehouse"
  | "branch_to_branch"
  | "warehouse_to_warehouse"
  | "warehouse_to_supplier";

const TRANSFER_TYPES: { value: TransferType; label: string; description: string; icon: React.ElementType }[] = [
  { value: "supplier_to_warehouse", label: "Supplier → Warehouse", description: "Inbound from supplier to warehouse (linked to PO)", icon: Truck },
  { value: "warehouse_to_branch", label: "Warehouse → Branch", description: "Replenish branch from warehouse", icon: Warehouse },
  { value: "branch_to_warehouse", label: "Branch → Warehouse", description: "Return expired/damaged stock to warehouse", icon: Building2 },
  { value: "branch_to_branch", label: "Branch → Branch (Mart to Mart)", description: "Inter-branch transfer", icon: ArrowLeftRight },
  { value: "warehouse_to_warehouse", label: "Warehouse → Warehouse", description: "Redistribute between warehouses", icon: RefreshCcw },
  { value: "warehouse_to_supplier", label: "Warehouse → Supplier (RTS)", description: "Return to supplier (defective/overstocked)", icon: Package },
];

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "pending_approval", label: "Pending Approval" },
  { value: "approved", label: "Approved" },
  { value: "in_transit", label: "In Transit" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

const RETURN_REASONS = [
  { value: "expired", label: "Expired" },
  { value: "damaged", label: "Damaged" },
  { value: "quality_issue", label: "Quality Issue" },
  { value: "overstock", label: "Overstock" },
  { value: "other", label: "Other" },
];

const STATUS_FLOW = ["draft", "pending_approval", "approved", "in_transit", "completed"];

const PO_STATUS_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  approved: "bg-primary/15 text-primary",
  ordered: "bg-primary/15 text-primary",
  partial_received: "bg-warning/15 text-warning-foreground",
  fully_received: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getSourceLabel(t: StockTransfer): string {
  if (t.sourceSupplier) return `Supplier: ${t.sourceSupplier.name}`;
  if (t.sourceWarehouse) return `WH: ${t.sourceWarehouse.name}`;
  if (t.sourceBranch) return `Branch: ${t.sourceBranch.name}`;
  return "—";
}

function getDestLabel(t: StockTransfer): string {
  if (t.destSupplier) return `Supplier: ${t.destSupplier.name}`;
  if (t.destWarehouse) return `WH: ${t.destWarehouse.name}`;
  if (t.destBranch) return `Branch: ${t.destBranch.name}`;
  return "—";
}

function getTypeLabel(value: string): string {
  return TRANSFER_TYPES.find(x => x.value === value)?.label ?? value;
}

function needsReturnReason(type: string) {
  return type === "branch_to_warehouse" || type === "warehouse_to_supplier";
}

function isReturnType(type: string) {
  return type === "branch_to_warehouse" || type === "warehouse_to_supplier";
}

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface PoItem {
  productId: string;
  productName: string;
  maxQty: number;
  unitCost: number;
}

interface FetchedPo {
  id: string;
  poNumber: string;
  supplierId?: string;
  warehouseId?: string;
  branchId?: string;
  supplierName: string;
  warehouseName?: string;
  branchName?: string;
  items: PoItem[];
}

interface ItemRow {
  productId: string;
  requestedQuantity: number;
  unitCost: string;
  expiryDate: string;
}

interface CreateForm {
  sourceBranchId: string;
  sourceWarehouseId: string;
  sourceSupplierId: string;
  destBranchId: string;
  destWarehouseId: string;
  destSupplierId: string;
  returnReason: string;
  expectedDate: string;
  notes: string;
}

const emptyForm: CreateForm = {
  sourceBranchId: "",
  sourceWarehouseId: "",
  sourceSupplierId: "",
  destBranchId: "",
  destWarehouseId: "",
  destSupplierId: "",
  returnReason: "",
  expectedDate: "",
  notes: "",
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const classes: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    pending_approval: "bg-warning/20 text-warning-foreground",
    approved: "bg-primary/15 text-primary",
    in_transit: "bg-primary/15 text-primary",
    completed: "bg-success/15 text-success",
    rejected: "bg-destructive/15 text-destructive",
    cancelled: "bg-muted text-muted-foreground",
  };
  const label: Record<string, string> = {
    draft: "Draft",
    pending_approval: "Pending Approval",
    approved: "Approved",
    in_transit: "In Transit",
    completed: "Completed",
    rejected: "Rejected",
    cancelled: "Cancelled",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", classes[status] ?? "bg-muted text-muted-foreground")}>
      {status === "in_transit" && <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />}
      {label[status] ?? status}
    </span>
  );
}

// ─── Type Selector Step ───────────────────────────────────────────────────────

function TypeSelectorStep({
  selected,
  onSelect,
  allowedTypes,
}: {
  selected: TransferType | null;
  onSelect: (t: TransferType) => void;
  allowedTypes?: TransferType[];
}) {
  const visibleTypes = allowedTypes
    ? TRANSFER_TYPES.filter(t => allowedTypes.includes(t.value))
    : TRANSFER_TYPES;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Select the direction of the stock transfer.</p>
      <div className="grid grid-cols-2 gap-3">
        {visibleTypes.map(({ value, label, description, icon: Icon }) => (
          <Card
            key={value}
            className={cn(
              "cursor-pointer border-2 transition-all hover:border-primary/50",
              selected === value ? "border-primary shadow-sm" : "border-border/60",
            )}
            onClick={() => onSelect(value)}
          >
            <CardContent className="p-3 flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center", selected === value ? "gradient-primary text-primary-foreground" : "bg-muted")}>
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="text-xs font-semibold leading-tight">{label}</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Source/Dest Step ─────────────────────────────────────────────────────────

function SourceDestStep({
  transferType,
  branches,
  warehouses,
  suppliers,
  form,
  onChange,
}: {
  transferType: TransferType;
  branches: Branch[];
  warehouses: WarehouseType[];
  suppliers: Supplier[];
  form: CreateForm;
  onChange: (patch: Partial<CreateForm>) => void;
}) {
  const branchOptions = branches.map(b => ({ value: b.id, label: b.name }));
  const warehouseOptions = warehouses.map(w => ({ value: w.id, label: w.name }));
  const supplierOptions = suppliers.map(s => ({ value: s.id, label: s.name }));

  const FieldRow = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="space-y-1">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
    </div>
  );

  const SelectField = ({
    label, value, placeholder, options, onValueChange,
  }: {
    label: string; value: string; placeholder: string;
    options: { value: string; label: string }[]; onValueChange: (v: string) => void;
  }) => (
    <FieldRow label={label}>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="h-9">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </FieldRow>
  );

  return (
    <div className="space-y-4">
      {transferType === "supplier_to_warehouse" && (
        <>
          <SelectField label="Source — Supplier" value={form.sourceSupplierId} placeholder="Select supplier" options={supplierOptions} onValueChange={v => onChange({ sourceSupplierId: v })} />
          <SelectField label="Destination — Warehouse" value={form.destWarehouseId} placeholder="Select warehouse" options={warehouseOptions} onValueChange={v => onChange({ destWarehouseId: v })} />
        </>
      )}
      {transferType === "warehouse_to_branch" && (
        <>
          <SelectField label="Source — Warehouse" value={form.sourceWarehouseId} placeholder="Select warehouse" options={warehouseOptions} onValueChange={v => onChange({ sourceWarehouseId: v })} />
          <SelectField label="Destination — Branch" value={form.destBranchId} placeholder="Select branch" options={branchOptions} onValueChange={v => onChange({ destBranchId: v })} />
        </>
      )}
      {/* branch_to_warehouse is handled via PO lookup in step 2 */}
      {transferType === "branch_to_branch" && (
        <>
          <SelectField label="Source — Branch" value={form.sourceBranchId} placeholder="Select source branch" options={branchOptions} onValueChange={v => onChange({ sourceBranchId: v })} />
          <SelectField label="Destination — Branch" value={form.destBranchId} placeholder="Select destination branch" options={branchOptions.filter(b => b.value !== form.sourceBranchId)} onValueChange={v => onChange({ destBranchId: v })} />
        </>
      )}
      {transferType === "warehouse_to_warehouse" && (
        <>
          <SelectField label="Source — Warehouse" value={form.sourceWarehouseId} placeholder="Select source warehouse" options={warehouseOptions} onValueChange={v => onChange({ sourceWarehouseId: v })} />
          <SelectField label="Destination — Warehouse" value={form.destWarehouseId} placeholder="Select destination warehouse" options={warehouseOptions.filter(w => w.value !== form.sourceWarehouseId)} onValueChange={v => onChange({ destWarehouseId: v })} />
        </>
      )}
      {/* warehouse_to_supplier is handled via PO lookup in step 2 */}
    </div>
  );
}

// ─── PO Lookup Section ────────────────────────────────────────────────────────

function PoLookupSection({
  transferType,
  poNumber,
  onPoNumberChange,
  onFetch,
  fetching,
  error,
  fetchedPo,
}: {
  transferType: TransferType;
  poNumber: string;
  onPoNumberChange: (v: string) => void;
  onFetch: () => void;
  fetching: boolean;
  error: string;
  fetchedPo: FetchedPo | null;
}) {
  const label = transferType === "branch_to_warehouse"
    ? "Transfer Number (TRF-...) — enter the original Warehouse → Branch transfer to auto-fill items & route"
    : isReturnType(transferType)
    ? "PO Number (PO-...) — auto-fills supplier, warehouse & items from the original purchase order"
    : "PO Number — auto-fills supplier & warehouse, loads items";

  return (
    <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 space-y-2">
      <Label className="text-xs font-medium text-primary">{label}</Label>
      <div className="flex gap-2">
        <Input
          className="h-8 text-xs flex-1"
          placeholder={transferType === "branch_to_warehouse" ? "TRF-YYYYMMDD-XXXXXX" : "PO-YYYYMMDD-XXXXXX"}
          value={poNumber}
          onChange={e => onPoNumberChange(e.target.value)}
          onKeyDown={e => e.key === "Enter" && onFetch()}
        />
        <Button
          size="sm"
          variant="outline"
          className="h-8 gap-1.5 shrink-0"
          onClick={onFetch}
          disabled={fetching || !poNumber.trim()}
        >
          {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Fetch
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      {fetchedPo && (
        <div className="rounded-lg bg-success/10 border border-success/30 px-3 py-2 space-y-0.5">
          <p className="text-xs font-semibold text-success">✓ {fetchedPo.poNumber}</p>
          <p className="text-xs text-muted-foreground">
            {fetchedPo.supplierName && <span>Supplier: {fetchedPo.supplierName}</span>}
            {fetchedPo.warehouseName && <span> · WH: {fetchedPo.warehouseName}</span>}
            {fetchedPo.branchName && <span> · Branch: {fetchedPo.branchName}</span>}
            <span> · {fetchedPo.items.length} item(s) loaded</span>
          </p>
          {isReturnType(transferType) && (
            <p className="text-[11px] text-success/80 font-medium mt-1">
              Source & destination auto-filled · return reason required in next step
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Items Step ───────────────────────────────────────────────────────────────

function ItemsStep({
  items,
  products,
  poItems,
  onChange,
}: {
  items: ItemRow[];
  products: Product[];
  poItems?: PoItem[];
  onChange: (items: ItemRow[]) => void;
}) {
  const addItem = () =>
    onChange([...items, { productId: "", requestedQuantity: 1, unitCost: "", expiryDate: "" }]);

  const removeItem = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  const updateItem = (i: number, patch: Partial<ItemRow>) =>
    onChange(items.map((item, idx) => (idx === i ? { ...item, ...patch } : item)));

  const handleProductChange = (i: number, v: string) => {
    const patch: Partial<ItemRow> = { productId: v };
    if (poItems) {
      // PO/transfer-linked: use the ordered unit cost
      const pi = poItems.find(x => x.productId === v);
      if (pi) {
        const cost = pi.unitCost > 0 ? pi.unitCost : (products.find(p => p.id === v)?.costPrice ?? 0);
        if (cost > 0) patch.unitCost = String(cost);
      }
    } else {
      // Free transfer: auto-fill from product cost price so total updates immediately
      const cost = products.find(p => p.id === v)?.costPrice ?? 0;
      if (cost > 0) patch.unitCost = String(cost);
    }
    updateItem(i, patch);
  };

  const availableOptions = poItems
    ? poItems.map(pi => ({ value: pi.productId, label: pi.productName }))
    : products.map(p => ({ value: p.id, label: p.name }));

  const netAmount = items
    .filter(i => i.productId)
    .reduce((s, i) => s + i.requestedQuantity * (parseFloat(i.unitCost || "0") || 0), 0);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Items ({items.length})</span>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={addItem}>
          <Plus className="h-3.5 w-3.5" /> Add Item
        </Button>
      </div>
      {poItems && (
        <p className="text-xs text-muted-foreground bg-muted/40 rounded px-2 py-1">
          Only items available at the source location are shown. Quantity cannot exceed available stock.
        </p>
      )}
      {items.length === 0 && (
        <div className="rounded-lg border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
          No items yet. Click "Add Item" to begin.
        </div>
      )}
      <div className="space-y-2">
        {items.map((item, i) => {
          const maxQty = poItems?.find(x => x.productId === item.productId)?.maxQty;
          const qtyExceeded = maxQty !== undefined && item.requestedQuantity > maxQty;
          return (
            <Card key={i} className="border-border/60">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-[11px]">Product</Label>
                    <Select value={item.productId} onValueChange={v => handleProductChange(i, v)}>
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Select product" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableOptions.map(p => (
                          <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-[11px]">
                      Qty{maxQty !== undefined ? ` (max ${maxQty})` : ""}
                    </Label>
                    <Input
                      type="number"
                      min={1}
                      max={maxQty}
                      className={cn("h-8 text-xs", qtyExceeded && "border-destructive ring-1 ring-destructive")}
                      value={item.requestedQuantity}
                      onChange={e => updateItem(i, { requestedQuantity: Number(e.target.value) })}
                    />
                    {qtyExceeded && (
                      <p className="text-[10px] text-destructive leading-tight">Exceeds PO qty ({maxQty})</p>
                    )}
                  </div>
                  <button
                    className="mt-5 text-muted-foreground hover:text-destructive transition-colors"
                    onClick={() => removeItem(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">Unit Cost (optional)</Label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="0.00"
                      value={item.unitCost}
                      onChange={e => updateItem(i, { unitCost: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">Expiry Date (optional)</Label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={item.expiryDate}
                      onChange={e => updateItem(i, { expiryDate: e.target.value })}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      {items.length > 0 && (
        <div className={cn(
          "flex items-center justify-between rounded-lg px-3 py-2.5",
          netAmount > 0 ? "bg-muted/40" : "bg-warning/10 border border-warning/20",
        )}>
          <span className="text-xs text-muted-foreground">
            {items.filter(i => i.productId).length} item(s) · Net Amount
            {netAmount === 0 && (
              <span className="ml-1.5 text-[11px] text-warning-foreground font-medium">
                — enter unit costs to calculate
              </span>
            )}
          </span>
          <span className={cn("text-sm font-semibold flex items-center gap-0.5", netAmount === 0 && "text-muted-foreground")}>
            <SARIcon />{netAmount.toFixed(2)}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Create Transfer Sheet ────────────────────────────────────────────────────

function CreateTransferSheet({
  open,
  onClose,
  branches,
  warehouses,
  suppliers,
  products,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  branches: Branch[];
  warehouses: WarehouseType[];
  suppliers: Supplier[];
  products: Product[];
  onCreated: () => void;
}) {
  const { user } = useAuth();
  // Pickers handle order fulfillment — they only move stock from warehouse to branch
  const allowedTransferTypes: TransferType[] | undefined =
    user?.role === "picker" ? ["warehouse_to_branch"] : undefined;
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [transferType, setTransferType] = useState<TransferType | null>(null);
  const [form, setForm] = useState<CreateForm>(emptyForm);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [saving, setSaving] = useState(false);

  // PO / transfer lookup state (only for return types)
  const [poNumber, setPoNumber] = useState("");
  const [poFetching, setPoFetching] = useState(false);
  const [poError, setPoError] = useState("");
  const [fetchedPo, setFetchedPo] = useState<FetchedPo | null>(null);

  // Source-location stock — loaded when source warehouse/branch is selected for non-return transfers
  // null = not applicable (show all products), [] = loaded but empty
  const [sourceStock, setSourceStock] = useState<PoItem[] | null>(null);

  useEffect(() => {
    const needsStock =
      transferType === "warehouse_to_branch" ||
      transferType === "warehouse_to_warehouse" ||
      transferType === "branch_to_branch";
    if (!needsStock) { setSourceStock(null); return; }

    const whId = form.sourceWarehouseId;
    const brId = form.sourceBranchId;
    if (!whId && !brId) { setSourceStock(null); return; }

    setSourceStock(null); // loading — temporarily show all
    setItems([]);         // clear previous items when source changes

    if (whId) {
      api.getWarehouseStock(whId)
        .then(stocks => setSourceStock(
          stocks
            .filter(s => s.quantity > 0)
            .map(s => ({
              productId: s.productId,
              productName: s.product?.name ?? s.productId,
              maxQty: s.quantity,
              unitCost: s.product?.costPrice ?? 0,
            }))
        ))
        .catch(() => setSourceStock([]));
    } else if (brId) {
      api.getStock({ branchId: brId })
        .then(stocks => setSourceStock(
          stocks
            .filter(s => s.quantity > 0)
            .map(s => ({
              productId: s.productId,
              productName: s.product?.name ?? s.productId,
              maxQty: Math.max(0, s.quantity - (s.reservedQuantity ?? 0)),
              unitCost: s.product?.costPrice ?? 0,
            }))
        ))
        .catch(() => setSourceStock([]));
    }
  }, [form.sourceWarehouseId, form.sourceBranchId, transferType]);

  const reset = () => {
    setStep(1);
    setTransferType(null);
    setForm(emptyForm);
    setItems([]);
    setSaving(false);
    setPoNumber("");
    setPoFetching(false);
    setPoError("");
    setFetchedPo(null);
    setSourceStock(null);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleTypeSelect = (t: TransferType) => {
    setTransferType(t);
    setPoNumber("");
    setPoError("");
    setFetchedPo(null);
    setSourceStock(null);
    setItems([]);
  };

  const handlePoFetch = async () => {
    if (!poNumber.trim() || !transferType) return;
    setPoFetching(true);
    setPoError("");
    setFetchedPo(null);
    try {
      let fetched: FetchedPo;

      if (transferType === "branch_to_warehouse") {
        // Branch returns reference the original WH→Branch transfer by transfer number (TRF-...)
        const trf = await api.getStockTransferByNumber(poNumber.trim());
        fetched = {
          id: trf.id,
          poNumber: trf.transferNumber ?? poNumber.trim(),
          // For a return: original WH→Branch destBranch becomes source, sourceWarehouse becomes dest
          supplierId: undefined,
          warehouseId: trf.sourceWarehouseId,
          branchId: trf.destBranchId,
          supplierName: "",
          warehouseName: trf.sourceWarehouse?.name,
          branchName: trf.destBranch?.name,
          items: (trf.items ?? []).map(item => ({
            productId: item.productId,
            productName: item.product?.name ?? String(item.productId),
            maxQty: item.receivedQuantity ?? item.requestedQuantity,
            unitCost: item.unitCost ?? 0,
          })),
        };
        setForm(p => ({
          ...p,
          sourceBranchId: fetched.branchId ?? p.sourceBranchId,
          destWarehouseId: fetched.warehouseId ?? p.destWarehouseId,
        }));
      } else {
        // RTS (warehouse_to_supplier) and supplier_to_warehouse use PO number
        const po = await api.getPurchaseOrderByNumber(poNumber.trim());
        fetched = {
          id: po.id,
          poNumber: po.poNumber,
          supplierId: po.supplierId,
          warehouseId: po.warehouseId,
          branchId: po.branchId,
          supplierName: po.supplier?.name ?? "",
          warehouseName: po.warehouse?.name,
          branchName: po.branch?.name,
          items: (po.items ?? []).map(item => ({
            productId: item.productId,
            productName: item.product?.name ?? String(item.productId),
            maxQty: item.orderedQuantity,
            unitCost: item.unitCost,
          })),
        };
        if (transferType === "supplier_to_warehouse") {
          setForm(p => ({
            ...p,
            sourceSupplierId: po.supplierId ?? p.sourceSupplierId,
            destWarehouseId: po.warehouseId ?? p.destWarehouseId,
          }));
        } else if (transferType === "warehouse_to_supplier") {
          setForm(p => ({
            ...p,
            sourceWarehouseId: po.warehouseId ?? p.sourceWarehouseId,
            destSupplierId: po.supplierId ?? p.destSupplierId,
          }));
        }
      }

      setFetchedPo(fetched);
      // Pre-populate items with auto-filled costs — fall back to product costPrice if transfer/PO has no cost
      setItems(fetched.items.map(pi => {
        const cost = pi.unitCost > 0
          ? pi.unitCost
          : (products.find(p => p.id === pi.productId)?.costPrice ?? 0);
        return {
          productId: pi.productId,
          requestedQuantity: 1,
          unitCost: cost > 0 ? String(cost) : "",
          expiryDate: "",
        };
      }));
    } catch {
      const hint = transferType === "branch_to_warehouse"
        ? "Transfer not found. Enter the original TRF-YYYYMMDD-XXXXXX number."
        : "PO not found. Enter the PO-YYYYMMDD-XXXXXX number.";
      setPoError(hint);
    } finally {
      setPoFetching(false);
    }
  };

  const handleCreate = async () => {
    if (!transferType) return;
    setSaving(true);
    try {
      const payload: Partial<StockTransfer> = {
        transferType,
        status: "draft",
        sourceBranchId: form.sourceBranchId || undefined,
        sourceWarehouseId: form.sourceWarehouseId || undefined,
        sourceSupplierId: form.sourceSupplierId || undefined,
        destBranchId: form.destBranchId || undefined,
        destWarehouseId: form.destWarehouseId || undefined,
        destSupplierId: form.destSupplierId || undefined,
        // Only link a PO for PO-based lookups — branch_to_warehouse links a transfer, not a PO
        purchaseOrderId: transferType !== "branch_to_warehouse" ? fetchedPo?.id || undefined : undefined,
        returnReason: form.returnReason || undefined,
        expectedDate: form.expectedDate || undefined,
        notes: form.notes || undefined,
        createdBy: user?.id,
        items: items
          .filter(item => item.productId)
          .map(item => ({
            productId: item.productId,
            requestedQuantity: item.requestedQuantity,
            unitCost: item.unitCost ? Number(item.unitCost) : undefined,
            expiryDate: item.expiryDate || undefined,
          })) as StockTransferItem[],
      };
      await api.createStockTransfer(payload);
      onCreated();
      handleClose();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const canAdvanceStep1 = transferType !== null;
  const canAdvanceStep2 = (() => {
    if (!transferType) return false;
    // Return types require a fetched PO (source/dest auto-filled from it)
    if (transferType === "branch_to_warehouse") return fetchedPo !== null;
    if (transferType === "warehouse_to_supplier") return fetchedPo !== null;
    if (transferType === "supplier_to_warehouse") return !!form.sourceSupplierId && !!form.destWarehouseId;
    if (transferType === "warehouse_to_branch") return !!form.sourceWarehouseId && !!form.destBranchId;
    if (transferType === "branch_to_branch") return !!form.sourceBranchId && !!form.destBranchId && form.sourceBranchId !== form.destBranchId;
    if (transferType === "warehouse_to_warehouse") return !!form.sourceWarehouseId && !!form.destWarehouseId && form.sourceWarehouseId !== form.destWarehouseId;
    return false;
  })();

  const hasQtyError = fetchedPo !== null && items.some(item => {
    const pi = fetchedPo.items.find(x => x.productId === item.productId);
    return pi !== undefined && item.requestedQuantity > pi.maxQty;
  });

  const stepTitle = step === 1 ? "Step 1: Transfer Type" : step === 2 ? "Step 2: Source & Destination" : "Step 3: Items & Details";

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[500px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <SheetTitle>New Stock Transfer</SheetTitle>
          <p className="text-xs text-muted-foreground">{stepTitle}</p>
          <div className="flex gap-1 mt-1">
            {[1, 2, 3].map(s => (
              <div key={s} className={cn("h-1 flex-1 rounded-full transition-colors", s <= step ? "bg-primary" : "bg-muted")} />
            ))}
          </div>
        </SheetHeader>

        <div className="space-y-5 pb-6">
          {step === 1 && (
            <TypeSelectorStep selected={transferType} onSelect={handleTypeSelect} allowedTypes={allowedTransferTypes} />
          )}

          {step === 2 && transferType && (
            <div className="space-y-4">
              {isReturnType(transferType) ? (
                // Returns: PO lookup only — source/dest/items all come from the PO
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Enter the original PO or order number to auto-fill source, destination, and allowed items.
                  </p>
                  <PoLookupSection
                    transferType={transferType}
                    poNumber={poNumber}
                    onPoNumberChange={setPoNumber}
                    onFetch={handlePoFetch}
                    fetching={poFetching}
                    error={poError}
                    fetchedPo={fetchedPo}
                  />
                </div>
              ) : (
                // Non-return transfers: manual source/dest dropdowns only
                <SourceDestStep
                  transferType={transferType}
                  branches={branches}
                  warehouses={warehouses}
                  suppliers={suppliers}
                  form={form}
                  onChange={patch => setForm(p => ({ ...p, ...patch }))}
                />
              )}
            </div>
          )}

          {step === 3 && transferType && (
            <div className="space-y-5">
              <ItemsStep
                items={items}
                products={products}
                poItems={fetchedPo?.items ?? (sourceStock !== null ? sourceStock : undefined)}
                onChange={setItems}
              />
              <Separator />
              <div className="space-y-3">
                {isReturnType(transferType) && (
                  <div className="space-y-1">
                    <Label className="text-xs font-medium">Return Reason <span className="text-destructive">*</span></Label>
                    <Select value={form.returnReason} onValueChange={v => setForm(p => ({ ...p, returnReason: v }))}>
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="Select return reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {RETURN_REASONS.map(r => (
                          <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Expected Date</Label>
                  <Input
                    type="date"
                    className="h-9"
                    value={form.expectedDate}
                    min={todayStr()}
                    onChange={e => setForm(p => ({ ...p, expectedDate: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs font-medium">Notes</Label>
                  <Input
                    className="h-9"
                    placeholder="Optional notes…"
                    value={form.notes}
                    onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            {step > 1 && (
              <Button variant="outline" className="flex-1" onClick={() => setStep(s => (s - 1) as 1 | 2 | 3)}>
                Back
              </Button>
            )}
            {step < 3 && (
              <Button
                className="flex-1 gradient-primary text-primary-foreground border-0 shadow-glow"
                disabled={step === 1 ? !canAdvanceStep1 : !canAdvanceStep2}
                onClick={() => setStep(s => (s + 1) as 1 | 2 | 3)}
              >
                Next <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            )}
            {step === 3 && (
              <Button
                className="flex-1 gradient-primary text-primary-foreground border-0 shadow-glow"
                disabled={saving || items.filter(i => i.productId).length === 0 || hasQtyError}
                onClick={handleCreate}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
                Create Transfer
              </Button>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Receive Items Sheet ──────────────────────────────────────────────────────

interface ReceiveItemRow { itemId: string; productName: string; requestedQty: number; receivedQty: number; notes: string }

function ReceiveItemsSheet({
  transfer,
  open,
  onOpenChange,
  onReceived,
}: { transfer: StockTransfer | null; open: boolean; onOpenChange: (v: boolean) => void; onReceived: () => void }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<ReceiveItemRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && transfer) {
      setRows((transfer.items ?? []).map(i => ({
        itemId: i.id,
        productName: i.product?.name ?? "Unknown",
        requestedQty: i.requestedQuantity,
        receivedQty: i.approvedQuantity ?? i.requestedQuantity,
        notes: "",
      })));
      setError("");
    }
  }, [open, transfer?.id]);

  const update = (itemId: string, patch: Partial<ReceiveItemRow>) =>
    setRows(r => r.map(row => row.itemId === itemId ? { ...row, ...patch } : row));

  const handleSubmit = async () => {
    if (!transfer) return;
    setSaving(true); setError("");
    try {
      await api.receiveStockTransfer(
        transfer.id,
        rows.map(r => ({ itemId: r.itemId, receivedQuantity: r.receivedQty, notes: r.notes || undefined })),
        user?.id,
      );
      onReceived();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to receive transfer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={v => { onOpenChange(v); if (!v) setError(""); }}>
      <SheetContent side="right" className="w-full sm:max-w-[520px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" /> Receive Transfer
          </SheetTitle>
          {transfer && <p className="text-xs text-muted-foreground font-mono">{transfer.transferNumber}</p>}
        </SheetHeader>
        <div className="mt-5 space-y-4">
          <p className="text-xs text-muted-foreground">Enter the actual quantities received. Leave unchanged to confirm the approved quantity.</p>
          {rows.map(row => (
            <Card key={row.itemId} className="border-border/60">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{row.productName}</p>
                    <p className="text-xs text-muted-foreground">Requested: {row.requestedQty}</p>
                  </div>
                  <div className="space-y-1 shrink-0">
                    <Label className="text-[11px] font-medium">Received Qty</Label>
                    <Input
                      type="number"
                      min={0}
                      max={row.requestedQty * 2}
                      className="h-8 w-24 text-sm text-center"
                      value={row.receivedQty}
                      onChange={e => update(row.itemId, { receivedQty: Number(e.target.value) || 0 })}
                    />
                  </div>
                </div>
                {row.receivedQty !== row.requestedQty && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-warning-foreground font-medium">
                      Discrepancy: {row.receivedQty - row.requestedQty > 0 ? "+" : ""}{row.receivedQty - row.requestedQty} — Add note
                    </Label>
                    <Input
                      className="h-7 text-xs"
                      placeholder="e.g. Damaged in transit, short shipment…"
                      value={row.notes}
                      onChange={e => update(row.itemId, { notes: e.target.value })}
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex gap-2 pt-2 border-t border-border/60">
            <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button className="flex-1 gradient-primary text-primary-foreground border-0 shadow-glow" onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
              {saving ? "Confirming…" : "Confirm Receipt"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Timeline Tab ─────────────────────────────────────────────────────────────

function TimelineTab({ transfer }: { transfer: StockTransfer }) {
  const currentIdx = STATUS_FLOW.indexOf(transfer.status);
  const isTerminal = transfer.status === "rejected" || transfer.status === "cancelled";

  return (
    <div className="py-4">
      {isTerminal && (
        <div className="mb-4 rounded-lg bg-destructive/10 px-4 py-2 text-sm text-destructive font-medium capitalize">
          Transfer {transfer.status}
        </div>
      )}
      <div className="relative flex flex-col gap-0">
        {STATUS_FLOW.map((status, idx) => {
          const completed = idx <= currentIdx && !isTerminal;
          const isCurrent = idx === currentIdx && !isTerminal;
          const dateStr =
            idx === 0 ? new Date(transfer.createdAt).toLocaleDateString()
            : idx === STATUS_FLOW.length - 1 && transfer.completedDate
            ? new Date(transfer.completedDate).toLocaleDateString()
            : undefined;

          return (
            <div key={status} className="flex items-start gap-4">
              <div className="flex flex-col items-center">
                <div className={cn(
                  "h-8 w-8 rounded-full border-2 flex items-center justify-center transition-all",
                  completed ? "border-primary bg-primary text-primary-foreground"
                    : isCurrent ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground",
                )}>
                  {completed ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-3.5 w-3.5" />}
                </div>
                {idx < STATUS_FLOW.length - 1 && (
                  <div className={cn("w-0.5 h-8", completed && idx < currentIdx ? "bg-primary" : "bg-border")} />
                )}
              </div>
              <div className="pt-1 pb-6">
                <p className={cn("text-sm font-medium capitalize", completed ? "text-foreground" : "text-muted-foreground")}>
                  {status.replace(/_/g, " ")}
                </p>
                {dateStr && <p className="text-xs text-muted-foreground mt-0.5">{dateStr}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── View Transfer Sheet ──────────────────────────────────────────────────────

function ViewTransferSheet({
  transfer,
  onClose,
  onStatusUpdate,
  canApprove,
}: {
  transfer: StockTransfer | null;
  onClose: () => void;
  onStatusUpdate: () => void;
  canApprove?: boolean;
}) {
  const { user } = useAuth();
  const [updating, setUpdating] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);

  if (!transfer) return null;

  const updateStatus = async (newStatus: string) => {
    setUpdating(true);
    try {
      await api.updateTransferStatus(transfer.id, newStatus, newStatus === "approved" ? user?.id : undefined);
      onStatusUpdate();
    } catch (e) {
      console.error(e);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <Sheet open={!!transfer} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-[540px] overflow-y-auto">
        <SheetHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <SheetTitle>{transfer.transferNumber}</SheetTitle>
            <StatusBadge status={transfer.status} />
          </div>
          <p className="text-xs text-muted-foreground">{getTypeLabel(transfer.transferType)}</p>
        </SheetHeader>

        <Tabs defaultValue="details">
          <TabsList className="w-full mb-4">
            <TabsTrigger value="details" className="flex-1">Details</TabsTrigger>
            <TabsTrigger value="items" className="flex-1">Items ({transfer.items?.length ?? 0})</TabsTrigger>
            <TabsTrigger value="timeline" className="flex-1">Timeline</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Transfer #</p>
                <p className="font-mono font-medium">{transfer.transferNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Type</p>
                <Badge variant="outline" className="text-xs gap-1">
                  <ArrowLeftRight className="h-3 w-3" />
                  {getTypeLabel(transfer.transferType)}
                </Badge>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Source</p>
                <p className="font-medium">{getSourceLabel(transfer)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Destination</p>
                <p className="font-medium">{getDestLabel(transfer)}</p>
              </div>
              {transfer.returnReason && (
                <div className="col-span-2">
                  <p className="text-xs text-muted-foreground mb-0.5">Return Reason</p>
                  <Badge variant="outline" className="text-xs capitalize">{transfer.returnReason.replace(/_/g, " ")}</Badge>
                </div>
              )}
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">Created</p>
                <p>{new Date(transfer.createdAt).toLocaleDateString()}</p>
              </div>
              {transfer.expectedDate && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Expected Date</p>
                  <p>{new Date(transfer.expectedDate).toLocaleDateString()}</p>
                </div>
              )}
              {transfer.completedDate && (
                <div>
                  <p className="text-xs text-muted-foreground mb-0.5">Completed</p>
                  <p>{new Date(transfer.completedDate).toLocaleDateString()}</p>
                </div>
              )}
            </div>
            {transfer.notes && (
              <div className="rounded-lg bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                {transfer.notes}
              </div>
            )}
          </TabsContent>

          <TabsContent value="items">
            {(!transfer.items || transfer.items.length === 0) ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No items recorded.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60">
                      <th className="text-left py-2 px-2 text-xs font-medium text-muted-foreground">Product</th>
                      <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Requested</th>
                      <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Approved</th>
                      <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Received</th>
                      <th className="text-right py-2 px-2 text-xs font-medium text-muted-foreground">Unit Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transfer.items.map(item => (
                      <tr key={item.id} className="border-b border-border/40 hover:bg-muted/30 transition-colors">
                        <td className="py-2 px-2 font-medium">{item.product?.name ?? item.productId}</td>
                        <td className="py-2 px-2 text-right">{item.requestedQuantity}</td>
                        <td className="py-2 px-2 text-right">{item.approvedQuantity ?? "—"}</td>
                        <td className="py-2 px-2 text-right">{item.receivedQuantity ?? "—"}</td>
                        <td className="py-2 px-2 text-right">{item.unitCost != null ? <span className="flex items-center gap-0.5 justify-end"><SARIcon />{item.unitCost.toFixed(2)}</span> : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                  {(() => {
                    const total = transfer.items.reduce((s, i) => s + i.requestedQuantity * (i.unitCost ?? 0), 0);
                    return total > 0 ? (
                      <tfoot>
                        <tr className="border-t-2 border-border/60 bg-muted/30">
                          <td colSpan={4} className="py-2 px-2 text-xs font-semibold text-right text-muted-foreground">Total</td>
                          <td className="py-2 px-2 text-right font-semibold text-sm">
                            <span className="flex items-center gap-0.5 justify-end"><SARIcon />{total.toFixed(2)}</span>
                          </td>
                        </tr>
                      </tfoot>
                    ) : null;
                  })()}
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="timeline">
            <TimelineTab transfer={transfer} />
          </TabsContent>
        </Tabs>

        <div className="mt-4 flex gap-2 flex-wrap">
          {transfer.status === "draft" && (
            <Button className="flex-1 gradient-primary text-primary-foreground border-0 shadow-glow" disabled={updating} onClick={() => updateStatus("pending_approval")}>
              {updating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              Submit for Approval
            </Button>
          )}
          {transfer.status === "pending_approval" && canApprove && (
            <>
              <Button className="flex-1 gradient-primary text-primary-foreground border-0 shadow-glow" disabled={updating} onClick={() => updateStatus("approved")}>
                {updating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
                Approve
              </Button>
              <Button variant="outline" className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/10" disabled={updating} onClick={() => updateStatus("rejected")}>
                Reject
              </Button>
            </>
          )}
          {transfer.status === "approved" && canApprove && (
            <Button className="flex-1 gradient-primary text-primary-foreground border-0 shadow-glow" disabled={updating} onClick={() => updateStatus("in_transit")}>
              {updating && <Loader2 className="h-4 w-4 animate-spin mr-1.5" />}
              <Truck className="mr-1.5 h-4 w-4" /> Mark In Transit
            </Button>
          )}
          {transfer.status === "in_transit" && canApprove && (
            <Button className="flex-1 gradient-primary text-primary-foreground border-0 shadow-glow" disabled={updating} onClick={() => setReceiveOpen(true)}>
              <CheckCircle2 className="mr-1.5 h-4 w-4" /> Mark Received
            </Button>
          )}
        </div>

        <ReceiveItemsSheet
          transfer={transfer}
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
          onReceived={() => { setReceiveOpen(false); onStatusUpdate(); }}
        />
      </SheetContent>
    </Sheet>
  );
}

// ─── Row Actions (inline) ─────────────────────────────────────────────────────

function RowStatusAction({
  transfer,
  onAction,
  onReceive,
  canApprove,
}: {
  transfer: StockTransfer;
  onAction: (id: string, status: string) => void;
  onReceive: (t: StockTransfer) => void;
  canApprove?: boolean;
}) {
  if (transfer.status === "draft") {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => onAction(transfer.id, "pending_approval")}>
        Submit
      </Button>
    );
  }
  if (transfer.status === "pending_approval" && canApprove) {
    return (
      <div className="flex gap-1">
        <Button size="sm" className="h-7 text-xs px-2 gradient-primary text-primary-foreground border-0" onClick={() => onAction(transfer.id, "approved")}>
          Approve
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs px-2 border-destructive/50 text-destructive" onClick={() => onAction(transfer.id, "rejected")}>
          Reject
        </Button>
      </div>
    );
  }
  if (transfer.status === "approved") {
    return (
      <Button size="sm" variant="outline" className="h-7 text-xs px-2" onClick={() => onAction(transfer.id, "in_transit")}>
        <Truck className="h-3 w-3 mr-1" /> In Transit
      </Button>
    );
  }
  if (transfer.status === "in_transit") {
    return (
      <Button size="sm" className="h-7 text-xs px-2 gradient-primary text-primary-foreground border-0" onClick={() => onReceive(transfer)}>
        <CheckCircle2 className="h-3 w-3 mr-1" /> Receive
      </Button>
    );
  }
  return null;
}

// ─── Purchase Orders Tab ──────────────────────────────────────────────────────

function PurchaseOrdersTab() {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    api.getPurchaseOrders()
      .then(setPurchaseOrders)
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return purchaseOrders.filter(po => {
      if (s && !po.poNumber.toLowerCase().includes(s) && !(po.supplier?.name.toLowerCase().includes(s)) && !(po.warehouse?.name.toLowerCase().includes(s))) return false;
      if (statusFilter !== "all" && po.status !== statusFilter) return false;
      return true;
    });
  }, [purchaseOrders, q, statusFilter]);

  const PO_STATUSES = ["all", "draft", "approved", "ordered", "partial_received", "fully_received", "cancelled"];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search PO#, supplier, warehouse…"
            className="pl-9 h-9"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-48 h-9">
            <SelectValue placeholder="All Statuses" />
          </SelectTrigger>
          <SelectContent>
            {PO_STATUSES.map(s => (
              <SelectItem key={s} value={s}>{s === "all" ? "All Statuses" : s.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card className="border-border/60 shadow-card">
        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
              <Loader2 className="h-5 w-5 animate-spin" /><span>Loading purchase orders…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center text-sm text-muted-foreground">
              {purchaseOrders.length === 0 ? "No purchase orders yet. Create them from the Purchase Orders page." : "No POs match your filters."}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">PO #</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supplier</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Warehouse / Branch</th>
                  <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Payment</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(po => (
                  <tr key={po.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                    <td className="py-3 px-4">
                      <span className="font-mono text-xs font-semibold">{po.poNumber}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm">{po.supplier?.name ?? "—"}</span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-sm text-muted-foreground">{po.warehouse?.name ?? po.branch?.name ?? "—"}</span>
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="text-sm font-medium">{po.items?.length ?? 0}</span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <span className="text-sm font-semibold flex items-center gap-0.5 justify-end">
                        <SARIcon />{po.totalAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn("text-xs font-medium", po.paymentStatus === "paid" ? "text-success" : po.paymentStatus === "partial" ? "text-warning-foreground" : "text-destructive")}>
                        {po.paymentStatus === "paid" ? "Paid" : po.paymentStatus === "partial" ? "Partial" : "Unpaid"}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize", PO_STATUS_CLS[po.status] ?? "bg-muted text-muted-foreground")}>
                        {po.status.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-xs text-muted-foreground">{new Date(po.createdAt).toLocaleDateString()}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function StockTransfers() {
  const { user } = useAuth();
  const { canCreate, canApprove } = usePermission("Stock Transfers");
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [viewTransfer, setViewTransfer] = useState<StockTransfer | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<StockTransfer | null>(null);

  const load = () => {
    setLoading(true);
    api.getStockTransfers().then(setTransfers).finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api.getBranches().then(setBranches).catch(() => {});
    api.getWarehouses().then(setWarehouses).catch(() => {});
    api.getSuppliers().then(setSuppliers).catch(() => {});
    api.getProducts().then(setProducts).catch(() => {});
  }, []);

  const handleStatusAction = async (id: string, status: string) => {
    try {
      await api.updateTransferStatus(id, status, status === "approved" ? user?.id : undefined);
      load();
    } catch (e) {
      console.error(e);
    }
  };

  const filtered = useMemo(() => {
    const s = search.toLowerCase();
    return transfers.filter(t => {
      if (s && !t.transferNumber.toLowerCase().includes(s) && !getSourceLabel(t).toLowerCase().includes(s) && !getDestLabel(t).toLowerCase().includes(s)) return false;
      if (typeFilter !== "all" && t.transferType !== typeFilter) return false;
      if (statusFilter !== "all" && t.status !== statusFilter) return false;
      if (dateFrom && t.createdAt < dateFrom) return false;
      if (dateTo && t.createdAt > dateTo + "T23:59:59") return false;
      return true;
    });
  }, [transfers, search, typeFilter, statusFilter, dateFrom, dateTo]);

  const today = todayStr();
  const totalTransfers = transfers.length;
  const inTransit = transfers.filter(t => t.status === "in_transit").length;
  const pendingApproval = transfers.filter(t => t.status === "pending_approval").length;
  const completedToday = transfers.filter(t => t.status === "completed" && t.completedDate?.startsWith(today)).length;

  return (
    <PageShell
      title="Stock Transfers"
      subtitle="Manage inbound, outbound, and inter-location stock movements"
      actions={canCreate ? (
        <Button className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Transfer
        </Button>
      ) : undefined}
    >
      {/* Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Transfers" value={String(totalTransfers)} icon={ArrowLeftRight} accent="default" />
        <MetricCard label="In Transit" value={String(inTransit)} icon={Truck} accent="primary" />
        <MetricCard label="Pending Approval" value={String(pendingApproval)} icon={Clock} accent="warning" />
        <MetricCard label="Completed Today" value={String(completedToday)} icon={CheckCircle2} accent="success" />
      </div>

      {/* Quick-filter chips */}
      <div className="flex gap-2 flex-wrap mt-4">
        {[
          { label: "All Transfers", value: "all" },
          { label: "Supplier → WH (POs)", value: "supplier_to_warehouse" },
          { label: "WH → Branch", value: "warehouse_to_branch" },
          { label: "Branch → WH", value: "branch_to_warehouse" },
          { label: "Return to Supplier (RTS)", value: "warehouse_to_supplier" },
        ].map(chip => (
          <button
            key={chip.value}
            onClick={() => setTypeFilter(chip.value)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${typeFilter === chip.value ? "bg-primary text-primary-foreground border-primary" : "bg-background text-muted-foreground border-border/60 hover:border-primary/40"} ${chip.value === "warehouse_to_supplier" && typeFilter !== chip.value ? "border-warning/60 text-warning-foreground hover:bg-warning/10" : ""}`}
          >
            {chip.label}
            {chip.value === "warehouse_to_supplier" && <span className="ml-1 text-[10px] font-bold uppercase tracking-wide opacity-70">RTS</span>}
          </button>
        ))}
      </div>

      {typeFilter === "supplier_to_warehouse" ? (
        /* Supplier → WH chip shows Purchase Orders instead of transfer list */
        <div className="mt-4">
          <PurchaseOrdersTab />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Filter Bar */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by transfer #, source, or destination…"
                className="pl-9 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-56 h-9">
                <SelectValue placeholder="All Transfer Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                {TRANSFER_TYPES.filter(t => t.value !== "supplier_to_warehouse").map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-44 h-9">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map(s => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-1">
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

          {/* Table */}
          <Card className="border-border/60 shadow-card">
            <div className="overflow-x-auto">
              {loading ? (
                <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading transfers…</span>
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-20 text-center text-sm text-muted-foreground">
                  {transfers.length === 0 ? "No stock transfers yet. Create your first one." : "No transfers match your filters."}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/60 bg-muted/30">
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transfer #</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Source</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Destination</th>
                      <th className="text-center py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Items</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date</th>
                      <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(t => {
                      const total = (t.items ?? []).reduce((s, i) => s + i.requestedQuantity * (i.unitCost ?? 0), 0);
                      return (
                        <tr key={t.id} className="border-b border-border/40 hover:bg-muted/20 transition-colors">
                          <td className="py-3 px-4">
                            <span className="font-mono text-xs font-semibold">{t.transferNumber}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-muted-foreground">{getTypeLabel(t.transferType)}</span>
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm">{getSourceLabel(t)}</span>
                            {needsReturnReason(t.transferType) && t.returnReason && (
                              <Badge variant="outline" className="ml-1.5 text-[10px] capitalize">
                                {t.returnReason.replace(/_/g, " ")}
                              </Badge>
                            )}
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-sm">{getDestLabel(t)}</span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className="text-sm font-medium">{t.items?.length ?? 0}</span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            {total > 0
                              ? <span className="flex items-center gap-0.5 justify-end font-semibold text-sm"><SARIcon />{total.toFixed(2)}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="py-3 px-4">
                            <StatusBadge status={t.status} />
                          </td>
                          <td className="py-3 px-4">
                            <span className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</span>
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-2">
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setViewTransfer(t)}>
                                <Eye className="h-3.5 w-3.5" />
                              </Button>
                              <RowStatusAction transfer={t} onAction={handleStatusAction} onReceive={setReceiveTarget} canApprove={canApprove} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </Card>
        </div>
      )}

      <CreateTransferSheet
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        branches={branches}
        warehouses={warehouses}
        suppliers={suppliers}
        products={products}
        onCreated={load}
      />

      <ViewTransferSheet
        transfer={viewTransfer}
        onClose={() => setViewTransfer(null)}
        onStatusUpdate={() => { load(); setViewTransfer(null); }}
        canApprove={canApprove}
      />

      <ReceiveItemsSheet
        transfer={receiveTarget}
        open={!!receiveTarget}
        onOpenChange={v => { if (!v) setReceiveTarget(null); }}
        onReceived={() => { setReceiveTarget(null); load(); }}
      />
    </PageShell>
  );
}
