import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StatusBadge } from "@/components/module-placeholder";
import { Eye, Play, Plus, Download, Lock, Ban } from "lucide-react";
import { toast } from "sonner";
import { api, type PayrollRun, type PayrollRunDetail } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { usePermission } from "@/lib/use-permission";
import { localDateStr } from "@/lib/utils";
import { exportRowsAsCsv } from "@/lib/csv-export";
import { useCompanyHeader } from "@/lib/use-company-header";

export const Route = createFileRoute("/_app/payroll")({ component: Payroll });

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}

function money(v?: number | null): string {
  return v == null ? "—" : `SAR ${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function CreateRunFields({ branches, onSave, saving, branchLocked, defaultBranchId }: {
  branches: { id: string; name: string }[]; onSave: (branchId: string, year: number, month: number, payDate: string) => void; saving: boolean;
  branchLocked: boolean; defaultBranchId?: string;
}) {
  const now = new Date();
  const [branchId, setBranchId] = useState(defaultBranchId ?? "");
  const [year, setYear] = useState(String(now.getFullYear()));
  const [month, setMonth] = useState(String(now.getMonth() + 1));
  const [payDate, setPayDate] = useState("");

  return (
    <div className="mt-4 space-y-3">
      <FieldRow label="Branch">
        <Select value={branchId} onValueChange={setBranchId} disabled={branchLocked}>
          <SelectTrigger className="h-9"><SelectValue placeholder="Select branch" /></SelectTrigger>
          <SelectContent>{branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
        </Select>
      </FieldRow>
      <div className="grid grid-cols-2 gap-3">
        <FieldRow label="Year"><Input type="number" value={year} onChange={e => setYear(e.target.value)} className="h-9" /></FieldRow>
        <FieldRow label="Month">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </FieldRow>
      </div>
      <FieldRow label="Pay Date"><Input type="date" value={payDate} onChange={e => setPayDate(e.target.value)} className="h-9" /></FieldRow>
      <Button className="w-full gradient-primary text-primary-foreground border-0" disabled={!branchId || !payDate || saving} onClick={() => onSave(branchId, Number(year), Number(month), payDate)}>
        {saving ? "Creating…" : "Create Draft Run"}
      </Button>
    </div>
  );
}

function PayrollRunDrawer({ runId, onClose }: { runId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<PayrollRunDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const companyHeader = useCompanyHeader();

  useEffect(() => {
    if (!runId) { setDetail(null); return; }
    setLoading(true);
    api.getPayrollRun(runId).then(setDetail).catch(() => {}).finally(() => setLoading(false));
  }, [runId]);

  return (
    <Sheet open={!!runId} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[520px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center justify-between gap-2">
            <SheetTitle>Payroll Run Details</SheetTitle>
            {detail && detail.employees.length > 0 && (
              <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => exportRowsAsCsv(
                ["Employee", "Employee ID", "Basic Salary", "Gross Earnings", "Total Deductions", "Net Payable"],
                detail.employees.map(e => [e.employee?.fullName ?? "", e.employee?.employeeCode ?? "", e.basicSalary ?? "Masked", e.grossEarnings ?? "Masked", e.totalDeductions ?? "Masked", e.netPayable ?? "Masked"]),
                `payroll-run-${detail.year}-${detail.month}-${detail.branch?.name ?? ""}.csv`,
                companyHeader
              )}>
                <Download className="h-3.5 w-3.5" /> Export
              </Button>
            )}
          </div>
        </SheetHeader>
        {loading ? (
          <div className="mt-4 space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : detail ? (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div><span className="text-muted-foreground">Branch</span><p className="font-medium">{detail.branch?.name}</p></div>
              <div><span className="text-muted-foreground">Month</span><p className="font-medium">{MONTH_NAMES[detail.month - 1]} {detail.year}</p></div>
              <div><span className="text-muted-foreground">Pay Date</span><p className="font-medium">{detail.payDate}</p></div>
              <div><span className="text-muted-foreground">Status</span><StatusBadge status={detail.status} /></div>
              <div><span className="text-muted-foreground">Employees</span><p className="font-medium">{detail.employeeCount}</p></div>
              <div><span className="text-muted-foreground">Total</span><p className="font-medium">{money(detail.totalAmount)}</p></div>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">Employees</p>
              <div className="space-y-1.5">
                {detail.employees.map(e => (
                  <div key={e.id} className="flex items-center justify-between text-sm border-b border-border/40 pb-1.5">
                    <div>
                      <span className="font-medium">{e.employee?.fullName}</span>
                      <span className="text-muted-foreground text-xs"> · {e.employee?.employeeCode}</span>
                    </div>
                    <span className="font-semibold">{money(e.netPayable)}</span>
                  </div>
                ))}
                {detail.employees.length === 0 && <p className="text-xs text-muted-foreground">Not processed yet — no employee rows.</p>}
              </div>
            </div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function PayrollTab() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const { canCreate, canApprove } = usePermission("Payroll");
  const branchLocked = user?.role !== "tenant_admin";
  const companyHeader = useCompanyHeader();

  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [branchFilter, setBranchFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [monthFilter, setMonthFilter] = useState("all");
  const [yearFilter, setYearFilter] = useState("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [viewRunId, setViewRunId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api.getPayrollRuns()
      .then(r => { setRuns(r); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const handleCreate = async (branchId: string, year: number, month: number, payDate: string) => {
    setSaving(true);
    try {
      await api.createPayrollRun({ branchId, year, month, payDate });
      setCreateOpen(false);
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to create payroll run.");
    } finally {
      setSaving(false);
    }
  };

  const handleProcess = async (run: PayrollRun) => {
    if (!confirm(`Process payroll for ${MONTH_NAMES[run.month - 1]} ${run.year}? This locks in the numbers.`)) return;
    setProcessingId(run.id);
    try {
      await api.processPayrollRun(run.id);
      toast.success("Payroll run processed.");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to process payroll run.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleLock = async (run: PayrollRun) => {
    if (!confirm(`Lock payroll for ${MONTH_NAMES[run.month - 1]} ${run.year}? No further changes will be possible.`)) return;
    setProcessingId(run.id);
    try {
      await api.lockPayrollRun(run.id);
      toast.success("Payroll run locked.");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to lock payroll run.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancel = async (run: PayrollRun) => {
    if (!confirm(`Cancel payroll for ${MONTH_NAMES[run.month - 1]} ${run.year}?`)) return;
    setProcessingId(run.id);
    try {
      await api.cancelPayrollRun(run.id);
      toast.success("Payroll run cancelled.");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Failed to cancel payroll run.");
    } finally {
      setProcessingId(null);
    }
  };

  const years = Array.from(new Set(runs.map(r => r.year))).sort((a, b) => b - a);

  const filtered = runs.filter(r => {
    const mb = branchFilter === "all" || r.branchId === branchFilter;
    const ms = statusFilter === "all" || r.status === statusFilter;
    const mm = monthFilter === "all" || r.month === Number(monthFilter);
    const my = yearFilter === "all" || r.year === Number(yearFilter);
    return mb && ms && mm && my;
  });

  const handleExport = () => {
    exportRowsAsCsv(
      ["Payroll Month", "Branch", "Pay Date", "Employees", "Status", "Total Amount"],
      filtered.map(r => [`${MONTH_NAMES[r.month - 1]} ${r.year}`, r.branch?.name ?? "", r.payDate, r.employeeCount, r.status, r.totalAmount ?? "Masked"]),
      `payroll-runs-${localDateStr()}.csv`,
      companyHeader
    );
  };

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}

      <div className="flex flex-wrap items-center gap-2">
        {!branchLocked && (
          <Select value={branchFilter} onValueChange={setBranchFilter}>
            <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Branches</SelectItem>
              {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="Draft">Draft</SelectItem>
            <SelectItem value="Processed">Processed</SelectItem>
            <SelectItem value="Locked">Locked</SelectItem>
            <SelectItem value="Cancelled">Cancelled</SelectItem>
          </SelectContent>
        </Select>
        <Select value={monthFilter} onValueChange={setMonthFilter}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Months</SelectItem>
            {MONTH_NAMES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex-1" />
        <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={handleExport}>
          <Download className="h-4 w-4" /> Export
        </Button>
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5 h-9" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> Create Payroll Run
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
                  <th className="px-3 py-3 font-semibold">Payroll Month</th>
                  <th className="px-3 py-3 font-semibold">Branch</th>
                  <th className="px-3 py-3 font-semibold">Pay Date</th>
                  <th className="px-3 py-3 font-semibold">Employees</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Total Amount</th>
                  <th className="px-3 py-3 font-semibold"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                    <td className="px-3 py-3 font-semibold">{MONTH_NAMES[r.month - 1]} {r.year}</td>
                    <td className="px-3 py-3 text-xs">{r.branch?.name ?? "—"}</td>
                    <td className="px-3 py-3 text-xs">{r.payDate}</td>
                    <td className="px-3 py-3 text-xs">{r.employeeCount}</td>
                    <td className="px-3 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-3 py-3 text-xs font-medium">{money(r.totalAmount)}</td>
                    <td className="px-3 py-3">
                      <div className="flex gap-1 justify-end">
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setViewRunId(r.id)}><Eye className="h-3.5 w-3.5" /></Button>
                        {canApprove && r.status === "Draft" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-success" title="Process" disabled={processingId === r.id} onClick={() => handleProcess(r)}>
                            <Play className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canApprove && r.status === "Processed" && (
                          <Button size="icon" variant="ghost" className="h-7 w-7" title="Lock" disabled={processingId === r.id} onClick={() => handleLock(r)}>
                            <Lock className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {canApprove && (r.status === "Draft" || r.status === "Processed") && (
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" title="Cancel" disabled={processingId === r.id} onClick={() => handleCancel(r)}>
                            <Ban className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-10 text-muted-foreground text-sm">No payroll runs found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Sheet open={createOpen} onOpenChange={setCreateOpen}>
        <SheetContent>
          <SheetHeader><SheetTitle>Create Payroll Run</SheetTitle></SheetHeader>
          <CreateRunFields branches={branches} onSave={handleCreate} saving={saving} branchLocked={branchLocked} defaultBranchId={branchLocked ? (user?.branchId ?? undefined) : undefined} />
        </SheetContent>
      </Sheet>

      <PayrollRunDrawer runId={viewRunId} onClose={() => setViewRunId(null)} />
    </div>
  );
}

function Payroll() {
  return (
    <PageShell title="Payroll" subtitle="Payroll runs and employee salary components" breadcrumb={["Human Resources", "Payroll"]}>
      <PayrollTab />
    </PageShell>
  );
}
