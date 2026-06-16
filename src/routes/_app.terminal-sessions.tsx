import { createFileRoute, Navigate } from "@tanstack/react-router";

// Merged into /terminals — redirect for backward compatibility.
export const Route = createFileRoute("/_app/terminal-sessions")({
  component: () => <Navigate to="/terminals" replace />,
});
