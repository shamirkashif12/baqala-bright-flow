import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type ElementType } from "react";
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
  CalendarCheck2,
  AlarmClockOff,
  Gavel,
  Percent,
  CreditCard,
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
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
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
import { UpgradeModal } from "./upgrade-modal";

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
  // children: renders a small dropdown next to the item linking to related pages
  // (used for grouping, e.g. Customers & Loyalty → Coupons/Loyalty Program).
  children?: { title: string; url: string; tab?: "coupons" | "discounts" | "offers" }[];
  // tab: ties this item's own link/highlight to a `?tab=` value on a page whose content is split
  // into sub-views by a Tabs component (e.g. Promotions/Coupons/Discounts all live on /coupons).
  // Safe to pair with `children` here specifically because every entry shares the same module gate
  // ("Coupons") — unlike the old Customers & Loyalty children (see note above), nothing here needs
  // its own permission check that `children` would bypass.
  tab?: "coupons" | "discounts" | "offers";
  // planFeature: gated on the tenant's provisioned plan (see src/lib/use-plan-feature.ts) — an
  // independent dimension from `module`/`roles` above, driven entirely by whatever the Tenant
  // Admin Dashboard's provisioning payload includes for this key (no fixed tier association is
  // hardcoded here). When present and the plan doesn't include it, the item still renders (not
  // hidden) but locked, opening the upgrade modal instead of navigating.
  planFeature?: string;
};

type NavGroup = { label: string; items: NavItem[] };

const isActiveUrl = (path: string, url: string) => path === url || path.startsWith(url + "/");

// The group whose page we're currently on — the only one that starts expanded. Picks the
// longest (most specific) matching item url across every group, not just the first group
// declared — otherwise a path like /reports/hrm-attendance matches both Human Resources'
// "Attendance Report" (/reports/hrm-attendance, exact) and Insights' "Reports" (/reports, a
// prefix match via isActiveUrl's trailing "/"), and whichever group is declared first in
// navGroups would always win regardless of which link actually points at this page.
const activeGroupLabel = (path: string) => {
  let bestLabel = "";
  let bestUrlLength = -1;
  for (const g of navGroups) {
    for (const it of g.items) {
      if (isActiveUrl(path, it.url) && it.url.length > bestUrlLength) {
        bestUrlLength = it.url.length;
        bestLabel = g.label;
      }
    }
  }
  return bestLabel;
};

