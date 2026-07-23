import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { excludeDisabledBranches, type Branch } from "@/lib/api";

interface BranchFilterProps {
  branches: Branch[];
  value: string;
  onChange: (branchId: string) => void;
  /** Non-admins: renders the same control, disabled, showing only their assigned branch. */
  locked?: boolean;
  /** Include an "All Branches" option — only valid for list/report-style pages, never for single-branch-required pages. */
  allowAll?: boolean;
  className?: string;
}

export function BranchFilter({ branches, value, onChange, locked, allowAll, className }: BranchFilterProps) {
  return (
    <Select value={value} onValueChange={onChange} disabled={locked}>
      <SelectTrigger className={cn("h-9 w-[180px]", className)}>
        <SelectValue placeholder="Branch" />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value="all">All Branches</SelectItem>}
        {excludeDisabledBranches(branches).map((b) => (
          <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
