import { createFileRoute, Navigate } from "@tanstack/react-router";

// Merged into Customer Returns
export const Route = createFileRoute("/_app/refunds")({
  component: () => <Navigate to="/returns" replace />,
});
