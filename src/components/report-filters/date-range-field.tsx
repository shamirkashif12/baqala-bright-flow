import { Input } from "@/components/ui/input";
import { FilterField } from "@/components/module-placeholder";

interface DateRangeFieldProps {
  from: string;
  to: string;
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
}

// Standard From/To control for every report filter bar. The native <input type="date"> min/max
// attributes only grey out invalid dates in the calendar popup — they don't stop an out-of-range
// value reaching state (keyboard entry, autofill, programmatic sets all bypass them) — so this
// clamps the other bound on every change instead, guaranteeing from <= to always holds in state.
export function DateRangeField({
  from, to, onFromChange, onToChange, fromLabel = "From", toLabel = "To", className = "h-9 w-40",
}: DateRangeFieldProps) {
  function handleFromChange(value: string) {
    onFromChange(value);
    if (value && to && value > to) onToChange(value);
  }
  function handleToChange(value: string) {
    onToChange(value);
    if (value && from && value < from) onFromChange(value);
  }

  return (
    <>
      <FilterField label={fromLabel}>
        <Input type="date" value={from} max={to || undefined} onChange={(e) => handleFromChange(e.target.value)} className={className} />
      </FilterField>
      <FilterField label={toLabel}>
        <Input type="date" value={to} min={from || undefined} onChange={(e) => handleToChange(e.target.value)} className={className} />
      </FilterField>
    </>
  );
}
