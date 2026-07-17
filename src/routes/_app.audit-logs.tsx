import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ModuleGate } from "@/components/role-gate";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MetricCard } from "@/components/metric-card";
import {
  LogIn, LogOut, ShieldAlert, Undo2, Edit3, Trash2, ScanBarcode,
  Settings as SettingsIcon, CreditCard, BadgePercent, ShoppingCart, RefreshCw,
  Boxes, ChevronRight, ArrowRight, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api, type AuditLog, type Product, type User } from "@/lib/api";
import { describeChanges, type FieldChange } from "@/lib/audit-changes";

export const Route = createFileRoute("/_app/audit-logs")({
  component: () => (
    <ModuleGate module="Audit Logs">
      <AuditLogs />
    </ModuleGate>
  ),
});

type Severity = "info" | "warning" | "critical";

/**
 * Employee Activity groups — each maps a reviewer-facing heading to the concrete actions the
 * backend writes. Discounts / price changes / added / removed items all live inside `edit_order`
 * (one edit is logged atomically with a before/after snapshot), so they're one group here and are
 * broken out per row by describeChanges().
 */
const ACTIVITY_GROUPS: { value: string; label: string; actions: string[] }[] = [
  { value: "sales", label: "Sales Transactions", actions: ["create_order"] },
  { value: "refunds", label: "Refunds", actions: ["create_refund", "approve_refund", "reject_refund"] },
  { value: "order_edits", label: "Order Edits (discounts, prices, items)", actions: ["edit_order"] },
  { value: "deleted_orders", label: "Deleted / Voided Orders", actions: ["void_order"] },
  // Catalog activity. "Added Items" spans both senses a reviewer means by it: a new catalog
  // product, and a batch of stock arriving against an existing one.
  { value: "added_items", label: "Added Items (products, stock received)", actions: ["create_product", "receive_batch"] },
  { value: "price_changes", label: "Price / Catalog Changes", actions: ["update_product"] },
  { value: "deleted_items", label: "Deleted Items", actions: ["delete_product"] },
  { value: "inventory", label: "Inventory Adjustments", actions: ["inventory_adjustment"] },
  { value: "stock_counts", label: "Stock Counts", actions: ["start_stock_count", "complete_stock_count"] },
  { value: "exports", label: "Report Exports", actions: ["export_report"] },
];

function getSeverity(action: string): Severity {
  const a = action.toLowerCase();
  if (a.includes("delete") || a.includes("void") || a.includes("role") || a.includes("permission") || a.includes("unauthorized")) return "critical";
  if (a.includes("refund") || a.includes("discount") || a.includes("return") || a.includes("override") || a.includes("price") || a.includes("adjust") || a === "edit_order") return "warning";
  return "info";
}

function getIcon(action: string): LucideIcon {
  const a = action.toLowerCase();
  if (a.includes("login") || a.includes("sign in") || a.includes("shift open")) return LogIn;
  if (a.includes("logout") || a.includes("shift close")) return LogOut;
  if (a.includes("refund") || a.includes("return")) return Undo2;
  if (a.includes("delete") || a.includes("void")) return Trash2;
  if (a.includes("adjust") || a.includes("stock_count")) return Boxes;
  if (a.includes("edit") || a.includes("update") || a.includes("price")) return Edit3;
  if (a.includes("role") || a.includes("permission") || a.includes("user")) return ShieldAlert;
  if (a.includes("discount") || a.includes("coupon")) return BadgePercent;
  if (a.includes("payment") || a.includes("card")) return CreditCard;
  if (a.includes("sale") || a.includes("order") || a.includes("invoice")) return ShoppingCart;
  if (a.includes("setting") || a.includes("config")) return SettingsIcon;
  return ScanBarcode;
}

// Raw action strings are written for machines (`create_order`); this page is read by managers.
const ACTION_LABELS: Record<string, string> = {
  create_order: "Sale completed",
  edit_order: "Order edited",
  void_order: "Order voided",
  create_refund: "Refund raised",
  approve_refund: "Refund approved",
  reject_refund: "Refund rejected",
  inventory_adjustment: "Inventory adjusted",
  start_stock_count: "Stock count started",
  complete_stock_count: "Stock count completed",
  export_report: "Report exported",
  create_product: "Product added",
  update_product: "Product edited",
  delete_product: "Product discontinued",
  receive_batch: "Stock received",
};
const labelFor = (action: string) => ACTION_LABELS[action] ?? action;

