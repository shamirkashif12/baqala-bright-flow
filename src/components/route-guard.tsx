import { type ReactNode, useEffect, useRef } from "react";
import { useRouterState, Link } from "@tanstack/react-router";
import { ShieldAlert, WifiOff, Lock } from "lucide-react";
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
  // planFeature: gated on the tenant's provisioned plan tier, independent of module/roles above
  // (see src/lib/use-plan-feature.ts). Checked separately from isAllowed — a route can pass the
  // DB permission check and still be denied here if the plan doesn't include the feature.
  planFeature?: string;
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
  { url: "/control-tower",       module: "Control Tower", planFeature: "control_tower_approval_centre" },
  // Stock
  { url: "/stocks",              module: "Stocks" },
  { url: "/inventory",           module: "Inventory" },
  // /pricing and /stocktaking had no entry at all — same gap as the /batch-tracking note below,
  // any logged-in role could reach them directly regardless of module permission.
  { url: "/pricing",             module: "Inventory", planFeature: "pricing_promotions" },
  { url: "/stocktaking",         module: "Stocks", planFeature: "stocktaking" },
  { url: "/batches",             module: "Batches", planFeature: "batch_tracking" },
  // /batch-tracking had no entry at all — ROUTE_RULES.find() returned undefined and the guard
  // never even ran, so every logged-in role (regardless of Batches.canView) could reach it
  // directly. Worse than a wrong-module gate: no gate at all.
  { url: "/batch-tracking",      module: "Batches", planFeature: "batch_tracking" },
  { url: "/warehouses",          module: "Warehouses", planFeature: "warehouse_management" },
  { url: "/stock-transfers",     module: "Stock Transfers" },
  // Finance
  { url: "/expenses",            module: "Accounting & Finance" },
  { url: "/purchase-orders",     module: "Purchase Orders", planFeature: "purchase_orders" },
  { url: "/coupons",             module: "Coupons", planFeature: "pricing_promotions" },
  { url: "/loyalty-program",     module: "Loyalty Program" },
  { url: "/returns",             module: "Returns" },
  { url: "/refunds",             module: "Returns" },
  { url: "/tax-fees",            module: "Tax & Fees" },
  { url: "/service-charges",     module: "Tax & Fees" },
  { url: "/tax-reports",         module: "Tax & Fees" },
  // Suppliers
  { url: "/suppliers",           module: "Suppliers" },
  // Supplier Returns is its own matrix row, distinct from Suppliers — Storekeeper and
  // Supervisor hold Suppliers canView but are fully denied Supplier Returns, so gating
  // this route on "Suppliers" let exactly those two roles through.
  { url: "/supplier-returns",    module: "Supplier Returns", planFeature: "supplier_returns" },
  { url: "/mart-suppliers",      module: "Suppliers" },
  { url: "/warehouse-suppliers", module: "Suppliers" },
  // Human Resources
  // Employees itself stays ungated — every login requires a linked Employee record
  // (UsersController.Create), so the plain directory is load-bearing for Basic's own
  // "Users & Staff Accounts" feature. Only the richer HRM surface below is plan-gated.
  { url: "/employees",           module: "Employees" },
  { url: "/hrm-attendance",      module: "HR Attendance", planFeature: "employee_shift_management" },
  { url: "/work-shifts",         module: "HR Shifts", planFeature: "employee_shift_management" },
  { url: "/leaves",              module: "Leave Management", planFeature: "employee_shift_management" },
  { url: "/departments",         module: "HR Master Data" },
  { url: "/designations",        module: "HR Master Data" },
  { url: "/holidays",            module: "HR Master Data" },
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
  { url: "/reports/hrm-attendance",      module: "HR Attendance", planFeature: "employee_shift_management" },
  { url: "/reports/shift-closing",       module: "HR Shifts", planFeature: "employee_shift_management" },
  { url: "/reports/employee-activity",   module: "Audit Logs" },
  { url: "/reports/employee-audit-center", module: "Reports", planFeature: "employee_shift_management" },
  { url: "/reports/inventory-aging-performance", module: "Reports", planFeature: "kpi_bi" },
  { url: "/reports/category-performance",  module: "Reports", planFeature: "kpi_bi" },
  { url: "/reports/supplier-performance",  module: "Reports", planFeature: "kpi_bi" },
  { url: "/reports/stock-reconciliation",  module: "Reports", planFeature: "stocktaking" },
  { url: "/reports/discounts",             module: "Reports", planFeature: "pricing_promotions" },
  { url: "/reports/vat-zatca",             module: "Reports", planFeature: "zatca_compliance" },
  { url: "/reports/supplier-returns",      module: "Reports", planFeature: "supplier_returns" },
  { url: "/reports/purchase-orders",       module: "Reports", planFeature: "purchase_orders" },
  // Must come before the generic "/reports" rule below (find() returns the first prefix match).
  { url: "/reports/approval-center",     module: "Reports", planFeature: "control_tower_approval_centre" },
  { url: "/reports",             module: "Reports" },
  { url: "/kpi",                 module: "Reports", planFeature: "kpi_bi" },
  { url: "/bi",                  module: "Reports", planFeature: "kpi_bi" },
  // Admin — module-gated
  { url: "/rules",               module: "Rules Engine" },
  { url: "/users",               module: "Users" },
  { url: "/staff",               module: "Users" },
  { url: "/roles",               module: "Roles" },
  { url: "/zatca",               module: "Compliance", planFeature: "zatca_compliance" },
  { url: "/compliance",          module: "Compliance", planFeature: "zatca_compliance" },
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
  { url: "/zatca-settings",      module: "Compliance", planFeature: "zatca_phase2" },
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

