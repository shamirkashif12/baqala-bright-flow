import { useAuth } from "@/lib/auth";

export interface ModulePermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

/**
 * Returns the current user's CRUD permissions for a given module name.
 * tenant_admin always gets full permissions.
 * All other roles read from the permissions map embedded in their JWT.
 */
export function usePermission(module: string): ModulePermissions {
  const { user } = useAuth();

  if (!user) {
    return { canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false };
  }

  // tenant_admin bypasses all restrictions
  if (user.role === "tenant_admin") {
    return { canCreate: true, canEdit: true, canDelete: true, canApprove: true, canExport: true };
  }

  const p = user.permissions?.[module];
  return {
    canCreate:  p?.canCreate  ?? false,
    canEdit:    p?.canEdit    ?? false,
    canDelete:  p?.canDelete  ?? false,
    canApprove: p?.canApprove ?? false,
    canExport:  p?.canExport  ?? false,
  };
}
