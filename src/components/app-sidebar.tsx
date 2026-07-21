import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useState, type ElementType } from "react";
import {
  LayoutDashboard,
  ScanBarcode,
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
  Warehouse,
  UserCog,
  ChevronDown,
  ClipboardCheck,
  Sliders,
  Lock,
  TicketPercent,
  Crown,
  Gauge,
  BarChart3,
  Briefcase,
  Radar,
  Cigarette,
  Tag,
  Undo2 as ReturnIcon,
  RotateCcw,
  History,
  FileCheck2,
  Workflow,
  Boxes,
  ClipboardList,
  ArrowLeftRight,
  PackageSearch,
  Building,
  IdCard,
  CalendarDays,
  Clock,
  Plane,
  Gift,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useAuth, ROLE_LABELS, type AppRole } from "@/lib/auth";
import { BaqalaLogo } from "./baqala-logo";
import { useI18n } from "@/lib/i18n";

type NavItem = {
  title: string;
  url: string;
  icon: ElementType;
  // module: checked against the live DB permission map (canView), including for tenant_admin —
  // no role bypass. Takes priority over roles.
  module?: string;
  // roles: fallback for items with no DB module (admin-only screens, POS terminal UI, etc.) —
  // these are gated by role only, so tenant_admin still sees them regardless of the permission map.
  roles?: AppRole[];
  // blockRoles: hide from these roles even if the DB grants canView=true.
  blockRoles?: AppRole[];
};

type NavGroup = { label: string; items: NavItem[] };

