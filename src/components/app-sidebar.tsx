import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  ScanBarcode,
  Smartphone,
  Monitor,
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
  Shield,
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
import { useAuth } from "@/lib/auth";
import { BaqalaLogo } from "./baqala-logo";

const navGroups = [
  {
    label: "Operate",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
      { title: "POS Checkout", url: "/pos", icon: ScanBarcode },
      { title: "Mobile POS", url: "/mobile-pos", icon: Smartphone },
      { title: "Self-Checkout Kiosk", url: "/kiosk", icon: Monitor },
    ],
  },
  {
    label: "Stock",
    items: [
      { title: "Inventory", url: "/inventory", icon: Package },
      { title: "Batches & Expiry", url: "/batches", icon: CalendarClock },
      { title: "Suppliers", url: "/suppliers", icon: Truck },
    ],
  },
  {
    label: "Network",
    items: [
      { title: "Branches", url: "/branches", icon: Building2 },
      { title: "Terminals", url: "/terminals", icon: Terminal },
      { title: "Devices", url: "/devices", icon: HardDrive },
    ],
  },
  {
    label: "Insights",
    items: [
      { title: "Sales", url: "/sales", icon: TrendingUp },
      { title: "Reports", url: "/reports", icon: FileBarChart },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Admin Portal", url: "/admin", icon: Shield },
      { title: "Staff & Roles", url: "/staff", icon: Users },
      { title: "Maintenance", url: "/maintenance", icon: Wrench },
      { title: "ZATCA Invoices", url: "/zatca", icon: ReceiptText },
      { title: "Compliance", url: "/compliance", icon: ShieldCheck },
      { title: "Settings", url: "/settings", icon: Settings },
    ],
  },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { user, logout } = useAuth();

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="p-4 border-b border-sidebar-border/50">
        {collapsed ? <BaqalaLogo showText={false} /> : <BaqalaLogo />}
      </SidebarHeader>
      <SidebarContent className="px-2 py-3">
        {navGroups.map((group) => (
          <SidebarGroup key={group.label}>
            {!collapsed && (
              <SidebarGroupLabel className="text-[10px] uppercase tracking-[0.18em] text-sidebar-foreground/40 px-3">
                {group.label}
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
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
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="p-3 border-t border-sidebar-border/50">
        <button
          onClick={logout}
          className="w-full flex items-center gap-2.5 rounded-xl p-2 bg-sidebar-accent/40 hover:bg-sidebar-accent/60 transition-colors text-left"
        >
          <div className="h-8 w-8 rounded-lg gradient-primary flex items-center justify-center text-primary-foreground text-xs font-bold shrink-0">
            {user?.initials ?? "U"}
          </div>
          {!collapsed && (
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{user?.name ?? "User"}</p>
              <p className="text-[10px] text-sidebar-foreground/60 truncate">{user?.role === "owner" ? "Owner" : user?.role === "manager" ? "Manager" : "Cashier"} · {user?.branch?.split(" — ")[1] ?? "HQ"}</p>
            </div>
          )}
          {!collapsed && <LogOut className="h-4 w-4 text-sidebar-foreground/60" />}
        </button>
      </SidebarFooter>
    </Sidebar>
  );
}
