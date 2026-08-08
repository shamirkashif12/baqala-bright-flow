import { Input } from "@/components/ui/input";

interface DateRangeFieldProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  className?: string;
  /** Optional contextual text shown before the inputs, e.g. "Joined:", "Expiry:". */
  prefixLabel?: string;
}

// Standard From/To control for every filter bar in the app — always a single-line pair with
// no "From"/"To" text on the inputs themselves, so every date filter looks the same regardless
// of what else sits in its row (labeled or unlabeled). The native <input type="date"> min/max
// attributes only grey out invalid dates in the calendar popup — they don't stop an out-of-range
// value reaching state (keyboard entry, autofill, programmatic sets all bypass them) — so this
// clamps the other bound on every change instead, guaranteeing from <= to always holds in state.
export function DateRangeField({
  from, to, onFromChange, onToChange, className = "h-9 w-40", prefixLabel,
}: DateRangeFieldProps) {
  function handleFromChange(value: string) {
    onFromChange(value);
    if (value && to && value > to) onToChange(value);
  }
  function handleToChange(value: string) {
    onToChange(value);
    if (value && from && value < from) onFromChange(value);
  }

  const titleBase = prefixLabel?.replace(/:$/, "");
  return (
    <div className="flex items-center gap-1.5">
      {prefixLabel && <span className="text-xs text-muted-foreground whitespace-nowrap">{prefixLabel}</span>}
      <Input type="date" value={from} max={to || undefined} onChange={(e) => handleFromChange(e.target.value)} className={className} title={titleBase ? `${titleBase} from` : "From"} />
      <span className="text-xs text-muted-foreground">–</span>
      <Input type="date" value={to} min={from || undefined} onChange={(e) => handleToChange(e.target.value)} className={className} title={titleBase ? `${titleBase} to` : "To"} />
    </div>
  );
}
