import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable } from "@/components/module-placeholder";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePermission } from "@/lib/use-permission";
import { useBranch } from "@/lib/branch-context";
import { useAuth } from "@/lib/auth";
import { api, type ApprovalRow } from "@/lib/api";
import { toast } from "sonner";
import { Clock, CheckCircle2, XCircle } from "lucide-react";

export const Route = createFileRoute("/_app/reports/approval-center")({ component: ApprovalCenter });

const REQUEST_TYPE_LABELS: Record<string, string> = {
  discount: "Discount",
  order_cancellation: "Order Cancellation",
  item_deletion: "Item Deletion",
  refund_return: "Refund / Return",
  stock_count: "Stock Count",
  stock_transfer: "Stock Transfer",
  wastage_adjustment: "Wastage / Write-off",
};

function firstOfMonthStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// A row's approve/reject click must land on the endpoint that actually owns its lifecycle — the
// three new request types funnel through the generic decision endpoint, while the four
// pre-existing flows keep using their own stable, already-shipped endpoints.
async function decide(row: ApprovalRow, approved: boolean, reason?: string): Promise<void> {
  switch (row.sourceType) {
    case "approval_request":
      await api.decideApproval(row.id, approved, reason);
      return;
    case "return":
      await api.approveReturn(row.id, approved);
      return;
    case "stock_count":
      // A stock count clears review, then approval — either stage can still be pending here.
      if (row.status === "pending_review") await api.reviewStockCount(row.id, { approved, reason });
      else await api.approveStockCount(row.id, { approved, reason });
      return;
    case "stock_transfer":
      await api.updateTransferStatus(row.id, approved ? "approved" : "rejected");
      return;
    case "wastage_adjustment":
      await api.reviewAdjustment(row.id, approved, reason);
      return;
  }
}

