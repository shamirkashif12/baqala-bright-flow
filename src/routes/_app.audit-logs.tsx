import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { FilterBar } from "@/components/filter-bar";
import {
  LogIn, LogOut, ShieldAlert, Undo2, Edit3, Trash2, ScanBarcode,
  Settings as SettingsIcon, CreditCard, BadgePercent, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { api, type AuditLog } from "@/lib/api";

export const Route = createFileRoute("/_app/audit-logs")({ component: AuditLogs });

type Severity = "info" | "warning" | "critical";

function getSeverity(action: string): Severity {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("void") || a.includes("role") || a.includes("permission") || a.includes("unauthorized")) return "critical";
  if (a.includes("refund") || a.includes("discount") || a.includes("return") || a.includes("override") || a.includes("price") || a.includes("adjust")) return "warning";
  return "info";
}

function getIcon(action: string): LucideIcon {
  const a = action.toLowerCase();
  if (a.includes("login") || a.includes("sign in") || a.includes("shift open")) return LogIn;
  if (a.includes("logout") || a.includes("shift close")) return LogOut;
  if (a.includes("refund") || a.includes("return")) return Undo2;
  if (a.includes("delete") || a.includes("void")) return Trash2;
  if (a.includes("edit") || a.includes("update") || a.includes("price")) return Edit3;
  if (a.includes("role") || a.includes("permission") || a.includes("user")) return ShieldAlert;
  if (a.includes("discount") || a.includes("coupon")) return BadgePercent;
  if (a.includes("payment") || a.includes("card")) return CreditCard;
  if (a.includes("setting") || a.includes("config")) return SettingsIcon;
  return ScanBarcode;
}

function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [filtered, setFiltered] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getAuditLogs()
      .then(data => {
        setLogs(data.items);
        setFiltered(data.items);
        setTotal(data.total);
      })
      .finally(() => setLoading(false));
  }, []);

  const critical = logs.filter(l => getSeverity(l.action) === "critical").length;
  const warnings = logs.filter(l => getSeverity(l.action) === "warning").length;

  return (
    <PageShell title="Audit Logs" subtitle="Every cashier, manager, system & device action — tamper-proof trail">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Events" value={String(total)} icon={ScanBarcode} accent="primary" />
        <MetricCard label="Critical" value={String(critical)} icon={ShieldAlert} accent="destructive" />
        <MetricCard label="Warnings" value={String(warnings)} icon={Undo2} accent="warning" />
        <MetricCard label="Loaded" value={String(logs.length)} icon={LogIn} accent="success" />
      </div>

      <FilterBar
        placeholder="Search by action, entity…"
        onChange={(s) => {
          const q = s.query.toLowerCase().trim();
          setFiltered(logs.filter(l =>
            !q ||
            l.action.toLowerCase().includes(q) ||
            (l.entityType ?? "").toLowerCase().includes(q) ||
            (l.details ?? "").toLowerCase().includes(q)
          ));
        }}
      />

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <Card className="p-0 border-border/60 shadow-card overflow-hidden">
          <ul className="divide-y divide-border/40">
            {filtered.map((l) => {
              const severity = getSeverity(l.action);
              const Icon = getIcon(l.action);
              return (
                <li key={l.id} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors">
                  <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                    severity === "critical" && "bg-destructive/15 text-destructive",
                    severity === "warning" && "bg-warning/20 text-warning-foreground",
                    severity === "info" && "bg-primary/10 text-primary",
                  )}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm">{l.action}</p>
                      {l.entityType && <Badge variant="outline" className="text-[10px]">{l.entityType}</Badge>}
                    </div>
                    {l.details && <p className="text-xs text-muted-foreground mt-0.5 truncate">{l.details}</p>}
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      {l.userId ? <span>User <span className="font-medium text-foreground/80 font-mono text-[10px]">{l.userId.slice(0, 8)}</span> · </span> : ""}
                      {new Date(l.createdAt).toLocaleString("en-SA")}
                    </p>
                  </div>
                  <Badge variant="outline" className={cn("text-[10px]",
                    severity === "critical" && "bg-destructive/10 text-destructive border-destructive/30",
                    severity === "warning" && "bg-warning/20 text-warning-foreground border-warning/40",
                    severity === "info" && "bg-primary/10 text-primary border-primary/20",
                  )}>{severity}</Badge>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="p-10 text-center text-muted-foreground text-sm">No audit log entries found.</li>
            )}
          </ul>
        </Card>
      )}
    </PageShell>
  );
}
