import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Plus, Filter, Download, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type Column = { key: string; label: string; className?: string; render?: (row: any) => React.ReactNode };

export function DataTable({ columns, rows }: { columns: Column[]; rows: any[] }) {
  return (
    <Card className="overflow-hidden border-border/60 shadow-card">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 border-b border-border/60">
              {columns.map((c) => (
                <th key={c.key} className={cn("text-left font-semibold text-xs uppercase tracking-wider text-muted-foreground px-4 py-3", c.className)}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-b border-border/40 hover:bg-muted/30 transition-colors last:border-0">
                {columns.map((c) => (
                  <td key={c.key} className={cn("px-4 py-3.5 align-middle", c.className)}>
                    {c.render ? c.render(r) : r[c.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const map: Record<string, string> = {
    active: "bg-success/15 text-success border-success/30",
    online: "bg-success/15 text-success border-success/30",
    paid: "bg-success/15 text-success border-success/30",
    safe: "bg-success/15 text-success border-success/30",
    resolved: "bg-success/15 text-success border-success/30",
    synced: "bg-success/15 text-success border-success/30",
    "in stock": "bg-success/15 text-success border-success/30",

    pending: "bg-warning/20 text-warning-foreground border-warning/40",
    "near expiry": "bg-warning/20 text-warning-foreground border-warning/40",
    syncing: "bg-warning/20 text-warning-foreground border-warning/40",
    low: "bg-warning/20 text-warning-foreground border-warning/40",
    "in progress": "bg-warning/20 text-warning-foreground border-warning/40",
    maintenance: "bg-warning/20 text-warning-foreground border-warning/40",

    expired: "bg-destructive/15 text-destructive border-destructive/30",
    offline: "bg-destructive/15 text-destructive border-destructive/30",
    overdue: "bg-destructive/15 text-destructive border-destructive/30",
    critical: "bg-destructive/15 text-destructive border-destructive/30",
    blocked: "bg-destructive/15 text-destructive border-destructive/30",
    "out of stock": "bg-destructive/15 text-destructive border-destructive/30",

    inactive: "bg-muted text-muted-foreground border-border",
    closed: "bg-muted text-muted-foreground border-border",
    draft: "bg-muted text-muted-foreground border-border",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize", map[s] ?? "bg-primary/10 text-primary border-primary/20")}>
      <span className={cn("h-1.5 w-1.5 rounded-full",
        ["active","online","paid","safe","resolved","synced","in stock"].includes(s) && "bg-success",
        ["pending","near expiry","syncing","low","in progress","maintenance"].includes(s) && "bg-warning",
        ["expired","offline","overdue","critical","blocked","out of stock"].includes(s) && "bg-destructive",
        ["inactive","closed","draft"].includes(s) && "bg-muted-foreground",
      )} />
      {status}
    </span>
  );
}

export function Toolbar({ placeholder = "Search…", primaryLabel, primaryIcon: PIcon = Plus, extra }: {
  placeholder?: string; primaryLabel?: string; primaryIcon?: LucideIcon; extra?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-md">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={placeholder} className="pl-9 h-10 bg-card" />
      </div>
      <Button variant="outline" size="sm" className="h-10 gap-1.5"><Filter className="h-4 w-4" /> Filters</Button>
      <Button variant="outline" size="sm" className="h-10 gap-1.5"><Download className="h-4 w-4" /> Export</Button>
      {extra}
      {primaryLabel && (
        <Button size="sm" className="h-10 gap-1.5 gradient-primary text-primary-foreground border-0 shadow-glow">
          <PIcon className="h-4 w-4" /> {primaryLabel}
        </Button>
      )}
    </div>
  );
}

export function StatChip({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "primary" | "success" | "warning" | "destructive" }) {
  const tones: Record<string,string> = {
    default: "bg-muted/60 text-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <div className={cn("rounded-xl px-3.5 py-2.5", tones[tone])}>
      <p className="text-[10px] uppercase tracking-wider font-semibold opacity-70">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}