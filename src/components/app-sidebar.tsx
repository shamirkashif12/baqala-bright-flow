import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  LayoutDashboard,
  ScanBarcode,
  Smartphone,
  Package,
  CalendarClock,
  Truck,
  Building2,
  Terminal,
  HardDrive,
  TrendingUp,
  FileBarChart,
  Users,
  Wrench,
  ReceiptText,
  Settings,
  ShieldCheck,
  LogOut,
  ShoppingBag,
  Wallet,
  Tags,
  Warehouse,
  Store,
  Activity,
  UserCog,
  ChevronDown,
  ClipboardCheck,
  Sliders,
  Lock,
  TicketPercent,
  Undo2,
  Crown,
  Gauge,
  BarChart3,
  Briefcase,
  Radar,
  Cigarette,
  Undo2 as ReturnIcon,
  History,
  FileCheck2,
  Coins,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/lib/auth";
import { BaqalaLogo } from "./baqala-logo";
import { useI18n } from "@/lib/i18n";

const navGroups = [
  {
    label: "Operate",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "POS Checkout", url: "/pos", icon: ScanBarcode },
      { title: "Mobile POS & Kiosk", url: "/mobile-pos", icon: Smartphone },
      { title: "Orders", url: "/orders", icon: ShoppingBag },
      { title: "Cashier Workspace", url: "/cashier", icon: Briefcase },
      { title: "Cashier Shift", url: "/cashier-shift", icon: ClipboardCheck },
      { title: "Terminal Sessions", url: "/terminal-sessions", icon: Terminal },
      { title: "Control Tower", url: "/control-tower", icon: Radar },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Inventory", url: "/inventory", icon: Package },
      { title: "Expiry & Permissible", url: "/batches", icon: CalendarClock },
      { title: "Warehouses", url: "/warehouses", icon: Warehouse },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Expenses", url: "/expenses", icon: Wallet },
      { title: "Expense Types", url: "/expense-types", icon: Tags },
      { title: "Coupons & Discounts", url: "/coupons", icon: TicketPercent },
      { title: "Refunds", url: "/refunds", icon: Undo2 },
      { title: "Customer Returns", url: "/returns", icon: ReturnIcon },
      { title: "Tax, Fees & Tobacco", url: "/tax-fees", icon: Cigarette },
      { title: "Tax & Fee Reports", url: "/tax-reports", icon: Coins },
    ],
  },
  {
    label: "Suppliers",
    items: [
      { title: "Suppliers", url: "/suppliers", icon: Truck },
      { title: "Warehouse Suppliers", url: "/warehouse-suppliers", icon: Warehouse },
      { title: "Mart-to-Mart", url: "/mart-suppliers", icon: Store },
    ],
  },
  {
    label: "Network",
    items: [
      { title: "Branches", url: "/branches", icon: Building2 },
      { title: "Terminals", url: "/terminals", icon: Terminal },
      { title: "Devices", url: "/devices", icon: HardDrive },
      { title: "Device Behavior", url: "/device-behavior", icon: Activity },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Sales", url: "/sales", icon: TrendingUp },
      { title: "Reports", url: "/reports", icon: FileBarChart },
      { title: "KPI Evaluation", url: "/kpi", icon: Gauge },
      { title: "Business Intelligence", url: "/bi", icon: BarChart3 },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Registered Users", url: "/users", icon: UserCog },
      { title: "Roles & Permissions", url: "/roles", icon: Lock },
      { title: "Staff & Roles", url: "/staff", icon: Users },
      { title: "Maintenance", url: "/maintenance", icon: Wrench },
      { title: "ZATCA Invoices", url: "/zatca", icon: ReceiptText },
      { title: "ZATCA Phase 2 Settings", url: "/zatca-settings", icon: FileCheck2 },
      { title: "Compliance", url: "/compliance", icon: ShieldCheck },
      { title: "POS Settings", url: "/pos-settings", icon: Sliders },
      { title: "Audit Logs", url: "/audit-logs", icon: History },
      { title: "Plans & Pricing", url: "/plans", icon: Crown },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t } = useI18n();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.map((g) => [g.label, true])),
  );

  const handleLogout = () => {
    logout();
    navigate({ to: "/login", search: { redirect: "/" } });
  };

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border/50">
        {collapsed ? <BaqalaLogo showText={false} /> : <BaqalaLogo />}
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        {navGroups.map((group) => {
          const open = openGroups[group.label] ?? true;
          const groupHasActive = group.items.some(
            (it) => path === it.url || path.startsWith(it.url + "/"),
          );
          const renderItems = (
            <SidebarMenu>
              {group.items.map((item) => {
                const active = path === item.url || path.startsWith(item.url + "/");
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-glow data-[active=true]:font-semibold rounded-xl h-10"
                    >
                      <Link to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{t(item.title)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          );
          if (collapsed) {
            return (
              <SidebarGroup key={group.label}>
                <SidebarGroupContent>{renderItems}</SidebarGroupContent>
              </SidebarGroup>
            );
          }
          return (
            <SidebarGroup key={group.label}>
              <Collapsible
                open={open || groupHasActive}
                onOpenChange={(v) => setOpenGroups((s) => ({ ...s, [group.label]: v }))}
              >
                <CollapsibleTrigger asChild>
                  <button className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
                    <span>{t(group.label)}</span>
                    <ChevronDown
                      className={`h-3.5 w-3.5 transition-transform ${open ? "" : "-rotate-90"}`}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <SidebarGroupContent>{renderItems}</SidebarGroupContent>
                </CollapsibleContent>
              </Collapsible>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border/50">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2.5 rounded-xl p-2 bg-sidebar-accent/40 hover:bg-sidebar-accent/60 transition-colors text-left"
        >
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
            {user?.initials ?? "U"}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{user?.name ?? "User"}</p>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">{user?.role === "owner" ? t("Owner") : user?.role === "manager" ? t("Manager") : t("Cashier")} · {user?.branch?.split(" — ")[1] ?? "HQ"}</p>
            </div>
          )}
          {!collapsed && <LogOut className="h-4 w-4 text-sidebar-foreground/60" />}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
