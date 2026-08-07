import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { MetricCard } from "@/components/metric-card";
import { PaginatedDataTable, FilterField } from "@/components/module-placeholder";
import { DateRangeField } from "@/components/report-filters/date-range-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { usePermission } from "@/lib/use-permission";
import { useBranch } from "@/lib/branch-context";
import { useAuth } from "@/lib/auth";
import { api, type ApprovalRow } from "@/lib/api";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { Clock, CheckCircle2, XCircle, X, SlidersHorizontal, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_app/reports/approval-center")({ component: ApprovalCenter });

const REQUEST_TYPE_LABELS: Record<string, string> = {
  discount: "Discount",
  offer: "Offer",
  coupon: "Coupon",
  order_cancellation: "Order Cancellation",
  // Order edits (line changes, repricing, discount overrides) by anyone without Orders:Approve —
  // queued here rather than applied, same maker-checker shape as a cancellation.
  order_modification: "Order Modification",
  item_deletion: "Item Deletion",
  refund_return: "Refund / Return",
  stock_count: "Stocktaking / Inventory Count",
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
  // Mirrors ApprovalsController.ModuleFor exactly — the server re-checks the same module before
  // acting, so a mismatch here only ever hides a button the caller could legitimately press.
  const moduleForRequestType: Record<string, keyof typeof modulePerms> = {
    discount: "Coupons",
    offer: "Coupons",
    coupon: "Coupons",
    order_cancellation: "Orders",
    order_modification: "Orders",
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
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const scopedBranchId = branchIds.length === 1 ? branchIds[0] : undefined;

  const load = useCallback(() => {
    setLoading(true);
    // Status is never sent to the server — it's applied purely client-side below, in both the
    // headline counts and the table. Previously a single-status pick (e.g. the "pending" default)
    // was sent as a server param, which narrowed `rows` itself — so Approved/Rejected always read
    // 0 while the Status filter (or a quick-filter card) was pinned to "pending" alone.
    api.getApprovals({
      branchId: scopedBranchId,
      type: types.length === 1 ? types[0] : undefined,
      from: `${from}T00:00:00Z`,
      to: `${to}T23:59:59Z`,
    })
      .then((data) => {
        const filtered = data.filter((r) => types.length === 0 || types.includes(r.requestType));
        setRows(filtered);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load approvals"))
      .finally(() => setLoading(false));
  }, [scopedBranchId, types, from, to]);

  useEffect(() => { load(); }, [load]);

  const pendingCount = useMemo(() => rows.filter((r) => r.status === "pending" || r.status === "pending_review" || r.status === "pending_approval").length, [rows]);
  const approvedCount = useMemo(() => rows.filter((r) => r.status === "approved" || r.status === "completed").length, [rows]);
  const rejectedCount = useMemo(() => rows.filter((r) => r.status === "rejected").length, [rows]);
  const displayRows = useMemo(() => rows.filter((r) => statuses.length === 0 || statuses.includes(r.status)), [rows, statuses]);

  const PENDING_STATUSES = ["pending", "pending_review", "pending_approval"];
  const APPROVED_STATUSES = ["approved", "completed"];

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

  const defaultBranchIds = lockedBranchId ? [lockedBranchId] : [];
  const hasFilters = from !== firstOfMonthStr() || to !== todayStr() || branchIds.join(",") !== defaultBranchIds.join(",")
    || statuses.join(",") !== "pending" || types.length !== 0;
  const clearFilters = () => {
    setFrom(firstOfMonthStr()); setTo(todayStr()); setBranchIds(defaultBranchIds);
    setStatuses(["pending"]); setTypes([]);
  };
  const advancedFilterCount = types.length;

  return (
    <PageShell title="Approval Center" subtitle="Every manager approval in one place — discounts, cancellations, deletions, refunds & more">
      <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen} className="rounded-xl border border-border/60 bg-card p-3 space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <DateRangeField from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
          {!lockedBranchId && (
            <FilterField label="Branch" className="w-44">
              <SearchableMultiSelect
                placeholder="All Branches"
                options={branches.map((b) => ({ id: b.id, label: b.name }))}
                selected={branchIds}
                onChange={setBranchIds}
              />
            </FilterField>
          )}
          <FilterField label="Status" className="w-44">
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
          </FilterField>

          <CollapsibleTrigger asChild>
            <Button size="sm" variant="outline" className="h-9 gap-1.5 text-xs">
              <SlidersHorizontal className="h-3.5 w-3.5" />
              Advanced
              {advancedFilterCount > 0 && (
                <Badge variant="secondary" className="h-4 min-w-4 rounded-full px-1 text-[10px] leading-none">{advancedFilterCount}</Badge>
              )}
              <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", advancedOpen && "rotate-180")} />
            </Button>
          </CollapsibleTrigger>
          {hasFilters && (
            <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-xs" onClick={clearFilters}>
              <X className="h-3.5 w-3.5" /> Clear Filters
            </Button>
          )}
        </div>

        <CollapsibleContent className="grid gap-3 grid-cols-[repeat(auto-fit,minmax(180px,1fr))] pt-3 border-t border-border/50">
          <FilterField label="Type" className="max-w-xs">
            <SearchableMultiSelect
              placeholder="All Types"
              options={Object.entries(REQUEST_TYPE_LABELS).map(([id, label]) => ({ id, label }))}
              selected={types}
              onChange={setTypes}
            />
          </FilterField>
        </CollapsibleContent>
      </Collapsible>

      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard
          label="Pending" value={String(pendingCount)} icon={Clock} accent="warning"
          onClick={() => setStatuses(v => v.join(",") === PENDING_STATUSES.join(",") ? [] : PENDING_STATUSES)}
          active={statuses.join(",") === PENDING_STATUSES.join(",")}
        />
        <MetricCard
          label="Approved" value={String(approvedCount)} icon={CheckCircle2} accent="success"
          onClick={() => setStatuses(v => v.join(",") === APPROVED_STATUSES.join(",") ? [] : APPROVED_STATUSES)}
          active={statuses.join(",") === APPROVED_STATUSES.join(",")}
        />
        <MetricCard
          label="Rejected" value={String(rejectedCount)} icon={XCircle} accent="destructive"
          onClick={() => setStatuses(v => v.length === 1 && v[0] === "rejected" ? [] : ["rejected"])}
          active={statuses.length === 1 && statuses[0] === "rejected"}
        />
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
          rows={displayRows}
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