// Distinct from AccessDenied above — this isn't a permission problem (the user's role may well
// have full module access), it's the tenant's plan not including this feature yet. Deliberately
// doesn't claim which tier unlocks it — the Tenant Admin Dashboard owns that mapping and can
// reconfigure it at any time, so the only thing this app can honestly show is the tenant's own
// current plan name (live from planInfo), not a guessed target tier.
function PlanUpgradeRequired({ dest }: { dest: string }) {
  const { planInfo } = useAuth();
  const planName = planInfo?.provisioned ? planInfo.planName : null;
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <Lock className="h-12 w-12 text-warning" />
      <h1 className="text-xl font-semibold">Upgrade Required</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        This page isn't included in your{planName ? ` ${planName}` : " current"} plan. Upgrade your subscription to unlock it.
      </p>
      <div className="flex gap-2 mt-2">
        <Button asChild variant="outline">
          <Link to={dest}>Back to safety</Link>
        </Button>
        <Button asChild className="gradient-primary text-primary-foreground border-0">
          <Link to="/plans">View Plans</Link>
        </Button>
      </div>
    </div>
  );
}

// Shown when the last permissions fetch never reached the server (connectivity blip), as opposed
// to a real 401/403 — this is not an authorization decision, so it must not read as one.
function ConnectivityIssue({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-3 px-6 text-center">
      <WifiOff className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-xl font-semibold">Connection Problem</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        We couldn't reach the server to confirm your access to this page. Check your connection and try again.
      </p>
      <Button className="mt-2" onClick={onRetry}>Retry</Button>
    </div>
  );
}

/**
 * Wraps the routed page content. If the signed-in user doesn't have permission for the current
 * path, shows an Access Denied screen and logs the attempt (FRD 3.1) instead of silently
 * redirecting them away.
 */
export function RouteGuard({ children }: { children: ReactNode }) {
  const { user, loading, refreshPermissions, isFeatureEnabled } = useAuth();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const loggedPathRef = useRef<string | null>(null);

  const rule = ROUTE_RULES.find(
    (r) => path === r.url || path.startsWith(r.url + "/"),
  );

  const wouldDeny = !loading && !!rule && !isAllowed(rule, user);
  // A rule failure caused by a permissions fetch that never reached the server is a connectivity
  // problem, not a real authorization decision — don't tell the user they lack access when we
  // simply don't know yet.
  const connectivityIssue = wouldDeny && !!user?.permissionsUnknown;
  const denied = wouldDeny && !connectivityIssue;
  // Checked independently of the module/role denial above — a route can pass isAllowed and still
  // be blocked here if the tenant's plan doesn't include it.
  const planDenied = !loading && !denied && !connectivityIssue && !!rule?.planFeature && !isFeatureEnabled(rule.planFeature);

  useEffect(() => {
    if ((denied || planDenied) && user && loggedPathRef.current !== path) {
      loggedPathRef.current = path;
      api.logAccessDenied(path);
    }
  }, [denied, planDenied, user, path]);

  // Still hydrating — render nothing to avoid a flash
  if (loading) return null;
  if (connectivityIssue) return <ConnectivityIssue onRetry={refreshPermissions} />;
  if (denied) {
    const dest = ROLE_DEFAULT_ROUTES[user!.role as AppRole] ?? "/dashboard";
    return <AccessDenied dest={dest} />;
  }
  if (planDenied) {
    const dest = ROLE_DEFAULT_ROUTES[user!.role as AppRole] ?? "/dashboard";
    return <PlanUpgradeRequired dest={dest} />;
  }

  return <>{children}</>;
}
