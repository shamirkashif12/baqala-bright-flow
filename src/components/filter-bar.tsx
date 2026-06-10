import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, RotateCcw } from "lucide-react";

/**
 * Reusable filter bar used across modules.
 * - Search by item / name / id
 * - Branch picker
 * - Date range (Today / Yesterday / 7d / 30d / Custom)
 * - Day-of-week picker
 */
export const ALL_BRANCHES = ["All Branches", "Olaya — Riyadh", "Khobar — Eastern", "Jeddah — Western", "Madinah — Western"];
const RANGES = ["Today", "Yesterday", "Last 7 days", "Last 30 days", "Custom"];
const DAYS = ["Any day", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export type FilterState = {
  query: string;
  branch: string;
  range: string;
  day: string;
};

export function FilterBar({
  placeholder = "Search by item, SKU, customer…",
  onChange,
  showDay = true,
  extras,
}: {
  placeholder?: string;
  onChange?: (s: FilterState) => void;
  showDay?: boolean;
  extras?: React.ReactNode;
}) {
  const [state, setState] = useState<FilterState>({
    query: "", branch: ALL_BRANCHES[0], range: "Today", day: DAYS[0],
  });
  const update = (patch: Partial<FilterState>) => {
    const next = { ...state, ...patch };
    setState(next);
    onChange?.(next);
  };
  const reset = () => {
    const next = { query: "", branch: ALL_BRANCHES[0], range: "Today", day: DAYS[0] };
    setState(next);
    onChange?.(next);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border/60 bg-card p-2.5 shadow-card">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={state.query}
          onChange={(e) => update({ query: e.target.value })}
          placeholder={placeholder}
          className="pl-9 h-9 bg-background"
        />
      </div>
      <Select value={state.branch} onValueChange={(v) => update({ branch: v })}>
        <SelectTrigger className="h-9 w-[180px]"><SelectValue /></SelectTrigger>
        <SelectContent>{ALL_BRANCHES.map(b => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent>
      </Select>
      <Select value={state.range} onValueChange={(v) => update({ range: v })}>
        <SelectTrigger className="h-9 w-[140px]"><SelectValue /></SelectTrigger>
        <SelectContent>{RANGES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
      </Select>
      {showDay && (
        <Select value={state.day} onValueChange={(v) => update({ day: v })}>
          <SelectTrigger className="h-9 w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>{DAYS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
        </Select>
      )}
      {extras}
      <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 h-9">
        <RotateCcw className="h-3.5 w-3.5" /> Reset
      </Button>
    </div>
  );
}