const KSA = { timeZone: "Asia/Riyadh" } as const;

function relTimeShort(isoStr: string): string {
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SEVERITY_CHIP: Record<Severity, string> = {
  critical: "bg-destructive/10 text-destructive border-destructive/30",
  warning:  "bg-warning/20 text-warning-foreground border-warning/40",
  info:     "bg-primary/10 text-primary border-primary/20",
};
const SEVERITY_ICON_BG: Record<Severity, string> = {
  critical: "bg-destructive/15 text-destructive",
  warning:  "bg-warning/20 text-warning-foreground",
  info:     "bg-primary/10 text-primary",
};

const CHANGE_CHIP: Partial<Record<FieldChange["kind"], string>> = {
  discount: "bg-warning/15 text-warning-foreground border-warning/30",
  price: "bg-warning/15 text-warning-foreground border-warning/30",
  item_added: "bg-success/15 text-success border-success/30",
  item_removed: "bg-destructive/10 text-destructive border-destructive/30",
};

function ChangeList({ changes }: { changes: FieldChange[] }) {
  return (
    <div className="mt-2 space-y-1 rounded-lg border border-border/60 bg-muted/20 p-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Before → After</p>
      {changes.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <Badge variant="outline" className={cn("text-[10px] font-normal", CHANGE_CHIP[c.kind])}>{c.label}</Badge>
          <span className="font-mono text-muted-foreground line-through">{c.before ?? "—"}</span>
          <ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
          <span className="font-mono font-medium text-foreground">{c.after ?? "—"}</span>
        </div>
      ))}
    </div>
  );
}

