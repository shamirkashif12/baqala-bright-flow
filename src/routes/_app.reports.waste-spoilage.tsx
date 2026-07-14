import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, StatusBadge } from "@/components/module-placeholder";
import { ReportExportButton } from "@/components/report-export-button";
import { usePermission } from "@/lib/use-permission";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { api, type WasteSpoilageReport as WasteSpoilageData, type WasteSpoilageRow, type ReportExportFormat, type Product, type User } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Ban, AlertTriangle, Tag, Percent } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/waste-spoilage")({ component: WasteSpoilage });

const REASON_COLORS: Record<string, string> = { waste: "var(--warning)", damage: "var(--destructive)" };

function firstOfMonthStr() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function WasteSpoilage() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();
  const canViewCost = canViewModule("Accounting & Finance");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [reason, setReason] = useState("all");
  const [productId, setProductId] = useState("all");
  const [adjustedBy, setAdjustedBy] = useState("all");
  const [products, setProducts] = useState<Product[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [data, setData] = useState<WasteSpoilageData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { api.getProducts().then(setProducts).catch(() => {}); }, []);
  useEffect(() => { api.getUsers({ branchId: branchId !== "all" ? branchId : undefined }).then(setUsers).catch(() => {}); }, [branchId]);

  const load = useCallback(() => {
    setLoading(true);
    api.getWasteSpoilageReport({
      from, to, branchId: branchId !== "all" ? branchId : undefined, reason: reason !== "all" ? reason : undefined,
      productId: productId !== "all" ? productId : undefined, adjustedBy: adjustedBy !== "all" ? adjustedBy : undefined,
    })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, branchId, reason, productId, adjustedBy]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportWasteSpoilageReport({
        from, to, branchId: branchId !== "all" ? branchId : undefined, reason: reason !== "all" ? reason : undefined,
        productId: productId !== "all" ? productId : undefined, adjustedBy: adjustedBy !== "all" ? adjustedBy : undefined,
        exportedBy: user?.id, includeCost: canViewCost, format,
      });
      downloadBlob(blob, `waste-spoilage-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const reasonCounts = ["waste", "damage"].map((r) => ({
    reason: r, count: (data?.rows ?? []).filter((row) => row.reason === r).length,
  })).filter((r) => r.count > 0);

  return (
    <PageShell title="Waste / Spoilage Report" subtitle="Expired, damaged and written-off stock">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        {!lockedBranchId && (
          <Select value={branchId} onValueChange={setBranchId}>
            <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Branches" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Reason" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Reasons</SelectItem>
            <SelectItem value="waste">Waste</SelectItem>
            <SelectItem value="damage">Damage</SelectItem>
          </SelectContent>
        </Select>
        <Select value={productId} onValueChange={setProductId}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Product" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Products</SelectItem>
            {products.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={adjustedBy} onValueChange={setAdjustedBy}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {canViewCost && <MetricCard label="Total Write-off Value" value={<><SARIcon />{fmt(kpis?.totalWriteOffValue ?? 0)}</>} icon={Ban} accent="destructive" />}
        <MetricCard label="Expired Items" value={String(kpis?.expiredItems ?? 0)} icon={AlertTriangle} accent="warning" />
        <MetricCard label="Damaged Items" value={String(kpis?.damagedItems ?? 0)} icon={Ban} accent="destructive" />
        <MetricCard label="Top Waste Category" value={kpis?.topWasteCategory ?? "—"} icon={Tag} />
        {canViewCost && <MetricCard label="Waste % of Sales" value={`${kpis?.wastePctOfSales ?? 0}%`} icon={Percent} accent="warning" />}
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Waste by Reason</h3>
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={reasonCounts} dataKey="count" nameKey="reason" innerRadius={55} outerRadius={85} paddingAngle={2}>
              {reasonCounts.map((r) => <Cell key={r.reason} fill={REASON_COLORS[r.reason]} />)}
            </Pie>
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </Card>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "wasteId", label: "Waste ID" },
            { key: "dateTime", label: "Date/Time", render: (r: WasteSpoilageRow) => new Date(r.dateTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "sku", label: "SKU" },
            { key: "productName", label: "Product" },
            { key: "category", label: "Category" },
            { key: "branch", label: "Branch" },
            { key: "batchNumber", label: "Batch/Lot", render: (r: WasteSpoilageRow) => r.batchNumber ?? "—" },
            { key: "expiryDate", label: "Expiry Date", render: (r: WasteSpoilageRow) => r.expiryDate ? new Date(r.expiryDate).toLocaleDateString("en-SA") : "—" },
            { key: "qty", label: "Qty" },
            { key: "reason", label: "Reason", render: (r: WasteSpoilageRow) => <StatusBadge status={r.reason} /> },
            ...(canViewCost ? [{ key: "costValue", label: "Cost Value", render: (r: WasteSpoilageRow) => <><SARIcon />{fmt(r.costValue)}</> }] : []),
            { key: "notes", label: "Notes", render: (r: WasteSpoilageRow) => r.notes ?? "—" },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
