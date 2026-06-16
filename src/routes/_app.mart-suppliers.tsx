import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/mart-suppliers")({
  component: () => <Navigate to="/suppliers" replace />,
});
