import {
  Milk, CupSoda, Cookie, SprayCan, Croissant, Package, Wheat, Beef, Fish, Apple, ShoppingBasket,
  type LucideIcon,
} from "lucide-react";

// The public catalog has no real product photography to show, and hotlinking/fabricating stock
// photos of specific branded items isn't appropriate — this gives every category a distinct,
// deliberately-designed look instead of one repeated gray box, using assets this app already owns
// (lucide's icon set) rather than external images.
const CATEGORY_STYLES: Record<string, { icon: LucideIcon; light: string; dark: string }> = {
  dairy:       { icon: Milk,           light: "bg-blue-50 text-blue-500",     dark: "dark:bg-blue-500/10 dark:text-blue-400" },
  beverages:   { icon: CupSoda,        light: "bg-orange-50 text-orange-500", dark: "dark:bg-orange-500/10 dark:text-orange-400" },
  snacks:      { icon: Cookie,         light: "bg-pink-50 text-pink-500",     dark: "dark:bg-pink-500/10 dark:text-pink-400" },
  household:   { icon: SprayCan,       light: "bg-emerald-50 text-emerald-500", dark: "dark:bg-emerald-500/10 dark:text-emerald-400" },
  bakery:      { icon: Croissant,      light: "bg-amber-50 text-amber-500",   dark: "dark:bg-amber-500/10 dark:text-amber-400" },
  "packet food": { icon: Package,      light: "bg-violet-50 text-violet-500", dark: "dark:bg-violet-500/10 dark:text-violet-400" },
  pantry:      { icon: Wheat,          light: "bg-stone-100 text-stone-500",  dark: "dark:bg-stone-500/10 dark:text-stone-400" },
  meat:        { icon: Beef,           light: "bg-rose-50 text-rose-500",     dark: "dark:bg-rose-500/10 dark:text-rose-400" },
  seafood:     { icon: Fish,           light: "bg-cyan-50 text-cyan-500",     dark: "dark:bg-cyan-500/10 dark:text-cyan-400" },
  produce:     { icon: Apple,          light: "bg-green-50 text-green-500",   dark: "dark:bg-green-500/10 dark:text-green-400" },
};

const DEFAULT_STYLE = { icon: ShoppingBasket, light: "bg-slate-100 text-slate-500", dark: "dark:bg-slate-500/10 dark:text-slate-400" };

export function CategoryIllustration({ categoryName, className }: { categoryName?: string; className?: string }) {
  const style = (categoryName && CATEGORY_STYLES[categoryName.trim().toLowerCase()]) || DEFAULT_STYLE;
  const Icon = style.icon;
  return (
    <div className={`flex items-center justify-center ${style.light} ${style.dark} ${className ?? ""}`}>
      <Icon className="h-8 w-8 opacity-70" strokeWidth={1.5} />
    </div>
  );
}
