import { Bell, Search, Languages, HelpCircle, ChevronDown, Building2, X, BookOpen, MessageCircle, ExternalLink, CheckCheck } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

// ── Notifications popover ──────────────────────────────────────────────────────
function NotificationsPopover() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className="h-4 w-4" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-destructive" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <p className="text-sm font-semibold">Notifications</p>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="divide-y divide-border/40">
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="h-2 w-2 rounded-full bg-primary mt-2 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Low stock alert</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">3 products are below reorder level at Al Khobar Corniche</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">Just now</p>
            </div>
          </div>
          <div className="flex items-start gap-3 px-4 py-3">
            <div className="h-2 w-2 rounded-full bg-amber-500 mt-2 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium">Pending return</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">A customer return requires your review and approval</p>
              <p className="text-[10px] text-muted-foreground/70 mt-1">5 minutes ago</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-center py-2.5 border-t border-border/60">
          <button className="flex items-center gap-1.5 text-xs text-primary hover:underline">
            <CheckCheck className="h-3.5 w-3.5" /> Mark all as read
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Help popover ───────────────────────────────────────────────────────────────
function HelpPopover() {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 hidden md:inline-flex">
          <HelpCircle className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <p className="text-sm font-semibold">Help & Resources</p>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="p-2 space-y-0.5">
          <a
            href="#"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-sm transition-colors"
          >
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="font-medium text-sm">Documentation</p>
              <p className="text-[11px] text-muted-foreground">Guides and reference</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
          </a>
          <a
            href="#"
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted/60 text-sm transition-colors"
          >
            <MessageCircle className="h-4 w-4 text-primary shrink-0" />
            <div>
              <p className="font-medium text-sm">Contact Support</p>
              <p className="text-[11px] text-muted-foreground">support@baqala.sa</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto" />
          </a>
        </div>
        <div className="px-4 py-2.5 border-t border-border/60 bg-muted/30">
          <p className="text-[10px] text-muted-foreground">Baqalah POS · Version 2.0</p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Branch dropdown (tenant_admin only) ────────────────────────────────────────
function BranchDropdown() {
  const { user } = useAuth();
  const { branches, selectedBranch, setSelectedBranch } = useBranch();

  // Non-admin users see a read-only badge of their assigned branch
  if (user?.role !== "tenant_admin") {
    if (!selectedBranch) return null;
    return (
      <div className="hidden md:flex items-center gap-2 h-9 px-3 rounded-md border border-border/60 bg-background text-sm">
        <span className="h-2 w-2 rounded-full bg-success animate-pulse shrink-0" />
        <span className="max-w-[140px] truncate">{selectedBranch.name}</span>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 h-9 hidden md:inline-flex max-w-[200px]">
          <span className="h-2 w-2 rounded-full bg-success animate-pulse shrink-0" />
          <span className="truncate">{selectedBranch?.name ?? "Select branch"}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-primary" /> Switch Branch
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {branches.length === 0 && (
          <div className="px-3 py-2 text-xs text-muted-foreground">No branches found</div>
        )}
        {branches.map((branch) => (
          <DropdownMenuItem
            key={branch.id}
            onSelect={() => setSelectedBranch(branch)}
            className="flex items-center gap-2 cursor-pointer"
          >
            <span
              className={`h-2 w-2 rounded-full shrink-0 ${
                branch.status === "active" ? "bg-success" : "bg-muted-foreground"
              }`}
            />
            <span className="flex-1 truncate">{branch.name}</span>
            {selectedBranch?.id === branch.id && (
              <span className="text-[10px] text-primary font-semibold">Active</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Topbar ─────────────────────────────────────────────────────────────────────
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
        <Search className={`h-4 w-4 absolute ${lang === "ar" ? "right-3" : "left-3"} text-muted-foreground pointer-events-none`} />
        <Input
          placeholder={t("Search products, SKU, invoices…")}
          className={`h-9 bg-muted/50 border-transparent focus-visible:bg-card focus-visible:border-border/60 ${lang === "ar" ? "pr-9 text-right" : "pl-9"}`}
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
      <NotificationsPopover />
      <HelpPopover />
      <BranchDropdown />
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
