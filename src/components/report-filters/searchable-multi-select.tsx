import { useMemo, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface SearchableMultiSelectProps {
  options: MultiSelectOption[];
  /** Empty array means "All" — matches the backend convention where an empty filter list applies no constraint. */
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

// Standard filter control for reports: searchable, multi-select, with Select All / Clear Selection.
// Used in place of a single-select shadcn <Select> everywhere a report filters by Branch, Warehouse,
// Product, Category, Employee, Supplier or Status, so every report's filter bar behaves identically.
export function SearchableMultiSelect({
  options, selected, onChange, placeholder = "All", searchPlaceholder = "Search…",
  emptyText = "No results.", className, disabled,
}: SearchableMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);

  const label = selected.length === 0
    ? placeholder
    : selected.length === options.length
      ? `All (${options.length})`
      : selected.length === 1
        ? (byId.get(selected[0])?.label ?? "1 selected")
        : `${selected.length} selected`;

  function toggle(id: string) {
    onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between font-normal px-3",
            selected.length === 0 && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <div className="flex items-center justify-between gap-2 border-b px-2 py-1.5">
            <button
              type="button"
              className="text-xs text-primary hover:underline disabled:opacity-50 disabled:no-underline"
              disabled={options.length === 0}
              onClick={() => onChange(options.map((o) => o.id))}
            >
              Select All
            </button>
            <button
              type="button"
              className="text-xs text-muted-foreground hover:underline disabled:opacity-50 disabled:no-underline"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
            >
              Clear Selection
            </button>
          </div>
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const on = selected.includes(o.id);
                return (
                  <CommandItem
                    key={o.id}
                    value={`${o.label} ${o.sublabel ?? ""}`}
                    onSelect={() => toggle(o.id)}
                  >
                    <span
                      className={cn(
                        "h-4 w-4 shrink-0 rounded border flex items-center justify-center",
                        on ? "bg-primary border-primary text-primary-foreground" : "border-border/60",
                      )}
                    >
                      {on && <Check className="h-3 w-3" />}
                    </span>
                    <span className="truncate">{o.label}</span>
                    {o.sublabel && <span className="ml-auto text-xs text-muted-foreground truncate">{o.sublabel}</span>}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// Serializes a multi-select id list onto URLSearchParams as repeated params (?key=a&key=b), the
// convention ASP.NET Core's [FromQuery] Guid[]/string[] model binding expects. Omitted entirely
// when empty, matching "no filter" rather than sending a param that resolves to an empty array.
export function appendMultiParam(params: URLSearchParams, key: string, ids: string[]) {
  for (const id of ids) params.append(key, id);
}
