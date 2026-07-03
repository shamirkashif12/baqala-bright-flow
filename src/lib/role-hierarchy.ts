import type { AppRole, AuthUser } from "@/lib/auth";

// Real-world mart org chart. Lower number = more authority.
// Mirrors AuthController.ToAppRole on the backend (api/Controllers/AuthController.cs).
export const ROLE_RANK: Record<AppRole, number> = {
  tenant_admin: 1,
  branch_manager: 2,
  supervisor: 3,
  cashier: 4,
  storekeeper: 4,
  finance_user: 4,
  marketing_user: 4,
  picker: 4,
};

// Mirrors AuthController.ToAppRole (api/Controllers/AuthController.cs) so a
// Role.Name display string (as returned in User.roleName) can be ranked.
export function roleNameToSlug(roleName: string): AppRole {
  switch (roleName) {
    case "Tenant Administrator":
    case "Admin":
      return "tenant_admin";
    case "Branch Manager":
    case "Manager":
      return "branch_manager";
    case "Cashier":
      return "cashier";
    case "Storekeeper":
    case "Inventory Staff":
      return "storekeeper";
    case "Supervisor":
      return "supervisor";
    case "Finance User":
    case "Accountant":
      return "finance_user";
    case "Marketing User":
    case "Auditor":
      return "marketing_user";
    case "Picker":
    case "Warehouse Staff":
      return "picker";
    default:
      return roleName.toLowerCase().replace(/ /g, "_") as AppRole;
  }
}

// Only a strictly higher-ranked user may activate/deactivate another account,
// and never their own — matches how activation authority works in a real mart.
export function canManageUser(actor: AuthUser, targetRoleName: string | undefined, targetUserId: string): boolean {
  if (actor.id === targetUserId) return false;
  const targetRank = ROLE_RANK[roleNameToSlug(targetRoleName ?? "")] ?? Infinity;
  return ROLE_RANK[actor.role] < targetRank;
}
