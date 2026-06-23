import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { MetricCard } from "@/components/metric-card";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RotateCcw, Loader2 } from "lucide-react";
import { api, type StockTransfer } from "@/lib/api";
import { SARIcon } from "@/lib/currency";

export const Route = createFileRoute("/_app/supplier-returns")({ component: SupplierReturns });

const STATUS_CLS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  pending_approval: "bg-warning/20 text-warning-foreground",
  approved: "bg-primary/15 text-primary",
  in_transit: "bg-primary/15 text-primary",
  completed: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function SupplierReturns() {
  const [transfers, setTransfers] = useState<StockTransfer[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    api.getStockTransfers({ transferType: "warehouse_to_supplier" })
      .then(setTransfers)
      .finally(() => setLoading(false));
  }, []);

  const filtered = transfers.filter(t => {
    const s = q.toLowerCase();
    if (s && !t.transferNumber.toLowerCase().includes(s) &&
        !(t.destSupplier?.name.toLowerCase().includes(s)) &&
        !(t.sourceWarehouse?.name.toLowerCase().includes(s))) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  const completed = transfers.filter(t => t.status === "completed");
  const totalRtsValue = completed.reduce(
    (s, t) => s + (t.items ?? []).reduce((si, i) => si + (i.receivedQuantity ?? i.requestedQuantity) * (i.unitCost ?? 0), 0),
    0,
  );

  return (
    <PageShell title="Supplier Returns (RTS)" subtitle="Warehouse-to-supplier return transfers and credit notes">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <MetricCard label="Total RTS" value={String(transfers.length)} icon={RotateCcw} accent="default" />
        <MetricCard label="Completed" value={String(completed.length)} icon={RotateCcw} accent="success" />
        <MetricCard label="Total Credit Value" value={`SAR ${totalRtsValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={RotateCcw} accent="primary" />
      </div>

      <div className="flex flex-wrap items-center gap-2 mt-4">
        <Input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search transfer#, supplier, warehouse…"
          className="h-9 w-72 flex-shrink-0"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-9 w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="pending_approval">Pending Approval</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="in_transit">In Transit</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground gap-2 mt-4">
          <Loader2 className="h-5 w-5 animate-spin" /><span>Loading returns…</span>
        </div>
      ) : (
        <Card className="overflow-hidden border-border/60 shadow-card mt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-muted/40 border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="px-4 py-3 font-semibold">Transfer #</th>
                  <th className="px-4 py-3 font-semibold">Supplier</th>
                  <th className="px-4 py-3 font-semibold">Warehouse</th>
                  <th className="px-4 py-3 font-semibold">Reason</th>
                  <th className="px-4 py-3 font-semibold text-center">Items</th>
                  <th className="px-4 py-3 font-semibold text-right">Credit Value (cost)</th>
                  <th className="px-4 py-3 font-semibold">Status</th>
                  <th className="px-4 py-3 font-semibold">Date</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(t => {
                  const creditValue = (t.items ?? []).reduce(
                    (s, i) => s + (i.receivedQuantity ?? i.requestedQuantity) * (i.unitCost ?? 0),
                    0,
                  );
                  return (
                    <tr key={t.id} className="border-b border-border/40 hover:bg-muted/30 last:border-0">
                      <td className="px-4 py-3 font-mono text-xs font-bold">{t.transferNumber}</td>
                      <td className="px-4 py-3">{t.destSupplier?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">{t.sourceWarehouse?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        {t.returnReason
                          ? <Badge variant="outline" className="text-xs capitalize">{t.returnReason.replace(/_/g, " ")}</Badge>
                          : "—"}
                      </td>
                      <td className="px-4 py-3 text-center font-medium">{t.items?.length ?? 0}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {creditValue > 0
                          ? <span className="flex items-center gap-0.5 justify-end text-primary"><SARIcon />{creditValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_CLS[t.status] ?? "bg-muted text-muted-foreground"}`}>
                          {t.status.replace(/_/g, " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString("en-SA")}
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      No supplier return transfers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </PageShell>
  );
}
