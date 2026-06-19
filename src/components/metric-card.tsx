import React from "react";
import { cn } from "@/lib/utils";
import { ArrowUpRight, ArrowDownRight, X, type LucideIcon } from "lucide-react";

export function MetricCard({
  label,
  value,
  delta,
  trend = "up",
  icon: Icon,
  hint,
  accent = "default",
  editing,
  onRemove,
}: {
  label: string;
  value: React.ReactNode;
  delta?: string;
  trend?: "up" | "down" | "flat";
  icon: LucideIcon;
  hint?: string;
  accent?: "default" | "primary" | "success" | "warning" | "destructive";
  editing?: boolean;
  onRemove?: () => void;
}) {
  const accentClasses: Record<string, string> = {
    default: "bg-muted text-foreground",
    primary: "gradient-primary text-primary-foreground",
    success: "bg-success/15 text-success",
    warning: "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <div className={cn(
      "group relative rounded-2xl border border-border/60 bg-card p-5 shadow-card hover:shadow-elegant transition-all overflow-hidden",
      editing && "ring-2 ring-primary/40 ring-offset-2 ring-offset-background animate-fade-in",
    )}>
      {editing && onRemove && (
        <button
          onClick={onRemove}
          className="absolute -top-2 -right-2 z-10 h-6 w-6 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-md hover:scale-110 transition-transform"
          aria-label="Remove card"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <div className="absolute -right-6 -top-6 h-24 w-24 rounded-full bg-primary/5 group-hover:bg-primary/10 transition-colors" />
      <div className="relative flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
          <p className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">{value}</p>
          {delta && (
            <div className="mt-2 flex items-center gap-1.5 text-xs">
              <span className={cn(
                "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold",
                trend === "up" && "bg-success/15 text-success",
                trend === "down" && "bg-destructive/15 text-destructive",
                trend === "flat" && "bg-muted text-muted-foreground",
              )}>
                {trend === "up" && <ArrowUpRight className="h-3 w-3" />}
                {trend === "down" && <ArrowDownRight className="h-3 w-3" />}
                {delta}
              </span>
              {hint && <span className="text-muted-foreground">{hint}</span>}
            </div>
          )}
        </div>
        <div className={cn("h-10 w-10 rounded-xl flex items-center justify-center", accentClasses[accent])}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

export function StatusDot({ status }: { status: "online" | "offline" | "warning" | "syncing" }) {
  const map = {
    online: "bg-success",
    offline: "bg-muted-foreground",
    warning: "bg-warning",
    syncing: "bg-primary animate-pulse",
  };
  return <span className={cn("inline-block h-2 w-2 rounded-full", map[status])} />;
}