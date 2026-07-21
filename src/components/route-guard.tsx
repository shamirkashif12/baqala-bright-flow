import { type ReactNode, useEffect, useRef } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth, type AppRole } from "@/lib/auth";
import { api } from "@/lib/api";

type RouteRule = {
  url: string;
  module?: string;
  /** Explicit role allowlist (checked in addition to module) */
  roles?: AppRole[];
  /** Block these roles even if they have module canView=true */
  blockRoles?: AppRole[];
};

// Default landing page per role — used for the redirect when a user lands on a denied page.
const ROLE_DEFAULT_ROUTES: Record<AppRole, string> = {
  tenant_admin:   "/dashboard",
  branch_manager: "/dashboard",
  supervisor:     "/dashboard",
  cashier:        "/cashier",
  storekeeper:    "/stocks",
  finance_user:   "/sales",
  marketing_user: "/customers",
  picker:         "/stocks",
  // DataSeeder.SeedName treats these as renames of Marketing User/Picker (same permission
  // profile) — mirror their landing routes. Warehouse Manager has no seeded permissions yet
  // (not in BuildPermissions' role-name switch), so it gets the same safe fallback as the
  // other manager-tier roles.
  auditor:           "/customers",
  warehouse_staff:   "/stocks",
  warehouse_manager: "/dashboard",
};

// Maps each URL prefix to the module permission or role restriction that controls access.
// Mirrors the navGroups in app-sidebar.tsx — keep in sync when adding routes.
const ROUTE_RULES: RouteRule[] = [
  // Operate
  { url: "/dashboard",           module: "Dashboard" },
  { url: "/pos",                 module: "POS" },
  { url: "/orders",              module: "Orders" },
  { url: "/customers",           module: "Customers" },
  { url: "/cashier",             module: "Cashier Workspace" },
  // Finance user has canView=true for Cashier Shifts in the DB (for reconciliation),
  // but business rule says only operational staff should access this page directly.
  { url: "/cashier-shift",       module: "Cashier Shifts", blockRoles: ["finance_user", "marketing_user"] },
  { url: "/control-tower",       module: "Control Tower" },
  // Stock
  { url: "/stocks",              module: "Stocks" },
  { url: "/inventory",           module: "Inventory" },
  { url: "/batches",             module: "Batches" },
  // /batch-tracking had no entry at all — ROUTE_RULES.find() returned undefined and the guard
  // never even ran, so every logged-in role (regardless of Batches.canView) could reach it
  // directly. Worse than a wrong-module gate: no gate at all.
  { url: "/batch-tracking",      module: "Batches" },
  { url: "/warehouses",          module: "Warehouses" },
  { url: "/stock-transfers",     module: "Stock Transfers" },
  // Finance
  { url: "/expenses",            module: "Accounting & Finance" },
  { url: "/expense-types",       module: "Accounting & Finance" },
  { url: "/purchase-orders",     module: "Purchase Orders" },
  { url: "/coupons",             module: "Coupons" },
  { url: "/loyalty-program",     module: "Loyalty Program" },
  { url: "/returns",             module: "Returns" },
  { url: "/refunds",             module: "Returns" },
  { url: "/tax-fees",            module: "Tax & Fees" },
  { url: "/tax-reports",         module: "Tax & Fees" },
  // Suppliers
  { url: "/suppliers",           module: "Suppliers" },
  // Supplier Returns is its own matrix row, distinct from Suppliers — Storekeeper and
  // Supervisor hold Suppliers canView but are fully denied Supplier Returns, so gating
  // this route on "Suppliers" let exactly those two roles through.
  { url: "/supplier-returns",    module: "Supplier Returns" },
  { url: "/mart-suppliers",      module: "Suppliers" },
  { url: "/warehouse-suppliers", module: "Suppliers" },
  // Human Resources
  { url: "/employees",           module: "Employees" },
  { url: "/hrm-attendance",      module: "HR Attendance" },
  { url: "/work-shifts",         module: "HR Shifts" },
  { url: "/leaves",              module: "Leave Management" },
  { url: "/payroll",              module: "Payroll" },
  { url: "/departments",         module: "HR Master Data" },
  { url: "/designations",        module: "HR Master Data" },
  { url: "/holidays",            module: "HR Master Data" },
  // Self-service — any authenticated user can view their OWN payroll, no module gate.
  { url: "/my-payroll" },
  // Network
  { url: "/branches",            module: "Branches" },
  { url: "/terminals",           module: "Terminals" },
  { url: "/terminal-sessions",   module: "Terminals" },
  { url: "/devices",             module: "Devices" },
  { url: "/device-behavior",     module: "Devices" },
  // Insights
  { url: "/sales",               module: "Sales" },
  // HRM reports carry their own permission gates on the backend (HrReportsController) —
  // these specific entries must come before the generic "/reports" rule below since
  // ROUTE_RULES.find() returns the first prefix match.
  { url: "/reports/hrm-attendance",      module: "Reports" },
  { url: "/reports/shift-closing",       module: "Reports" },
  { url: "/reports/employee-activity",   module: "Audit Logs" },
  { url: "/reports",             module: "Reports" },
  { url: "/kpi",                 module: "Reports" },
  { url: "/bi",                  module: "Reports" },
  // Admin — module-gated
  { url: "/rules",               module: "Rules Engine" },
  { url: "/users",               module: "Users" },
  { url: "/staff",               module: "Users" },
  { url: "/roles",               module: "Roles" },
  { url: "/zatca",               module: "Compliance" },
  { url: "/compliance",          module: "Compliance" },
  { url: "/pos-settings",        module: "Settings" },
  { url: "/settings",            module: "Settings" },
  { url: "/audit-logs",          module: "Audit Logs" },
  // Admin — tenant_admin only (no DB module)
  { url: "/admin-overview",      roles: ["tenant_admin"] },
  { url: "/admin",               roles: ["tenant_admin"] },
  { url: "/categories",          roles: ["tenant_admin"] },
  { url: "/maintenance",         roles: ["tenant_admin"] },
  // ZATCA Settings (CSID/cert status, VAT/CR registration) was hardcoded to
  // tenant_admin only, orphaning it from the "Compliance" module permission that
  // already gates /zatca and /compliance and that the backend's own settings PUT
  // enforces (ComplianceController.UpsertSettings requires Compliance+Edit) — so a
  // Finance User/Accountant granted Compliance access could never reach the page
  // to use it. Module-gate it like its sibling Compliance routes instead.
  { url: "/zatca-settings",      module: "Compliance" },
  { url: "/plans",               roles: ["tenant_admin"] },
  { url: "/mobile-pos",          roles: ["tenant_admin"] },
  { url: "/mpos-app",            roles: ["tenant_admin"] },
  { url: "/kiosk",               roles: ["tenant_admin"] },
];

