import { createFileRoute, Navigate } from "@tanstack/react-router";

// Merged into /expenses (Expense Types tab)
export const Route = createFileRoute("/_app/expense-types")({
  component: () => <Navigate to="/expenses" replace />,
});
