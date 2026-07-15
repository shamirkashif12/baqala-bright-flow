import { Bell, Search, HelpCircle, ChevronDown, Building2, X, BookOpen, MessageCircle, ExternalLink, CheckCheck, AlertTriangle, Package, WifiOff, RotateCcw, Truck, FileText, ShieldCheck, ShoppingCart, CreditCard, Tag, User as UserIcon, Trash2, Printer, Clock } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/language-switcher";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { useBranch } from "@/lib/branch-context";
import { useState, useEffect } from "react";
import { api, NOTIFICATION_CREATED_EVENT } from "@/lib/api";
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
// Every item here is a real /api/notifications row — there is no separate client-computed
// "live status" layer anymore. Low stock, out-of-stock, near-expiry, expired, and offline
// terminals are all scanned and persisted server-side (see api/Services/OperationalAlertsService
// and the discrete triggers wired into the relevant controllers), so this component's only job
// is fetch/display/mark-read against that single source of truth.
type NotifItem = {
  id: string;
  tone: "info" | "warning" | "error";
  Icon: React.FC<{ className?: string }>;
  title: string;
  body: string;
  relTime: string;
  isRead: boolean;
};

const TONE_DOT: Record<NotifItem["tone"], string> = {
  info: "bg-primary",
  warning: "bg-amber-500",
  error: "bg-destructive",
};

const CATEGORY_ICON: Record<string, React.FC<{ className?: string }>> = {
  "Sales / Checkout": ShoppingCart,
  "Payment": CreditCard,
  "Cashier Shift": AlertTriangle,
  "Inventory": Package,
  "Expiry / Perishable": Clock,
  "Wastage / Spoilage": Trash2,
  "Returns": RotateCcw,
  "Discounts / Coupons": Tag,
  "Customer / Loyalty": UserIcon,
  "Suppliers / Purchase Orders": Truck,
  "Tax / Fees / Tobacco": FileText,
  "ZATCA": FileText,
  "Hardware / Devices": Printer,
  "Terminal / Branch": WifiOff,
  "Admin / Security": ShieldCheck,
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function NotificationsPopover() {
  const [open, setOpen] = useState(false);
  const [persisted, setPersisted] = useState<NotifItem[]>([]);

  const loadPersisted = () => {
    api.getNotifications({ pageSize: 20 }).then(res => {
      setPersisted(res.items.map(n => ({
        id: n.id,
        tone: n.severity,
        Icon: CATEGORY_ICON[n.category] ?? AlertTriangle,
        title: n.title,
        body: n.message,
        relTime: relativeTime(n.createdAt),
        persisted: true,
        isRead: n.isRead,
      })));
    }).catch(() => {});
  };

  useEffect(() => {
    loadPersisted();
    const interval = setInterval(loadPersisted, 30000);
    // Backend/other-user-triggered notifications rely on the poll above, but a notification
    // caused by this user's own action (scan, checkout, hold, ...) should show up right away
    // rather than waiting up to 30s — api.notify() fires this event once its POST resolves.
    const onCreated = () => loadPersisted();
    window.addEventListener(NOTIFICATION_CREATED_EVENT, onCreated);
    return () => {
      clearInterval(interval);
      window.removeEventListener(NOTIFICATION_CREATED_EVENT, onCreated);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Read notifications drop out of the list entirely rather than staying dimmed — once you've
  // acted on/dismissed something, there's no reason for it to keep taking up space here.
  const notifications = persisted.filter(n => !n.isRead);
  const unread = notifications.length;

  const markAllRead = () => {
    api.markAllNotificationsRead().then(loadPersisted).catch(() => {});
  };

  const markOneRead = (item: NotifItem) => {
    setPersisted(prev => prev.map(n => n.id === item.id ? { ...n, isRead: true } : n));
    api.markNotificationRead(item.id).catch(() => {});
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-9 w-9 relative">
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute top-1.5 right-1.5 h-4 min-w-4 rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold flex items-center justify-center px-0.5">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/60">
          <p className="text-sm font-semibold">Notifications {unread > 0 && <span className="ml-1 text-[10px] font-bold text-destructive">{unread} new</span>}</p>
          <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="divide-y divide-border/40 max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">All clear — no alerts right now</div>
          ) : (
            notifications.map(n => (
              <button
                key={n.id}
                onClick={() => markOneRead(n)}
                title="Click to mark as read"
                className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-muted/40 transition-colors"
              >
                <div className={`h-2 w-2 rounded-full mt-2 shrink-0 ${TONE_DOT[n.tone]}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{n.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">{n.relTime}</p>
                </div>
                <n.Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${n.tone === "error" ? "text-destructive" : n.tone === "warning" ? "text-amber-500" : "text-primary"}`} />
              </button>
            ))
          )}
        </div>
        <div className="flex items-center justify-center py-2.5 border-t border-border/60">
          <button onClick={markAllRead} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
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
  const { dir, t } = useI18n();
  const rtl = dir === "rtl";

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/80 backdrop-blur-xl px-4 md:px-6">
      <SidebarTrigger />
      <div className="flex-1 min-w-0">
        <h1 className="text-lg md:text-xl font-bold tracking-tight truncate">{t(title)}</h1>
        {subtitle && <p className="text-xs text-muted-foreground truncate">{t(subtitle)}</p>}
      </div>
      <div className="hidden md:flex items-center gap-2 relative w-72">
        <Search className={`h-4 w-4 absolute ${rtl ? "right-3" : "left-3"} text-muted-foreground pointer-events-none`} />
        <Input
          placeholder={t("Search products, SKU, invoices…")}
          className={`h-9 bg-muted/50 border-transparent focus-visible:bg-card focus-visible:border-border/60 ${rtl ? "pr-9 text-right" : "pl-9"}`}
        />
      </div>
      <LanguageSwitcher />
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
