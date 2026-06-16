import { createFileRoute, Navigate } from "@tanstack/react-router";
export const Route = createFileRoute("/_app/device-behavior")({
  component: () => <Navigate to="/devices" replace />,
});
