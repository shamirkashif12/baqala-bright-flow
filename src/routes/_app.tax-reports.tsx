import { createFileRoute, Navigate } from "@tanstack/react-router";
// Moved into Reports section.
export const Route = createFileRoute("/_app/tax-reports")({
  component: () => <Navigate to="/reports" replace />,
});