function AuditLogs() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [userMap, setUserMap] = useState<Map<string, User>>(new Map());
  const [productMap, setProductMap] = useState<Map<string, Product>>(new Map());
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [sevFilter, setSevFilter] = useState<"all" | Severity>("all");
  const [userId, setUserId] = useState("all");
  const [activity, setActivity] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Employee / activity / date are pushed to the server so the filter searches the whole trail,
  // not just the page already in memory. Severity and free-text stay client-side: both are derived
  // from fields the loaded rows already carry.
  const load = useCallback((silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    const group = ACTIVITY_GROUPS.find((g) => g.value === activity);
    Promise.all([
      api.getAuditLogs({
        userId: userId !== "all" ? userId : undefined,
        action: group ? group.actions.join(",") : undefined,
        from: from || undefined,
        // `to` is a date, but CreatedAt is a timestamp — without widening to end-of-day, picking
        // today as the end date would exclude everything logged since midnight.
        to: to ? `${to}T23:59:59` : undefined,
        pageSize: 200,
      }),
      api.getUsers().catch(() => [] as User[]),
      api.getProducts().catch(() => [] as Product[]),
    ])
      .then(([data, allUsers, products]) => {
        setLogs(data.items);
        setTotal(data.total);
        setUsers(allUsers.filter((u) => u.status === "active"));
        setUserMap(new Map(allUsers.map((u) => [u.id, u])));
        setProductMap(new Map(products.map((p) => [p.id, p])));
      })
      .finally(() => { setLoading(false); setRefreshing(false); });
  }, [userId, activity, from, to]);

  useEffect(() => { load(); }, [load]);

  const productName = useCallback((id: string) => productMap.get(id)?.name ?? `${id.slice(0, 8)}…`, [productMap]);

  const changesByLog = useMemo(() => {
    const m = new Map<string, FieldChange[]>();
    for (const l of logs) m.set(l.id, describeChanges(l, productName));
    return m;
  }, [logs, productName]);

  const filtered = useMemo(() => logs.filter((l) => {
    if (sevFilter !== "all" && getSeverity(l.action) !== sevFilter) return false;
    const q = query.toLowerCase().trim();
    if (!q) return true;
    const user = l.userId ? userMap.get(l.userId) : undefined;
    return (
      l.action.toLowerCase().includes(q) ||
      labelFor(l.action).toLowerCase().includes(q) ||
      (l.entityType ?? "").toLowerCase().includes(q) ||
      (l.entityId ?? "").toLowerCase().includes(q) ||
      (l.newValues ?? l.details ?? "").toLowerCase().includes(q) ||
      (user?.fullName ?? "").toLowerCase().includes(q) ||
      (user?.branchName ?? "").toLowerCase().includes(q)
    );
  }), [logs, query, sevFilter, userMap]);

  const critical = logs.filter((l) => getSeverity(l.action) === "critical").length;
  const warnings = logs.filter((l) => getSeverity(l.action) === "warning").length;

  const selectedUser = userId !== "all" ? userMap.get(userId) : undefined;
  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  return (
    <PageShell
      title="Employee Audit Center"
      subtitle={selectedUser
        ? `Activity trail for ${selectedUser.fullName} — sales, refunds, discounts, edits and adjustments`
        : "Every cashier, manager, system & device action — tamper-proof trail"}
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Total Events" value={String(total)} icon={ScanBarcode} accent="primary" />
        <MetricCard label="Critical" value={String(critical)} icon={ShieldAlert} accent="destructive" />
        <MetricCard label="Warnings" value={String(warnings)} icon={Undo2} accent="warning" />
        <MetricCard label="Loaded" value={String(logs.length)} icon={LogIn} accent="success" />
      </div>

      <div className="flex flex-wrap gap-2">
        <Select value={userId} onValueChange={setUserId}>
          <SelectTrigger className="h-9 w-52"><SelectValue placeholder="Employee" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Employees</SelectItem>
            {users.map((u) => <SelectItem key={u.id} value={u.id}>{u.fullName}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={activity} onValueChange={setActivity}>
          <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Activity" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Activity</SelectItem>
            {ACTIVITY_GROUPS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1">
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="h-9 w-36" />
          <span className="text-xs text-muted-foreground">–</span>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="h-9 w-36" />
        </div>
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search action, user, reference…"
          className="h-9 w-56 flex-shrink-0"
        />
        <Select value={sevFilter} onValueChange={(v) => setSevFilter(v as typeof sevFilter)}>
          <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severity</SelectItem>
            <SelectItem value="info">Info</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground self-center ml-auto">{filtered.length} event{filtered.length !== 1 ? "s" : ""}</span>
        <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={() => load(true)} disabled={refreshing}>
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <Card className="p-0 border-border/60 shadow-card overflow-hidden">
          <ul className="divide-y divide-border/40">
            {filtered.map((l) => {
              const severity = getSeverity(l.action);
              const Icon = getIcon(l.action);
              const user = l.userId ? userMap.get(l.userId) : undefined;
              const changes = changesByLog.get(l.id) ?? [];
              const isOpen = expanded.has(l.id);
              const timeStr = new Date(l.createdAt).toLocaleTimeString("en-SA", { ...KSA, hour: "2-digit", minute: "2-digit" });
              const dateStr = new Date(l.createdAt).toLocaleDateString("en-SA", { ...KSA, month: "short", day: "numeric" });
              return (
                <li key={l.id} className="flex items-start gap-4 px-4 py-3.5 hover:bg-muted/30 transition-colors">
                  <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5", SEVERITY_ICON_BG[severity])}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-sm leading-tight">{labelFor(l.action)}</p>
                      <Badge variant="outline" className={cn("text-[10px]", SEVERITY_CHIP[severity])}>{severity}</Badge>
                      {changes.length > 0 && (
                        <button
                          onClick={() => toggle(l.id)}
                          className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <ChevronRight className={cn("h-3 w-3 transition-transform", isOpen && "rotate-90")} />
                          {changes.length} change{changes.length !== 1 ? "s" : ""}
                        </button>
                      )}
                    </div>
                    {(l.entityType || user?.roleName || user?.branchName) && (
                      <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
                        {l.entityType && <span className="font-medium text-foreground/70">{l.entityType}</span>}
                        {user?.roleName && <><span>·</span><span>{user.roleName}</span></>}
                        {user?.branchName && <><span>·</span><span>{user.branchName}</span></>}
                      </p>
                    )}
                    {l.entityId && (
                      <p className="text-[11px] text-muted-foreground font-mono">
                        <span className="text-foreground/80">{l.entityId.slice(0, 8)}…</span>
                        {l.notes && <span> · {l.notes}</span>}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      by{" "}
                      <span className="font-medium text-foreground/80">
                        {user?.fullName ?? (l.userId ? l.userId.slice(0, 8) : "System")}
                      </span>
                      {" · "}{dateStr}{" "}{timeStr}
                      <span className="ml-1.5 text-muted-foreground/60">({relTimeShort(l.createdAt)})</span>
                    </p>
                    {isOpen && changes.length > 0 && <ChangeList changes={changes} />}
                  </div>
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
