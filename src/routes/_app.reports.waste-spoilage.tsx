import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
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
import { api, type WasteSpoilageReport as WasteSpoilageData, type WasteSpoilageRow, type ReportExportFormat } from "@/lib/api";
import { useReportFilterOptions } from "@/lib/use-report-filters";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { downloadBlob } from "@/lib/csv-export";
import { toast } from "sonner";
import { Ban, AlertTriangle, Tag, Percent, Clock, CheckCircle2, XCircle, Eye } from "lucide-react";
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts";

export const Route = createFileRoute("/_app/reports/waste-spoilage")({ component: WasteSpoilage });

const REASON_COLORS: Record<string, string> = { waste: "var(--warning)", damage: "var(--destructive)" };

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function WasteSpoilage() {
  const { user, canViewModule } = useAuth();
  const { canExport } = usePermission("Reports");
  // Reviewing a write-off is a Stocks/Approve action, not a Reports one — the same permission the
  // PATCH endpoint enforces. Cashiers don't have it; managers/admins/storekeepers do, so the
  // Approve/Reject buttons only appear for them.
  const { canApprove } = usePermission("Stocks");
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;
  const { branches } = useBranch();
  const canViewCost = canViewModule("Accounting & Finance");

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchId, setBranchId] = useState(lockedBranchId ?? "all");
  const [reason, setReason] = useState("all");
  const [categoryId, setCategoryId] = useState("all");
  const [productId, setProductId] = useState("all");
  const [adjustedBy, setAdjustedBy] = useState("all");
  const [approvalStatus, setApprovalStatus] = useState("all");
  const [isTobacco, setIsTobacco] = useState(false);
  const [data, setData] = useState<WasteSpoilageData | null>(null);
  const [loading, setLoading] = useState(true);
  // The write-off currently open in the review dialog.
  const [review, setReview] = useState<WasteSpoilageRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { categories, products, employees: users } = useReportFilterOptions(branchId, categoryId);

  useEffect(() => { setAdjustedBy("all"); }, [branchId]);
  useEffect(() => {
    if (productId !== "all" && !products.some((p) => p.id === productId)) setProductId("all");
  }, [products, productId]);

  const filters = useMemo(() => ({
    branchId: branchId !== "all" ? branchId : undefined,
    reason: reason !== "all" ? reason : undefined,
    categoryId: categoryId !== "all" ? categoryId : undefined,
    productId: productId !== "all" ? productId : undefined,
    adjustedBy: adjustedBy !== "all" ? adjustedBy : undefined,
    approvalStatus: approvalStatus !== "all" ? approvalStatus : undefined,
    isTobacco: isTobacco || undefined,
  }), [branchId, reason, categoryId, productId, adjustedBy, approvalStatus, isTobacco]);

  const load = useCallback(() => {
    setLoading(true);
    api.getWasteSpoilageReport({ from, to, ...filters })
      .then(setData)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load report"))
      .finally(() => setLoading(false));
  }, [from, to, filters]);

  useEffect(() => { load(); }, [load]);

  // Inline approve straight from the row. Rejecting always goes through the dialog instead, because
  // the API requires a reason and there is nowhere in a table row to type one.
  const approveInline = async (row: WasteSpoilageRow) => {
    setSubmitting(true);
    try {
      await api.reviewAdjustment(row.adjustmentId, true);
      toast.success(`Write-off approved — ${row.productName}.`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setSubmitting(false);
    }
  };

  const submitReview = async (approved: boolean) => {
    if (!review) return;
    // The API rejects a reject with no reason; check here too so the user gets the message
    // against the field rather than as a server error toast.
    if (!approved && !rejectReason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      await api.reviewAdjustment(review.adjustmentId, approved, approved ? undefined : rejectReason.trim());
      toast.success(approved
        ? "Write-off approved."
        : "Write-off rejected — the stock has been returned.");
      setReview(null);
      setRejectReason("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit review");
    } finally {
      setSubmitting(false);
    }
  };

  const handleExport = async (format: ReportExportFormat) => {
    try {
      const blob = await api.exportWasteSpoilageReport({
        from, to, ...filters, exportedBy: user?.id, includeCost: canViewCost, format,
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
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
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
        <Select value={approvalStatus} onValueChange={setApprovalStatus}>
          <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Approval" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Approvals</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
        <label className="flex items-center gap-1.5 text-sm px-2">
          <Checkbox checked={isTobacco} onCheckedChange={(v) => setIsTobacco(v === true)} />
          Tobacco only
        </label>
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
            { key: "isTobacco", label: "Tobacco", render: (r: WasteSpoilageRow) => (r.isTobacco ? <Badge variant="outline" className="text-[10px]">Tobacco</Badge> : "—") },
            { key: "batchNumber", label: "Batch/Lot", render: (r: WasteSpoilageRow) => r.batchNumber ?? "—" },
            { key: "expiryDate", label: "Expiry Date", render: (r: WasteSpoilageRow) => r.expiryDate ? new Date(r.expiryDate).toLocaleDateString("en-SA") : "—" },
            { key: "qty", label: "Qty" },
            { key: "reason", label: "Reason", render: (r: WasteSpoilageRow) => <StatusBadge status={r.reason} /> },
            { key: "createdBy", label: "Created By" },
            { key: "approvedBy", label: "Approved By", render: (r: WasteSpoilageRow) => r.approvedBy ?? "—" },
            {
              key: "approvalStatus",
              label: "Approval",
              // A null status means this write-off predates the approval flow (or isn't a
              // reviewable type) — render a plain dash, not a "pending" badge that would put it
              // in a queue nobody can action.
              render: (r: WasteSpoilageRow) => !r.approvalStatus
                ? <span className="text-muted-foreground">—</span>
                : (
                  <button
                    type="button"
                    onClick={() => { setReview(r); setRejectReason(""); }}
                    className="cursor-pointer rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    title="View details"
                  >
                    <Badge
                      variant={r.approvalStatus === "approved" ? "outline" : r.approvalStatus === "rejected" ? "destructive" : "secondary"}
                      className="gap-1 text-[10px] capitalize"
                    >
                      {r.approvalStatus === "pending" && <Clock className="h-3 w-3" />}
                      {r.approvalStatus === "approved" && <CheckCircle2 className="h-3 w-3" />}
                      {r.approvalStatus === "rejected" && <XCircle className="h-3 w-3" />}
                      {r.approvalStatus}
                    </Badge>
                  </button>
                ),
            },
            ...(canViewCost ? [{ key: "costValue", label: "Cost Value", render: (r: WasteSpoilageRow) => <><SARIcon />{fmt(r.costValue)}</> }] : []),
            { key: "notes", label: "Notes", render: (r: WasteSpoilageRow) => r.notes ?? "—" },
            {
              key: "actions",
              label: "Actions",
              // Mirrors the Stock Transfers row actions: Approve/Reject appear inline only while a
              // write-off is pending AND only for a user who holds Stocks/Approve. Everyone else
              // gets the read-only Details button, so the column never implies an action they
              // cannot take.
              render: (r: WasteSpoilageRow) => {
                // Two people must look at a write-off for the approval to mean anything, so the API
                // refuses self-approval. Disable the buttons rather than let them 403.
                const isOwn = !!r.createdById && r.createdById === user?.id;
                return (
                <div className="flex items-center gap-1">
                  {r.approvalStatus === "pending" && canApprove ? (
                    <>
                      <Button
                        size="sm"
                        className="h-7 text-xs px-2 gradient-primary text-primary-foreground border-0"
                        disabled={submitting || isOwn}
                        title={isOwn ? "You raised this write-off — someone else must review it" : undefined}
                        onClick={() => approveInline(r)}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2 border-destructive/50 text-destructive"
                        disabled={submitting || isOwn}
                        title={isOwn ? "You raised this write-off — someone else must review it" : undefined}
                        onClick={() => { setReview(r); setRejectReason(""); }}
                      >
                        Reject
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setReview(r); setRejectReason(""); }}>
                      <Eye className="h-3 w-3 mr-1" /> Details
                    </Button>
                  )}
                </div>
                );
              },
            },
          ]}
          rows={data?.rows ?? []}
        />
      )}

      <Dialog open={!!review} onOpenChange={(o) => { if (!o) { setReview(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Write-off details</DialogTitle>
          </DialogHeader>
          {review && (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <Detail label="Product" value={`${review.productName} (${review.sku})`} />
                <Detail label="Branch" value={review.branch} />
                <Detail label="Quantity" value={String(review.qty)} />
                <Detail label="Reason" value={review.reason} />
                <Detail label="Batch/Lot" value={review.batchNumber ?? "—"} />
                <Detail label="Date/Time" value={new Date(review.dateTime).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" })} />
                <Detail label="Created by" value={review.createdBy} />
                <Detail label="Approved by" value={review.approvedBy ?? "—"} />
                {canViewCost && <Detail label="Cost value" value={`SAR ${fmt(review.costValue)}`} />}
                <Detail label="Status" value={review.approvalStatus ?? "—"} />
              </dl>

              {review.notes && (
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">Note</p>
                  <p>{review.notes}</p>
                </div>
              )}

              {review.approvalStatus === "rejected" && review.rejectionReason && (
                <div className="text-sm">
                  <p className="text-muted-foreground text-xs">Rejection reason</p>
                  <p>{review.rejectionReason}</p>
                </div>
              )}

              {review.approvalStatus === "pending" ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="reject-reason" className="text-xs">Rejection reason</Label>
                    <Textarea
                      id="reject-reason"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="Required only when rejecting"
                      rows={2}
                    />
                  </div>
                  {/* Rejecting reverses the stock, so say so before they click rather than after. */}
                  <p className="text-muted-foreground text-xs">
                    Rejecting returns {review.qty} unit(s) to stock via a reversing adjustment. The
                    original write-off stays on record.
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground text-xs">
                  This write-off has already been reviewed and cannot be changed.
                </p>
              )}
            </div>
          )}
          {review?.approvalStatus === "pending" && canApprove && (
            review.createdById && review.createdById === user?.id ? (
              <p className="text-xs text-warning">
                You raised this write-off, so you cannot review it yourself — someone else must approve or reject it.
              </p>
            ) : (
              <DialogFooter>
                <Button variant="destructive" disabled={submitting} onClick={() => submitReview(false)}>
                  Reject
                </Button>
                <Button disabled={submitting} onClick={() => submitReview(true)}>
                  Approve
                </Button>
              </DialogFooter>
            )
          )}
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="capitalize">{value}</dd>
    </div>
  );
}
