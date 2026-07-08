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
import { api, type AttendanceShiftReport as AttendanceShiftData, type AttendanceShiftRow, type ReportExportFormat, type Terminal, type User, type Role } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { DoorOpen, DoorClosed, Wallet, Clock3, AlertTriangle } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/reports/attendance-shift")({ component: AttendanceShift });

const STATUS_COLORS: Record<string, string> = { open: "var(--warning)", closed: "var(--success)" };
const VARIANCE_THRESHOLD = 50;

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function AttendanceShift() {
  const { user } = useAuth();
  const { canExport } = usePermission("Reports");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();

  const [from, setFrom] = useState(todayStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [status, setStatus] = useState("all");
  const [staffId, setStaffId] = useState("all");
  const [roleId, setRoleId] = useState("all");
  const [terminalId, setTerminalId] = useState("all");
  const [varianceThreshold, setVarianceThreshold] = useState("");
  const [staff, setStaff] = useState<User[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [terminals, setTerminals] = useState<Terminal[]>([]);
  const [data, setData] = useState<AttendanceShiftData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getUsers({ branchId: branchId !== "all" ? branchId : undefined }).then((u) => setStaff(u.filter((x) => x.status === "active"))).catch(() => {});
    api.getTerminals({ branchId: branchId !== "all" ? branchId : undefined }).then(setTerminals).catch(() => {});
    setStaffId("all");
    setTerminalId("all");
  }, [branchId]);

  useEffect(() => { api.getRoles().then(setRoles).catch(() => {}); }, []);

  const filterParams = {
    from, to, branchId: branchId !== "all" ? branchId : undefined,
    status: status !== "all" ? status : undefined,
    staffId: staffId !== "all" ? staffId : undefined,
    roleId: roleId !== "all" ? roleId : undefined,
    terminalId: terminalId !== "all" ? terminalId : undefined,
    varianceThreshold: varianceThreshold ? Number(varianceThreshold) : undefined,
  };

  const load = useCallback(() => {
    setLoading(true);
    api.getAttendanceShiftReport(filterParams)
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, to, branchId, status, staffId, roleId, terminalId, varianceThreshold]);

  useEffect(() => { load(); }, [load]);

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportAttendanceShiftReport({ ...filterParams, exportedBy: user?.id, format });
      downloadBlob(blob, `attendance-shift-${from}-to-${to}.${format}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    }
  };

  const kpis = data?.kpis;
  const fmt = (n: number) => fmtSAR(n);
  const statusCounts = ["open", "closed"].map((s) => ({
    status: s, count: (data?.rows ?? []).filter((r) => r.status === s).length,
  })).filter((s) => s.count > 0);
  const isHighVariance = (r: AttendanceShiftRow) => Math.abs(r.variance ?? 0) > VARIANCE_THRESHOLD;

  return (
    <PageShell title="Attendance / Shift Report" subtitle="Cashier shift status, cash variance and staff hours">
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
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Shift Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={staffId} onValueChange={setStaffId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Staff" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Staff</SelectItem>
            {staff.map((s) => <SelectItem key={s.id} value={s.id}>{s.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={roleId} onValueChange={setRoleId}>
          <SelectTrigger className="h-9 w-36"><SelectValue placeholder="Role" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            {roles.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={terminalId} onValueChange={setTerminalId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Terminal" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Terminals</SelectItem>
            {terminals.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Input
          type="number" placeholder="Min variance (SAR)" value={varianceThreshold}
          onChange={(e) => setVarianceThreshold(e.target.value)} className="h-9 w-40"
        />
        <div className="ml-auto"><ReportExportButton onExport={handleExport} disabled={!canExport} /></div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <MetricCard label="Open Shifts" value={String(kpis?.openShifts ?? 0)} icon={DoorOpen} accent="warning" />
        <MetricCard label="Closed Shifts" value={String(kpis?.closedShifts ?? 0)} icon={DoorClosed} accent="success" />
        <MetricCard label="Cash Variance" value={<><SARIcon />{fmt(kpis?.cashVariance ?? 0)}</>} icon={Wallet} accent={Math.abs(kpis?.cashVariance ?? 0) > VARIANCE_THRESHOLD ? "destructive" : "default"} />
        <MetricCard label="Total Staff Hours" value={String(kpis?.totalStaffHours ?? 0)} icon={Clock3} />
        <MetricCard label="Missing Closures" value={String(kpis?.missingClosures ?? 0)} icon={AlertTriangle} accent="destructive" />
      </div>

      <Card className="p-6 border-border/60 shadow-card">
        <h3 className="font-semibold mb-4">Shift Status</h3>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie data={statusCounts} dataKey="count" nameKey="status" innerRadius={50} outerRadius={80} paddingAngle={2}>
              {statusCounts.map((s) => <Cell key={s.status} fill={STATUS_COLORS[s.status]} />)}
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
            { key: "staffName", label: "Staff Name" },
            { key: "role", label: "Role" },
            { key: "branch", label: "Branch" },
            { key: "terminal", label: "Terminal" },
            { key: "checkInTime", label: "Check-in", render: (r: AttendanceShiftRow) => (r.checkInTime ? new Date(r.checkInTime).toLocaleTimeString("en-SA", { hour: "2-digit", minute: "2-digit" }) : "—") },
            { key: "shiftOpenTime", label: "Shift Open", render: (r: AttendanceShiftRow) => new Date(r.shiftOpenTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            { key: "shiftCloseTime", label: "Shift Close", render: (r: AttendanceShiftRow) => (r.shiftCloseTime ? new Date(r.shiftCloseTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) : "Open") },
            { key: "hoursWorked", label: "Hours Worked" },
            { key: "openingFloat", label: "Opening Float", render: (r: AttendanceShiftRow) => <><SARIcon />{fmt(r.openingFloat)}</> },
            { key: "expectedCash", label: "Expected Cash", render: (r: AttendanceShiftRow) => <><SARIcon />{fmt(r.expectedCash)}</> },
            { key: "countedCash", label: "Counted Cash", render: (r: AttendanceShiftRow) => (r.countedCash != null ? <><SARIcon />{fmt(r.countedCash)}</> : "—") },
            { key: "variance", label: "Variance", render: (r: AttendanceShiftRow) => (r.variance != null ? <span className={cn("font-semibold", isHighVariance(r) && "text-destructive")}><SARIcon />{fmt(r.variance)}</span> : "—") },
            { key: "status", label: "Status", render: (r: AttendanceShiftRow) => <StatusBadge status={r.status} /> },
          ]}
          rows={data?.rows ?? []}
        />
      )}
    </PageShell>
  );
}
