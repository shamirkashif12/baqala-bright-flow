import { Badge } from "@/components/ui/badge";
import type { ProductPerformanceTier } from "@/lib/api";
import { Sparkles, TrendingUp, Minus, TrendingDown, PackageX } from "lucide-react";

// Shared with the Product Performance report so a product's tier always looks identical wherever
// it's shown (Inventory Aging's per-row Status column and KPI tiles included).
export const TIER_META: Record<ProductPerformanceTier, { className: string; icon: typeof Sparkles }> = {
  "Star Products": { className: "bg-emerald-100 text-emerald-700 border-emerald-300", icon: Sparkles },
  "High Performers": { className: "bg-blue-100 text-blue-700 border-blue-300", icon: TrendingUp },
  "Average Performers": { className: "bg-slate-100 text-slate-700 border-slate-300", icon: Minus },
  "Slow Moving Products": { className: "bg-amber-100 text-amber-700 border-amber-300", icon: TrendingDown },
  "Dead Stock": { className: "bg-red-100 text-red-700 border-red-300", icon: PackageX },
};

export function PerformanceTierBadge({ tier }: { tier: ProductPerformanceTier }) {
  const meta = TIER_META[tier];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={`text-[11px] gap-1 ${meta.className}`}>
      <Icon className="h-3 w-3" /> {tier}
    </Badge>
  );
}
