import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/warehouse-suppliers")({
  component: () => <Navigate to="/suppliers" replace />,
});
