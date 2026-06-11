import { Bell, Search, Languages, HelpCircle, ChevronDown } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

export function AppTopbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const { lang, toggle, t } = useI18n();
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur-xl px-4 md:px-6">
      <SidebarTrigger />
      <div className="flex-1 min-w-0">
        <h1 className="text-lg md:text-xl font-bold tracking-tight truncate">{t(title)}</h1>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{t(subtitle)}</p>}
      </div>
      <div className="hidden md:flex items-center gap-2 relative w-72">
        <Search className={`h-4 w-4 absolute ${lang === "ar" ? "right-3" : "left-3"} text-muted-foreground`} />
        <Input
          placeholder={t("Search products, SKU, invoices…")}
          className={`h-9 bg-muted/50 border-transparent focus-visible:bg-card ${lang === "ar" ? "pr-9 text-right" : "pl-9"}`}
        />
      </div>
      <Button
        variant="outline"
        size="sm"
        className="gap-1.5 h-9"
        onClick={toggle}
        aria-label="Toggle language"
        title={lang === "en" ? "العربية" : "English"}
      >
        <Languages className="h-4 w-4" />
        <span className="hidden sm:inline font-semibold">{lang === "en" ? "EN" : "AR"}</span>
        <span className="hidden md:inline text-xs text-muted-foreground">
          {lang === "en" ? "· العربية" : "· English"}
        </span>
      </Button>
      <Button variant="ghost" size="icon" className="h-9 w-9 relative">
        <Bell className="h-4 w-4" />
        <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
      </Button>
      <Button variant="ghost" size="icon" className="h-9 w-9 hidden md:inline-flex">
        <HelpCircle className="h-4 w-4" />
      </Button>
      <Button variant="outline" size="sm" className="gap-2 h-9 hidden md:inline-flex">
        <span className="h-2 w-2 rounded-full bg-success animate-pulse" />
        {t("Riyadh — Olaya Branch")}
        <ChevronDown className="h-3.5 w-3.5" />
      </Button>
    </header>
  );
}

export function PageShell({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      <AppTopbar title={title} subtitle={subtitle} />
      <div className="px-4 md:px-6 py-6 space-y-6">
        {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
        {children}
      </div>
    </>
  );
}