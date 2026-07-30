import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchableSelectOption {
  id: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  className?: string;
  disabled?: boolean;
}

// Single-select counterpart to SearchableMultiSelect — a search box built into the dropdown itself,
// not a separate filter field stacked above a plain <Select>. Use this anywhere a long option list
// (products, suppliers, employees, etc.) needs to be searched, instead of pairing a <Select> with
// its own standalone search <Input>.
export function SearchableSelect({
  options, value, onChange, placeholder = "Select…", searchPlaceholder = "Search…",
  emptyText = "No results.", className, disabled,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "h-9 w-full justify-between font-normal px-3",
            !selected && "text-muted-foreground",
            className,
          )}
        >
          <span className="truncate">{selected ? selected.label : placeholder}</span>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {options.map((o) => {
                const on = o.id === value;
                return (
                  <CommandItem
                    key={o.id}
                    value={`${o.label} ${o.sublabel ?? ""}`}
                    onSelect={() => { onChange(o.id); setOpen(false); }}
                  >
                    <span
                      className={cn(
                        "h-4 w-4 shrink-0 rounded-full border flex items-center justify-center",
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
