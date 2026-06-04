import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from "@/components/ui/dialog";
import { Settings2, RotateCcw, Check } from "lucide-react";

/**
 * Reusable hook for customizable card sets.
 * Persists the user's visible-card selection in localStorage and provides
 * an edit-mode toggle plus an "Add / Remove" dialog UI.
 */
export function useCustomizableCards(storageKey: string, allLabels: string[]) {
  const [editing, setEditing] = useState(false);
  const [open, setOpen] = useState(false);
  const [visible, setVisible] = useState<string[]>(allLabels);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as string[];
        // keep only labels that still exist
        setVisible(parsed.filter((l) => allLabels.includes(l)));
      }
    } catch {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  const persist = (next: string[]) => {
    setVisible(next);
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch {}
  };
  const toggle = (label: string) =>
    persist(visible.includes(label) ? visible.filter((l) => l !== label) : [...visible, label]);
  const remove = (label: string) => persist(visible.filter((l) => l !== label));
  const reset = () => persist(allLabels);
  const isVisible = (label: string) => visible.includes(label);

  const Controls = (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        variant={editing ? "default" : "outline"}
        onClick={() => setEditing((v) => !v)}
        className="gap-1.5"
      >
        {editing ? <><Check className="h-3.5 w-3.5" />Done</> : <><Settings2 className="h-3.5 w-3.5" />Customize</>}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button size="sm" variant="outline" className="gap-1.5">Add / Remove</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Customize cards</DialogTitle>
            <DialogDescription>Toggle which cards appear on this page. Saved on this device.</DialogDescription>
          </DialogHeader>
          <div className="grid sm:grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
            {allLabels.map((label) => (
              <label
                key={label}
                className="flex items-center gap-2.5 rounded-lg border border-border/60 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
              >
                <Checkbox checked={visible.includes(label)} onCheckedChange={() => toggle(label)} />
                <span className="text-sm">{label}</span>
              </label>
            ))}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5">
              <RotateCcw className="h-3.5 w-3.5" />Reset all
            </Button>
            <Button size="sm" onClick={() => setOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  return { editing, visible, isVisible, remove, reset, toggle, Controls };
}