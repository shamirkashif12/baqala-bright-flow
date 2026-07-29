import { type CustomerTier } from "@/lib/api";

// Plain tier names — matched exactly by PriceResolutionService (never "and above"), so picking
// several here creates one price rule per tier, all at the same price. Shared by Inventory
// (Add/Edit Product tier price) and Pricing (New/Edit rule) so both present the same control
// instead of one being a multi-select chip row and the other a single "X and above" dropdown
// whose label contradicted the actual exact-match behavior.
export const TIER_OPTIONS: { value: CustomerTier; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "silver", label: "Silver" },
  { value: "gold", label: "Gold" },
  { value: "platinum", label: "Platinum" },
];

export function TierMultiSelect({ selected, onToggle }: { selected: CustomerTier[]; onToggle: (tier: CustomerTier) => void }) {
  return (
    <div className="flex rounded-lg border border-border/60 overflow-hidden shrink-0">
      {TIER_OPTIONS.map(({ value, label }) => (
        <button key={value} type="button" onClick={() => onToggle(value)}
          className={`px-3 py-1.5 text-xs transition-colors ${selected.includes(value) ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted/50"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}
