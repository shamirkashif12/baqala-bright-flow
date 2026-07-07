import { createFileRoute, Outlet } from "@tanstack/react-router";
import { ModuleGate } from "@/components/role-gate";

export const Route = createFileRoute("/_app/reports")({
  component: () => (
    <ModuleGate module="Reports">
      <Outlet />
    </ModuleGate>
  ),
});