function ApprovalCenter() {
  const { user } = useAuth();
  const { branches } = useBranch();
  const lockedBranchId = user?.role !== "tenant_admin" ? (user?.branchId ?? null) : null;

  // The row's own module gates whether this user may act on it — mirrors how the Waste/Spoilage
  // report only shows Approve/Reject to holders of Stocks:Approve.
  const modulePerms = {
    Coupons: usePermission("Coupons").canApprove,
    Orders: usePermission("Orders").canApprove,
    Inventory: usePermission("Inventory").canApprove,
    Returns: usePermission("Returns").canApprove,
    Stocks: usePermission("Stocks").canApprove,
    "Stock Transfers": usePermission("Stock Transfers").canApprove,
  };
  const moduleForRequestType: Record<string, keyof typeof modulePerms> = {
    discount: "Coupons",
    order_cancellation: "Orders",
    item_deletion: "Inventory",
    refund_return: "Returns",
    stock_count: "Stocks",
    stock_transfer: "Stock Transfers",
    wastage_adjustment: "Stocks",
  };
  const canActOn = (row: ApprovalRow) => modulePerms[moduleForRequestType[row.requestType]] ?? false;

  const [from, setFrom] = useState(firstOfMonthStr());
  const [to, setTo] = useState(todayStr());
  const [branchIds, setBranchIds] = useState<string[]>(lockedBranchId ? [lockedBranchId] : []);
  const [statuses, setStatuses] = useState<string[]>(["pending"]);
  const [types, setTypes] = useState<string[]>([]);
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [review, setReview] = useState<ApprovalRow | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;

  const load = useCallback(() => {
    setLoading(true);
    api.getApprovals({
      branchId: scopedBranchId,
      status: statuses.length === 1 ? statuses[0] : undefined,
      type: types.length === 1 ? types[0] : undefined,
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`,
    })
      .then((data) => {
        // Client-side narrows the rest — the API only takes a single status/type value, this
        // page lets a manager multi-select either filter.
        const filtered = data
          .filter((r) => statuses.length === 0 || statuses.includes(r.status))
          .filter((r) => types.length === 0 || types.includes(r.requestType));
        setRows(filtered);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load approvals"))
      .finally(() => setLoading(false));
  }, [scopedBranchId, statuses, types, from, to]);

  useEffect(() => { load(); }, [load]);

  const pendingCount = useMemo(() => rows.filter((r) => r.status === "pending" || r.status === "pending_review" || r.status === "pending_approval").length, [rows]);
  const approvedCount = useMemo(() => rows.filter((r) => r.status === "approved" || r.status === "completed").length, [rows]);
  const rejectedCount = useMemo(() => rows.filter((r) => r.status === "rejected").length, [rows]);

  const submitReview = async (approved: boolean) => {
    if (!review) return;
    if (!approved && !rejectReason.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }
    setSubmitting(true);
    try {
      await decide(review, approved, approved ? undefined : rejectReason.trim());
      toast.success(approved ? "Approved." : "Rejected.");
      setReview(null);
      setRejectReason("");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to submit decision");
    } finally {
      setSubmitting(false);
    }
  };

  const approveInline = async (row: ApprovalRow) => {
    setSubmitting(true);
    try {
      await decide(row, true);
      toast.success("Approved.");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to approve");
    } finally {
      setSubmitting(false);
    }
  };

  const isPending = (status: string) => status === "pending" || status === "pending_review" || status === "pending_approval";

  return (
    <PageShell title="Approval Center" subtitle="Every manager approval in one place — discounts, cancellations, deletions, refunds & more">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-40" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-40" />
        </div>
        {!lockedBranchId && (
          <div className="w-44">
            <SearchableMultiSelect
              placeholder="All Branches"
              options={branches.map((b) => ({ id: b.id, label: b.name }))}
              selected={branchIds}
              onChange={setBranchIds}
            />
          </div>
        )}
        <div className="w-44">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={[
              { id: "pending", label: "Pending" },
              { id: "pending_review", label: "Pending Review" },
              { id: "pending_approval", label: "Pending Approval" },
              { id: "approved", label: "Approved" },
              { id: "completed", label: "Completed" },
              { id: "rejected", label: "Rejected" },
            ]}
            selected={statuses}
            onChange={setStatuses}
          />
        </div>
        <div className="w-52">
          <SearchableMultiSelect
            placeholder="All Types"
            options={Object.entries(REQUEST_TYPE_LABELS).map(([id, label]) => ({ id, label }))}
            selected={types}
            onChange={setTypes}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard label="Pending" value={String(pendingCount)} icon={Clock} accent="warning" />
        <MetricCard label="Approved" value={String(approvedCount)} icon={CheckCircle2} accent="success" />
        <MetricCard label="Rejected" value={String(rejectedCount)} icon={XCircle} accent="destructive" />
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm py-4">Loading…</div>
      ) : (
        <PaginatedDataTable
          columns={[
            { key: "requestType", label: "Action", render: (r: ApprovalRow) => REQUEST_TYPE_LABELS[r.requestType] ?? r.requestType },
            { key: "entityLabel", label: "Details" },
            { key: "branchName", label: "Branch", render: (r: ApprovalRow) => r.branchName ?? "—" },
            { key: "requestedByName", label: "Requested By", render: (r: ApprovalRow) => r.requestedByName ?? "—" },
            { key: "requestedAt", label: "Requested At", render: (r: ApprovalRow) => new Date(r.requestedAt).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) },
            {
              key: "status", label: "Status",
              render: (r: ApprovalRow) => (
                <Badge variant={r.status === "rejected" ? "destructive" : isPending(r.status) ? "secondary" : "outline"} className="gap-1 text-[10px] capitalize">
                  {isPending(r.status) && <Clock className="h-3 w-3" />}
                  {(r.status === "approved" || r.status === "completed") && <CheckCircle2 className="h-3 w-3" />}
                  {r.status === "rejected" && <XCircle className="h-3 w-3" />}
                  {r.status.replace(/_/g, " ")}
                </Badge>
              ),
            },
            { key: "approvedByName", label: "Approved/Rejected By", render: (r: ApprovalRow) => r.approvedByName ?? "—" },
            { key: "actionAt", label: "Action At", render: (r: ApprovalRow) => r.actionAt ? new Date(r.actionAt).toLocaleString("en-SA", { dateStyle: "short", timeStyle: "short" }) : "—" },
            { key: "reason", label: "Reason", render: (r: ApprovalRow) => r.rejectionReason ?? r.reason ?? "—" },
            {
              key: "actions", label: "Actions",
              render: (r: ApprovalRow) => {
                // No "you raised this, someone else must review it" restriction — same as
                // Customer Returns, where a cashier can self-approve their own return under
                // the refund threshold. Whoever holds Approve on the module can decide any
                // request, including their own; the module permission check below (canActOn)
                // is the real gate, not who happens to be logged in.
                return isPending(r.status) && canActOn(r) ? (
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm" className="h-7 text-xs px-2 gradient-primary text-primary-foreground border-0"
                      disabled={submitting}
                      onClick={() => approveInline(r)}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm" variant="outline" className="h-7 text-xs px-2 border-destructive/50 text-destructive"
                      disabled={submitting}
                      onClick={() => { setReview(r); setRejectReason(""); }}
                    >
                      Reject
                    </Button>
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">—</span>
                );
              },
            },
          ]}
          rows={rows}
        />
      )}

      <Dialog open={!!review} onOpenChange={(o) => { if (!o) { setReview(null); setRejectReason(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Reject request</DialogTitle></DialogHeader>
          {review && (
            <div className="space-y-4">
              <p className="text-sm">{REQUEST_TYPE_LABELS[review.requestType] ?? review.requestType} — {review.entityLabel}</p>
              <div className="space-y-1.5">
                <Label htmlFor="reject-reason" className="text-xs">Rejection reason</Label>
                <Textarea id="reject-reason" value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setReview(null); setRejectReason(""); }}>Cancel</Button>
            <Button variant="destructive" disabled={submitting} onClick={() => submitReview(false)}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
