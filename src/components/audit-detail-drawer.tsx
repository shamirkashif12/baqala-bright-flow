import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { api, type AuditDetail } from "@/lib/api";
import { SARIcon, fmtSAR } from "@/lib/currency";
import { toast } from "sonner";

// Shared by the Employee Activity Report and the Employee Audit Center. Both list one line per
// action with a one-line summary that deliberately omits line items; this is where "which
// products, how many, at what price, and what changed" actually lives.
//
// Fetched on open rather than embedded in the list payload — resolving items means hitting the
// underlying order/return/transfer per row, which would be hundreds of queries for a list nobody
// reads in full.

function fmtQty(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function severityTone(s: string) {
  if (s === "critical") return "bg-destructive/15 text-destructive";
  if (s === "warning") return "bg-warning/20 text-warning-foreground";
  return "bg-muted text-muted-foreground";
}

export function AuditDetailDrawer({ auditLogId, onClose }: { auditLogId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<AuditDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auditLogId) { setDetail(null); return; }
    setLoading(true);
    api.getAuditDetail(auditLogId)
      .then(setDetail)
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load activity detail"))
      .finally(() => setLoading(false));
  }, [auditLogId]);

  return (
    <Sheet open={!!auditLogId} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-[560px] overflow-y-auto">
        <SheetHeader className="pb-4 border-b border-border/60">
          <SheetTitle className="text-base">{detail?.actionLabel ?? "Activity detail"}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            {detail ? `${detail.relatedTransaction} · ${new Date(detail.createdAt).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
        </SheetHeader>

        {loading && <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>}

        {!loading && detail && (
          <div className="mt-4 space-y-5">
            <Section title="Who & Where">
              <Row label="Employee" value={detail.employeeName} />
              <Row label="Performed By" value={detail.performedBy} />
              <Row label="Branch" value={detail.branchName} />
              <Row label="Device" value={detail.deviceName} />
              <Row label="IP Address" value={detail.ipAddress || "—"} />
              <Row label="Module" value={detail.module || "—"} />
              <div className="flex justify-between border-b border-border/40 pb-2 text-sm">
                <span className="text-muted-foreground">Severity</span>
                <Badge variant="outline" className={`text-[10px] border-0 ${severityTone(detail.severity)}`}>{detail.severity}</Badge>
              </div>
            </Section>

            {detail.transactionFields.length > 0 && (
              <Section title={`Transaction — ${detail.relatedTransaction}`}>
                {detail.transactionFields.map((f) => <Row key={f.field} label={f.field} value={f.newValue ?? "—"} />)}
              </Section>
            )}

            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                Affected Products ({detail.items.length})
              </p>
              {detail.items.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border/50 px-3 py-4 text-center text-xs text-muted-foreground">
                  This action didn't touch any product lines.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {detail.items.map((it, idx) => (
                    <div key={idx} className="rounded-xl border border-border/40 px-3 py-2.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{it.productName}</span>
                        <span className="font-mono text-muted-foreground">{it.sku}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-muted-foreground">
                        <span>Qty <span className="font-semibold text-foreground">{fmtQty(it.quantity)}</span></span>
                        {it.unitPrice != null && <span>Unit <SARIcon />{fmtSAR(it.unitPrice)}</span>}
                        {it.lineTotal != null && <span className="font-semibold text-foreground">Line <SARIcon />{fmtSAR(it.lineTotal)}</span>}
                      </div>
                      {it.note && <p className="mt-1 text-[11px] text-muted-foreground">{it.note}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {detail.changes.length > 0 && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  What Changed ({detail.changes.length})
                </p>
                <div className="space-y-1.5">
                  {detail.changes.map((c) => (
                    <div key={c.field} className="rounded-xl border border-border/40 px-3 py-2 text-xs">
                      <p className="font-medium">{c.field}</p>
                      <div className="mt-0.5 flex items-center gap-2 text-muted-foreground">
                        <span className="line-through">{c.oldValue ?? "—"}</span>
                        <span>→</span>
                        <span className="font-semibold text-foreground">{c.newValue ?? "—"}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.notes && (
              <Section title="Notes">
                <p className="text-sm">{detail.notes}</p>
              </Section>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">{title}</p>
      <div className="space-y-0">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-border/40 pb-2 pt-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right max-w-[60%] break-words">{value}</span>
    </div>
  );
}
