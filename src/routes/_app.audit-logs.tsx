import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/metric-card";
import { FilterBar } from "@/components/filter-bar";
import {
  LogIn, LogOut, ShieldAlert, Undo2, Edit3, Trash2, ScanBarcode,
  Settings as SettingsIcon, CreditCard, type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/audit-logs")({ component: AuditLogs });

type Severity = "info" | "warning" | "critical";
type Log = {
  ts: string; actor: string; role: string; branch: string;
  action: string; target: string; icon: LucideIcon; severity: Severity;
};

const allLogs: Log[] = [
  { ts: "14:42", actor: "Fahad Al-Qahtani", role: "Cashier", branch: "Olaya", action: "Refund issued", target: "RET-20260602-008 · ر.س 28.00", icon: Undo2, severity: "warning" },
  { ts: "14:38", actor: "Mohammed Al-Harbi", role: "Cashier", branch: "Olaya", action: "Discount applied", target: "INV-...0141 · 10% manager override", icon: BadgePct, severity: "warning" },
  { ts: "14:32", actor: "Fahad Al-Qahtani", role: "Cashier", branch: "Olaya", action: "Sale completed", target: "INV-20260602-0142", icon: ScanBarcode, severity: "info" },
  { ts: "14:20", actor: "Khalid Al-Otaibi", role: "Manager", branch: "Khobar", action: "Price changed", target: "SKU TBC-001 · ر.س 41.00 → ر.س 41.40", icon: Edit3, severity: "warning" },
  { ts: "13:55", actor: "Sara M.", role: "Admin", branch: "HQ", action: "User role updated", target: "user@baqala.sa → Manager", icon: ShieldAlert, severity: "critical" },
  { ts: "13:42", actor: "Fahad Al-Qahtani", role: "Cashier", branch: "Olaya", action: "Shift opened", target: "Opening cash ر.س 500", icon: LogIn, severity: "info" },
  { ts: "13:38", actor: "Card Terminal", role: "System", branch: "Olaya", action: "Card payment timeout", target: "INV draft #4892", icon: CreditCard, severity: "warning" },
  { ts: "12:50", actor: "Mohammed Al-Harbi", role: "Cashier", branch: "Olaya", action: "Item voided", target: "Lay's Classic 75g ×2", icon: Trash2, severity: "warning" },
  { ts: "12:20", actor: "Sultan Al-Dossari", role: "Cashier", branch: "Jeddah", action: "Shift closed", target: "Expected ر.س 4,820 · Actual ر.س 4,815 · -5.00", icon: LogOut, severity: "info" },
  { ts: "11:45", actor: "Admin", role: "Admin", branch: "HQ", action: "POS setting changed", target: "Refund > ر.س 100 requires manager", icon: SettingsIcon, severity: "info" },
];

function BadgePct(props: React.SVGProps<SVGSVGElement>) { return <Edit3 {...props} />; }

function AuditLogs() {
  const [logs, setLogs] = useState(allLogs);
  return (
    <PageShell title="Audit Logs" subtitle="Every cashier, manager, system & device action — tamper-proof trail">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Events Today" value="1,284" icon={ScanBarcode} accent="primary" />
        <MetricCard label="Critical" value="3" icon={ShieldAlert} accent="destructive" />
        <MetricCard label="Refunds" value="8" icon={Undo2} accent="warning" />
        <MetricCard label="Logins" value="42" icon={LogIn} accent="success" />
      </div>

      <FilterBar
        placeholder="Search by user, action, target…"
        onChange={(s) => {
          const q = s.query.toLowerCase().trim();
          setLogs(allLogs.filter(l =>
            (s.branch === "All Branches" || l.branch === s.branch.split(" — ")[0] || (s.branch.includes("HQ") && l.branch === "HQ")) &&
            (!q || l.actor.toLowerCase().includes(q) || l.action.toLowerCase().includes(q) || l.target.toLowerCase().includes(q))
          ));
        }}
      />

      <Card className="p-0 border-border/60 shadow-card overflow-hidden">
        <ul className="divide-y divide-border/40">
          {logs.map((l, i) => (
            <li key={i} className="flex items-start gap-4 p-4 hover:bg-muted/30 transition-colors">
              <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center shrink-0",
                l.severity === "critical" && "bg-destructive/15 text-destructive",
                l.severity === "warning" && "bg-warning/20 text-warning-foreground",
                l.severity === "info" && "bg-primary/10 text-primary",
              )}>
                <l.icon className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-sm">{l.action}</p>
                  <Badge variant="outline" className="text-[10px]">{l.role}</Badge>
                  <Badge variant="outline" className="text-[10px]">{l.branch}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{l.target}</p>
                <p className="text-[11px] text-muted-foreground mt-0.5">by <span className="font-medium text-foreground/80">{l.actor}</span> · {l.ts}</p>
              </div>
              <Badge variant="outline" className={cn("text-[10px]",
                l.severity === "critical" && "bg-destructive/10 text-destructive border-destructive/30",
                l.severity === "warning" && "bg-warning/20 text-warning-foreground border-warning/40",
                l.severity === "info" && "bg-primary/10 text-primary border-primary/20",
              )}>{l.severity}</Badge>
            </li>
          ))}
        </ul>
      </Card>
    </PageShell>
  );
}