const navGroups: NavGroup[] = [
  {
    label: "Operate",
    items: [
      { title: "Dashboard",           url: "/dashboard",     icon: LayoutDashboard, module: "Dashboard" },
      { title: "POS Checkout",        url: "/pos",           icon: ScanBarcode,     module: "POS" },
      // { title: "Mobile POS & Kiosk",  url: "/mobile-pos",    icon: Smartphone,
      //   roles: ["tenant_admin","branch_manager"] },
      // { title: "MPOS App Preview",    url: "/mpos-app",      icon: Smartphone,
      //   roles: ["tenant_admin"] },
      { title: "Orders",              url: "/orders",        icon: ShoppingBag,    module: "Orders" },
      { title: "Customers",           url: "/customers",     icon: Users,          module: "Customers" },
      { title: "Cashier Workspace",   url: "/cashier",       icon: Briefcase,      module: "Cashier Workspace" },
      { title: "Cashier Shift",       url: "/cashier-shift", icon: ClipboardCheck, module: "Cashier Shifts", blockRoles: ["finance_user", "marketing_user"] },
      { title: "Control Tower",       url: "/control-tower", icon: Radar,          module: "Control Tower" },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Stocks",               url: "/stocks",          icon: Boxes,         module: "Stocks" },
      { title: "Inventory",            url: "/inventory",       icon: Package,       module: "Inventory" },
      // Gated on Inventory, matching PricingController — see the comment there on why price rules
      // deliberately don't get a permission module of their own.
      { title: "Pricing",              url: "/pricing",         icon: TicketPercent, module: "Inventory" },
      { title: "Expiry & Perishable",  url: "/batches",         icon: CalendarClock, module: "Batches" },
      { title: "Batch Tracking",       url: "/batch-tracking",  icon: PackageSearch, module: "Batches" },
      { title: "Warehouses",           url: "/warehouses",      icon: Warehouse,     module: "Warehouses" },
      { title: "Stock Transfers",      url: "/stock-transfers", icon: ArrowLeftRight, module: "Stock Transfers" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Expenses",                    url: "/expenses",        icon: Wallet,       module: "Accounting & Finance" },
      { title: "Purchase Orders",             url: "/purchase-orders", icon: ClipboardList, module: "Purchase Orders" },
      { title: "Coupons, Discounts & Offers", url: "/coupons",         icon: TicketPercent,  module: "Coupons" },
      { title: "Loyalty Program",             url: "/loyalty-program", icon: Gift,           module: "Loyalty Program" },
      { title: "Customer Returns",            url: "/returns",         icon: ReturnIcon,   module: "Returns" },
      { title: "Tax, Fees & Tobacco",         url: "/tax-fees",        icon: Cigarette,    module: "Tax & Fees" },
    ],
  },
  {
    label: "Suppliers",
    items: [
      { title: "Suppliers",              url: "/suppliers",         icon: Truck,       module: "Suppliers" },
      { title: "Supplier Returns (RTS)", url: "/supplier-returns",  icon: RotateCcw,   module: "Supplier Returns" },
    ],
  },
  {
    label: "Network",
    items: [
      { title: "Branches",  url: "/branches",  icon: Building2, module: "Branches" },
      { title: "Terminals", url: "/terminals", icon: Terminal,  module: "Terminals" },
      { title: "Devices",   url: "/devices",   icon: HardDrive, module: "Devices" },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Sales",                 url: "/sales",    icon: TrendingUp,   module: "Sales" },
      { title: "Reports",               url: "/reports",  icon: FileBarChart, module: "Reports" },
      { title: "KPI Evaluation",        url: "/kpi",      icon: Gauge,        module: "Reports" },
      { title: "Business Intelligence", url: "/bi",       icon: BarChart3,    module: "Reports" },
    ],
  },
  {
    label: "Human Resources",
    items: [
      { title: "Employees",    url: "/employees",    icon: Users,        module: "Employees" },
      { title: "Attendance",   url: "/hrm-attendance", icon: ClipboardCheck, module: "HR Attendance" },
      { title: "Shifts",       url: "/work-shifts",  icon: Clock,        module: "HR Shifts" },
      { title: "Leave Requests", url: "/leaves",     icon: Plane,        module: "Leave Management" },
      { title: "Payroll",      url: "/payroll",      icon: Wallet,       module: "Payroll" },
      { title: "Departments",  url: "/departments",  icon: Building,     module: "HR Master Data" },
      { title: "Designations", url: "/designations", icon: IdCard,       module: "HR Master Data" },
      { title: "Holidays",     url: "/holidays",      icon: CalendarDays,module: "HR Master Data" },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Admin Overview",         url: "/admin-overview", icon: LayoutDashboard, roles: ["tenant_admin"] },
      { title: "Categories",             url: "/categories",     icon: Tag,             roles: ["tenant_admin"] },
      { title: "Rules Engine",           url: "/rules",          icon: Workflow,    module: "Rules Engine" },
      { title: "Registered Users",       url: "/users",          icon: UserCog,     module: "Users" },
      { title: "Roles & Permissions",    url: "/roles",          icon: Lock,        module: "Roles" },
      // { title: "Staff & Roles",          url: "/staff",          icon: Users,       module: "Users" },
      { title: "Maintenance",            url: "/maintenance",    icon: Wrench,      roles: ["tenant_admin"] },
      { title: "ZATCA Invoices",         url: "/zatca",          icon: ReceiptText, module: "Compliance" },
      { title: "ZATCA Phase 2 Settings", url: "/zatca-settings", icon: FileCheck2,  module: "Compliance" },
      { title: "Compliance",             url: "/compliance",     icon: ShieldCheck, module: "Compliance" },
      { title: "POS Settings",           url: "/pos-settings",   icon: Sliders,     module: "Settings" },
      { title: "Audit Logs",             url: "/audit-logs",     icon: History,     module: "Audit Logs" },
      { title: "Plans & Pricing",        url: "/plans",          icon: Crown,       roles: ["tenant_admin"] },
      { title: "Settings",               url: "/settings",       icon: Settings,    module: "Settings" },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { t, dir } = useI18n();
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(navGroups.map((g) => [g.label, true])),
  );

  const canSee = (item: NavItem) => {
    // Explicit block overrides DB canView (e.g. finance_user on Cashier Shifts)
    if (item.blockRoles?.includes(user?.role as AppRole)) return false;
    // Module-based items: check the live permission map
    if (item.module) return user?.permissions?.[item.module]?.canView === true;
    // Role-only items (no module)
    if (!item.roles) return true;
    return !!user?.role && item.roles.includes(user.role as AppRole);
  };

  const handleLogout = () => {
    logout();
    navigate({ to: "/login", search: { redirect: "/" } });
  };

  return (
    <Sidebar collapsible="icon" side={dir === "rtl" ? "right" : "left"} className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border/50">
        {collapsed ? <BaqalaLogo showText={false} /> : <BaqalaLogo />}
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(canSee);
          if (visibleItems.length === 0) return null;
          const open = openGroups[group.label] ?? true;
          const groupHasActive = visibleItems.some(
            (it) => path === it.url || path.startsWith(it.url + "/"),
          );
          const renderItems = (
            <SidebarMenu>
              {visibleItems.map((item) => {
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
        <div className="w-full flex items-center gap-2.5 rounded-xl p-2 bg-sidebar-accent/40 hover:bg-sidebar-accent/60 transition-colors">
          <button
            onClick={() => navigate({ to: "/profile" })}
            className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
          >
            <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
              {user?.initials ?? "U"}
            </div>
            {!collapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold truncate">{user?.name ?? "User"}</p>
                <p className="text-[10px] text-sidebar-foreground/60 truncate">{user?.role ? t(ROLE_LABELS[user.role]) : "User"} · {user?.branch?.split(" — ")[1] ?? "HQ"}</p>
              </div>
            )}
          </button>
          {!collapsed && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button
                  title="Logout"
                  className="shrink-0 p-1.5 rounded-lg hover:bg-sidebar-accent transition-colors"
                >
                  <LogOut className="h-4 w-4 text-sidebar-foreground/60" />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Log out?</AlertDialogTitle>
                  <AlertDialogDescription>
                    You'll be signed out of this device. Any unsaved work in progress may be lost.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleLogout}>Log out</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
