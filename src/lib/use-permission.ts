import { useAuth } from "@/lib/auth";

export interface ModulePermissions {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canApprove: boolean;
  canExport: boolean;
}

/**
 * Returns the current user's CRUD permissions for a given module name,
 * read from the RolePermissions matrix (with per-user overrides applied) —
 * including for tenant_admin, whose access is governed by the same matrix
 * as every other role.
 */
export function usePermission(module: string): ModulePermissions {
  const { user } = useAuth();

  if (!user) {
    return { canCreate: false, canEdit: false, canDelete: false, canApprove: false, canExport: false };
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
