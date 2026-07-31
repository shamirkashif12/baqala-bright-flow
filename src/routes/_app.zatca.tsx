import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { ShieldCheck, RefreshCw, FileWarning, QrCode, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type ZatcaInvoice } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { BranchFilter } from "@/components/branch-filter";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { exportRowsAsCsv } from "@/lib/csv-export";
import { useCompanyHeader } from "@/lib/use-company-header";
import { localDateStr } from "@/lib/utils";

const ZATCA_STATUSES = ["accepted", "pending", "rejected"] as const;

export const Route = createFileRoute("/_app/zatca")({ component: Zatca });

function Zatca() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const isAdmin = user?.role === "tenant_admin";
  const lockedBranchId = !isAdmin ? (user?.branchId ?? null) : null;
  const [branchFilter, setBranchFilter] = useState(lockedBranchId ?? "all");
  useEffect(() => {
    if (lockedBranchId) setBranchFilter(lockedBranchId);
  }, [lockedBranchId]);
  const [invoices, setInvoices] = useState<ZatcaInvoice[]>([]);
  const [loading, setLoading] = useState(false);
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const companyHeader = useCompanyHeader();

  function load() {
    setLoading(true);
    api.getZatcaInvoices(branchFilter !== "all" ? { branchId: branchFilter } : undefined)
      .then(invoices => { setInvoices(invoices); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, [branchFilter]);

  // Auto-refresh instead of relying on a manual Refresh click — invoices get created/cleared by
  // background ZATCA submission independent of anyone sitting on this page watching it.
  useEffect(() => {
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [branchFilter]); // eslint-disable-line react-hooks/exhaustive-deps -- load() closes over branchFilter, re-created each render is fine here

  async function retrySubmit(id: string) {
    setSubmittingId(id);
    try {
      await api.submitZatcaInvoice(id);
      toast.success("Invoice submitted to ZATCA");
      load();
    } catch {
      toast.error("ZATCA submission failed");
    } finally {
      setSubmittingId(null);
    }
  }

  const filtered = useMemo(() => invoices.filter(i => {
    const q = search.trim().toLowerCase();
    // Match against whatever the Invoice column actually displays (invoiceNumber, falling back
    // to the id prefix) — searching for exactly what's on screen must always find it, even for
    // rows with no invoiceNumber assigned yet.
    const displayNumber = (i.invoiceNumber || i.id.slice(0, 8)).toLowerCase();
    const matchesSearch = !q
      || displayNumber.includes(q)
      || i.id.toLowerCase().includes(q)
      || i.buyerVatNumber?.toLowerCase().includes(q)
      || i.branch?.name?.toLowerCase().includes(q);
    const matchesStatus = statusFilter.length === 0 || statusFilter.includes(i.zatcaStatus);
    return matchesSearch && matchesStatus;
  }), [invoices, search, statusFilter]);

  function toggleStatusFilter(status: string) {
    setStatusFilter(prev => prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]);
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter([]);
    if (!lockedBranchId) setBranchFilter("all");
  }
  const hasFilters = !!search || statusFilter.length > 0 || (!lockedBranchId && branchFilter !== "all");

  function handleExport() {
    exportRowsAsCsv(
      ["Invoice", "Date", "Branch", "Type", "VAT", "Total", "Status"],
      filtered.map(i => [i.invoiceNumber || i.id.slice(0, 8), new Date(i.issueDate).toLocaleString(), i.branch?.name ?? "—", i.invoiceType, i.taxAmount.toFixed(2), i.totalAmount.toFixed(2), i.zatcaStatus]),
      `zatca-invoices-${localDateStr(new Date())}.csv`,
      companyHeader
    );
  }

  const clearedCount = invoices.filter(i => i.zatcaStatus === "accepted").length;
  const pendingCount = invoices.filter(i => i.zatcaStatus === "pending").length;
  const rejectedCount = invoices.filter(i => i.zatcaStatus === "rejected").length;

  return (
    <PageShell title="ZATCA Invoices" subtitle="VAT invoices · live sync · Arabic + English">
      {loadError && <LoadErrorBanner onRetry={load} />}
      <Card className="p-6 border-success/30 bg-success/5 shadow-card">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-success/15 text-success flex items-center justify-center">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2"><h3 className="font-semibold">ZATCA</h3><Badge className="bg-success text-success-foreground border-0">Connected</Badge></div>
            <p className="text-sm text-muted-foreground mt-0.5">Showing invoices reported/cleared for {branchFilter !== "all" ? (branches.find(b => b.id === branchFilter)?.name ?? "—") : "all branches"}</p>
          </div>
          {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
      </Card>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard label="Accepted" value={String(clearedCount)} icon={ShieldCheck} accent="success" />
        <MetricCard label="Pending" value={String(pendingCount)} icon={RefreshCw} accent="warning" />
        <MetricCard label="Rejected" value={String(rejectedCount)} icon={FileWarning} accent={rejectedCount > 0 ? "destructive" : "success"} />
        <MetricCard label="Total" value={String(invoices.length)} icon={QrCode} accent="primary" />
      </div>

      <Toolbar
        placeholder="Search invoice / CR / VAT…"
        value={search}
        onChange={e => setSearch(e.target.value)}
        onFilterClick={() => setShowFilters(v => !v)}
        filtersActive={statusFilter.length > 0}
        onExport={handleExport}
        extra={
          <>
            <BranchFilter branches={branches} value={branchFilter} onChange={setBranchFilter} locked={!!lockedBranchId} allowAll />
            {hasFilters && (
              <Button variant="ghost" size="sm" className="h-10 gap-1.5 text-xs" onClick={clearFilters}>
                <X className="h-3.5 w-3.5" /> Clear
              </Button>
            )}
          </>
        }
      />
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 -mt-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          {ZATCA_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => toggleStatusFilter(s)}
              className={`text-xs px-2.5 py-1 rounded-full border capitalize transition-colors ${
                statusFilter.includes(s) ? "bg-primary text-primary-foreground border-primary" : "border-border/60 text-muted-foreground hover:bg-muted/40"
              }`}
            >
              {s}
            </button>
          ))}
          {statusFilter.length > 0 && (
            <button onClick={() => setStatusFilter([])} className="text-xs text-primary hover:underline ml-1">Clear</button>
          )}
        </div>
      )}
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground p-6">No ZATCA invoices yet — they appear here once orders are submitted (requires Phase 2 to be enabled and onboarding complete for the branch).</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground p-6">No invoices match the current search/filters.</p>
      ) : (
        <DataTable
          columns={[
            { key: "invoiceNumber", label: "Invoice", render: (r) => <span className="font-mono font-semibold">{r.invoiceNumber || r.id.slice(0, 8)}</span> },
            { key: "issueDate", label: "Date", render: (r) => new Date(r.issueDate).toLocaleString() },
            { key: "branch", label: "Branch", render: (r) => r.branch?.name ?? "—" },
            { key: "invoiceType", label: "Type" },
            { key: "taxAmount", label: "VAT", render: (r) => `SAR ${r.taxAmount.toFixed(2)}` },
            { key: "totalAmount", label: "Total", render: (r) => <span className="font-semibold">SAR {r.totalAmount.toFixed(2)}</span> },
            { key: "zatcaStatus", label: "Status", render: (r) => <StatusBadge status={r.zatcaStatus} /> },
            {
              key: "_a", label: "", render: (r) => r.zatcaStatus !== "accepted" ? (
                <Button size="sm" variant="outline" className="h-7 gap-1" onClick={() => retrySubmit(r.id)} disabled={submittingId === r.id}>
                  {submittingId === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}Submit
                </Button>
              ) : null,
            },
          ]}
          rows={filtered}
        />
      )}
    </PageShell>
  );
}
