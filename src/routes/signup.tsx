import { createFileRoute, Navigate } from "@tanstack/react-router";

// Self-registration is disabled. All users are created by a Tenant Admin.
// Anyone who visits /signup is silently redirected to login.
export const Route = createFileRoute("/signup")({
  component: () => <Navigate to="/login" search={{ redirect: "/dashboard" }} />,
});