// A parent item (e.g. Customers & Loyalty) expands only when we're on it or one of its sub-pages.
const activeParentUrl = (path: string) =>
  navGroups
    .flatMap((g) => g.items)
    .find(
      (it) =>
        it.children &&
        (isActiveUrl(path, it.url) || it.children.some((c) => isActiveUrl(path, c.url))),
    )?.url ?? "";

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
      { title: "Cashier Workspace",   url: "/cashier",       icon: Briefcase,      module: "Cashier Workspace" },
      { title: "Cashier Shift",       url: "/cashier-shift", icon: ClipboardCheck, module: "Cashier Shifts", blockRoles: ["finance_user", "marketing_user"] },
      { title: "Control Tower",       url: "/control-tower", icon: Radar,          module: "Control Tower", planFeature: "control_tower_approval_centre" },
      { title: "Approval Centre",     url: "/reports/approval-center", icon: Gavel, module: "Reports", planFeature: "control_tower_approval_centre" },
      // No longer a children/dropdown item — it was the only sidebar entry using that nested
      // pattern, its children bypassed canSee's permission gating entirely (NavItem.children has
      // no module/roles field), and both children pointed at routes that already have their own
      // standalone Finance-group entries below ("Coupons, Discounts & Offers", "Loyalty Program"),
      // so every role saw each of those two pages listed twice under two different labels.
      { title: "Customers",           url: "/customers",     icon: Users,          module: "Customers" },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Stocks",               url: "/stocks",          icon: Boxes,         module: "Stocks" },
      // The counting tool has always existed as a tab inside /stocks; it needed a front door of
      // its own under the name the business actually uses for it.
      { title: "Stocktaking",          url: "/stocktaking",     icon: ClipboardCheck, module: "Stocks", planFeature: "stocktaking" },
      { title: "Inventory",            url: "/inventory",       icon: Package,       module: "Inventory" },
      // Gated on Inventory, matching PricingController — see the comment there on why price rules
      // deliberately don't get a permission module of their own.
      { title: "Pricing",              url: "/pricing",         icon: TicketPercent, module: "Inventory", planFeature: "pricing_promotions" },
      { title: "Expiry & Perishable",  url: "/batches",         icon: CalendarClock, module: "Batches", planFeature: "batch_tracking" },
      { title: "Batch Tracking",       url: "/batch-tracking",  icon: PackageSearch, module: "Batches", planFeature: "batch_tracking" },
      { title: "Warehouses",           url: "/warehouses",      icon: Warehouse,     module: "Warehouses", planFeature: "warehouse_management" },
      { title: "Stock Transfers",      url: "/stock-transfers", icon: ArrowLeftRight, module: "Stock Transfers" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Expenses",                    url: "/expenses",        icon: Wallet,       module: "Accounting & Finance" },
      { title: "Purchase Orders",             url: "/purchase-orders", icon: ClipboardList, module: "Purchase Orders", planFeature: "purchase_orders" },
      // No `tab` here — Promotions is just the section's parent link now that Offers has its own
      // child row below, so it stays highlighted for the whole section instead of only for Offers.
      { title: "Promotions",                  url: "/coupons",         icon: TicketPercent,  module: "Coupons",
        planFeature: "pricing_promotions",
        children: [
          { title: "Coupons",   url: "/coupons", tab: "coupons" },
          { title: "Discounts", url: "/coupons", tab: "discounts" },
          { title: "Offers",    url: "/coupons", tab: "offers" },
        ] },
      { title: "Loyalty Program",             url: "/loyalty-program", icon: Gift,           module: "Loyalty Program" },
      { title: "Customer Returns",            url: "/returns",         icon: ReturnIcon,   module: "Returns" },
      { title: "Tax, Fees & Tobacco",         url: "/tax-fees",        icon: Cigarette,    module: "Tax & Fees" },
      { title: "Service Charges",             url: "/service-charges", icon: Percent,      module: "Tax & Fees" },
    ],
  },
  {
    label: "Suppliers",
    items: [
      { title: "Suppliers",              url: "/suppliers",         icon: Truck,       module: "Suppliers" },
      { title: "Supplier Returns (RTS)", url: "/supplier-returns",  icon: RotateCcw,   module: "Supplier Returns", planFeature: "supplier_returns" },
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
      { title: "KPI Evaluation",        url: "/kpi",      icon: Gauge,        module: "Reports", planFeature: "kpi_bi" },
      { title: "Business Intelligence", url: "/bi",       icon: BarChart3,    module: "Reports", planFeature: "kpi_bi" },
    ],
  },
  {
    label: "Human Resources",
    items: [
      // Employees itself stays unlocked — every login requires a linked Employee record
      // (UsersController.Create), so the plain directory is load-bearing for Basic's own
      // "Users & Staff Accounts" feature. Everything else in this group is genuine HRM.
      { title: "Employees",    url: "/employees",    icon: Users,        module: "Employees" },
      { title: "Attendance",   url: "/hrm-attendance", icon: ClipboardCheck, module: "HR Attendance", planFeature: "employee_shift_management" },
      { title: "Shifts",       url: "/work-shifts",  icon: Clock,        module: "HR Shifts", planFeature: "employee_shift_management" },
      { title: "Leave Requests", url: "/leaves",     icon: Plane,        module: "Leave Management", planFeature: "employee_shift_management" },
      { title: "Departments",  url: "/departments",  icon: Building,     module: "HR Master Data" },
      { title: "Designations", url: "/designations", icon: IdCard,       module: "HR Master Data" },
      { title: "Holidays",     url: "/holidays",      icon: CalendarDays,module: "HR Master Data" },
      // Gated on their own HR module (not "Reports") so a Branch Manager/Supervisor who already
      // manages attendance/shifts day-to-day can reach these reports without a separate Reports
      // grant — mirrors the backend gate on HrReportsController.
      { title: "Attendance Report",     url: "/reports/hrm-attendance",     icon: CalendarCheck2, module: "HR Attendance", planFeature: "employee_shift_management" },
      { title: "Shift Closing Report",  url: "/reports/shift-closing",      icon: AlarmClockOff,  module: "HR Shifts", planFeature: "employee_shift_management" },
      // Deliberately gated on "Audit Logs", not "Reports" like its siblings above — FRD 3/16
      // scope this report's user stories to admin/auditor only (EAR-01..05), unlike Attendance/
      // Shift Closing Report which Branch Manager and Supervisor are explicitly entitled to.
      { title: "Employee Activity Report", url: "/reports/employee-activity", icon: History,      module: "Audit Logs" },
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
      { title: "ZATCA Invoices",         url: "/zatca",          icon: ReceiptText, module: "Compliance", planFeature: "zatca_compliance" },
      { title: "ZATCA Phase 2 Settings", url: "/zatca-settings", icon: FileCheck2,  module: "Compliance", planFeature: "zatca_compliance" },
      { title: "Compliance",             url: "/compliance",     icon: ShieldCheck, module: "Compliance", planFeature: "zatca_compliance" },
      { title: "General Settings",       url: "/pos-settings",   icon: Sliders,     module: "Settings" },
      { title: "Payments",               url: "/payments",       icon: CreditCard,  module: "Settings" },
      { title: "Audit Logs",             url: "/audit-logs",     icon: History,     module: "Audit Logs" },
      { title: "Plans & Pricing",        url: "/plans",          icon: Crown,       roles: ["tenant_admin"] },
      { title: "Business & Security Settings", url: "/settings", icon: Settings,    module: "Settings" },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const currentTab = useRouterState({ select: (s) => (s.location.search as { tab?: string }).tab });
  const navigate = useNavigate();
  const { user, logout, isFeatureEnabled } = useAuth();
  const { t, dir } = useI18n();
  // Everything starts collapsed except the group holding the page we landed on.
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => ({
    [activeGroupLabel(path)]: true,
  }));
  const [openItems, setOpenItems] = useState<Record<string, boolean>>(() => ({
    [activeParentUrl(path)]: true,
  }));
  const [upgradeModal, setUpgradeModal] = useState<{ feature: string } | null>(null);

  // On every navigation, re-collapse the sidebar down to just the branch we're on.
  useEffect(() => {
    setOpenGroups({ [activeGroupLabel(path)]: true });
    setOpenItems({ [activeParentUrl(path)]: true });
  }, [path]);

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
      <SidebarHeader className="p-4 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:py-3 border-b border-sidebar-border/50 bg-white items-center">
        {collapsed ? <BaqalaLogo showText={false} /> : <BaqalaLogo />}
      </SidebarHeader>
      <SidebarContent className="px-2 py-3" data-tour="sidebar-nav">
        {navGroups.map((group) => {
          const visibleItems = group.items.filter(canSee);
          if (visibleItems.length === 0) return null;
          const open = openGroups[group.label] ?? false;
          const renderItems = (
            <SidebarMenu>
              {visibleItems.map((item) => {
                // Plain items (no `tab`) match on path alone; tab-bound items (Promotions/Coupons/
                // Discounts, all on /coupons) also need the current `?tab=` to line up, defaulting
                // to "offers" so the bare "/coupons" URL still highlights Promotions correctly.
                const active = isActiveUrl(path, item.url) && (item.tab === undefined || (currentTab ?? "offers") === item.tab);
                const itemOpen = openItems[item.url] ?? false;
                const locked = !!item.planFeature && !isFeatureEnabled(item.planFeature);
                if (locked) {
                  // Still shown (not hidden like canSee's DB-permission gate above) so the tenant
                  // can see what they're missing — greyed out, no navigation, opens the upgrade
                  // modal instead. Children (e.g. Promotions' Coupons/Discounts/Offers tabs) don't
                  // render at all in this state, same as if the item had none.
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        className="rounded-xl h-9 text-[13px] text-sidebar-foreground/40 cursor-pointer hover:bg-sidebar-accent/30"
                        onClick={() => setUpgradeModal({ feature: item.title })}
                      >
                        <item.icon className="h-4 w-4" />
                        <span>{t(item.title)}</span>
                        <Lock className="h-3 w-3 ml-auto shrink-0" />
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                }
                const button = (
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    className="data-[active=true]:bg-sidebar-primary data-[active=true]:text-sidebar-primary-foreground data-[active=true]:shadow-glow data-[active=true]:font-semibold rounded-xl h-9 text-[13px] text-sidebar-foreground/85"
                  >
                    <Link to={item.url} search={item.tab ? { tab: item.tab } : undefined}>
                      <item.icon className="h-4 w-4" />
                      <span>{t(item.title)}</span>
                    </Link>
                  </SidebarMenuButton>
                );
                if (!item.children || collapsed) {
                  return <SidebarMenuItem key={item.url}>{button}</SidebarMenuItem>;
                }
                return (
                  <SidebarMenuItem key={item.url}>
                    <Collapsible
                      open={itemOpen}
                      onOpenChange={(v) => setOpenItems((s) => ({ ...s, [item.url]: v }))}
                    >
                      <div className="flex items-center gap-1">
                        {button}
                        <CollapsibleTrigger asChild>
                          <button
                            className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/50 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
                            title={`More ${t(item.title)} options`}
                          >
                            <ChevronDown
                              className={`h-3.5 w-3.5 transition-transform ${itemOpen ? "" : "-rotate-90"}`}
                            />
                          </button>
                        </CollapsibleTrigger>
                      </div>
                      <CollapsibleContent>
                        <SidebarMenuSub className="mt-1">
                          {item.children.map((child) => (
                            <SidebarMenuSubItem key={child.title}>
                              <SidebarMenuSubButton
                                asChild
                                size="sm"
                                isActive={isActiveUrl(path, child.url) && (child.tab === undefined || (currentTab ?? "offers") === child.tab)}
                              >
                                <Link to={child.url} search={child.tab ? { tab: child.tab } : undefined}>
                                  <span>{t(child.title)}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </Collapsible>
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
                open={open}
                onOpenChange={(v) => setOpenGroups((s) => ({ ...s, [group.label]: v }))}
              >
                <CollapsibleTrigger asChild>
                  <button
                    data-tour={`sidebar-group-${group.label}`}
                    className="w-full flex items-center justify-between px-3 py-2 text-[13px] font-bold uppercase tracking-[0.08em] text-sidebar-foreground/90 hover:text-sidebar-foreground transition-colors"
                  >
                    <span>{t(group.label)}</span>
                    <ChevronDown
                      className={`h-4 w-4 transition-transform ${open ? "" : "-rotate-90"}`}
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
            className="flex items-center gap-2.5 flex-1 min-w-0 text-start"
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
      {upgradeModal && (
        <UpgradeModal
          open
          onOpenChange={(open) => !open && setUpgradeModal(null)}
          feature={upgradeModal.feature}
        />
      )}
    </Sidebar>
  );
}