function isAllowed(rule: RouteRule, user: ReturnType<typeof useAuth>["user"]): boolean {
  if (!user) return false;
  // No role bypass, including tenant_admin — module-gated routes are governed by the same
  // RolePermissions matrix as everyone else; role-only rules below already list "tenant_admin"
  // explicitly wherever it should still pass.
  // Explicit block takes priority over module permission
  if (rule.blockRoles?.includes(user.role as AppRole)) return false;
  if (rule.module) return user.permissions?.[rule.module]?.canView === true;
  if (rule.roles) return rule.roles.includes(user.role as AppRole);
  return true;
}

function AccessDenied({ dest }: { dest: string }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <ShieldAlert className="h-12 w-12 text-destructive" />
      <h1 className="text-xl font-semibold">Access Denied</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        You don't have permission to view this page. Contact your administrator if you believe this is a mistake.
      </p>
      <Button asChild className="mt-2">
        <Link to={dest}>Back to safety</Link>
      </Button>
    </div>
  );
}

/**
 * Wraps the routed page content. If the signed-in user doesn't have permission for the current
 * path, shows an Access Denied screen and logs the attempt (FRD 3.1) instead of silently
 * redirecting them away.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const loggedPathRef = useRef<string | null>(null);

  const rule = ROUTE_RULES.find(
    (r) => path === r.url || path.startsWith(r.url + "/"),
  );

  const denied = !loading && !!rule && !isAllowed(rule, user);

  useEffect(() => {
    if (denied && user && loggedPathRef.current !== path) {
      loggedPathRef.current = path;
      api.logAccessDenied(path);
    }
  }, [denied, user, path]);

  // Still hydrating — render nothing to avoid a flash
  if (loading) return null;
  if (denied) {
    const dest = ROLE_DEFAULT_ROUTES[user!.role as AppRole] ?? "/dashboard";
    return <AccessDenied dest={dest} />;
  }

  return <>{children}</>;
}
