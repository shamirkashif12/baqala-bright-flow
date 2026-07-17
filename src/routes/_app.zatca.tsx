import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { MetricCard } from "@/components/metric-card";
import { DataTable, Toolbar, StatusBadge } from "@/components/module-placeholder";
import { ShieldCheck, RefreshCw, FileWarning, QrCode, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api, type ZatcaInvoice } from "@/lib/api";
import { useBranch } from "@/lib/branch-context";
import { BranchFilter } from "@/components/branch-filter";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { LoadErrorBanner } from "@/components/load-error-banner";

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

  function load() {
    setLoading(true);
    api.getZatcaInvoices(branchFilter !== "all" ? { branchId: branchFilter } : undefined)
      .then(invoices => { setInvoices(invoices); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }

  useEffect(load, [branchFilter]);

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
          <BranchFilter branches={branches} value={branchFilter} onChange={setBranchFilter} locked={!!lockedBranchId} allowAll />
          <Button variant="outline" className="gap-2" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Refresh
          </Button>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Accepted" value={String(clearedCount)} icon={ShieldCheck} accent="success" />
        <MetricCard label="Pending" value={String(pendingCount)} icon={RefreshCw} accent="warning" />
        <MetricCard label="Rejected" value={String(rejectedCount)} icon={FileWarning} accent={rejectedCount > 0 ? "destructive" : "success"} />
        <MetricCard label="Total" value={String(invoices.length)} icon={QrCode} accent="primary" />
      </div>

      <Toolbar placeholder="Search invoice / CR / VAT…" primaryLabel="New Invoice" />
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground p-6"><Loader2 className="h-4 w-4 animate-spin" /> Loading invoices…</div>
      ) : invoices.length === 0 ? (
        <p className="text-sm text-muted-foreground p-6">No ZATCA invoices yet — they appear here once orders are submitted (requires Phase 2 to be enabled and onboarding complete for the branch).</p>
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
          rows={invoices}
        />
      )}
    </PageShell>
  );
}
