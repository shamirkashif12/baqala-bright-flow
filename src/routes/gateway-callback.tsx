import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BaqalaLogo } from "@/components/baqala-logo";
import { useAuth } from "@/lib/auth";
import { Loader2, AlertTriangle } from "lucide-react";

// SSO landing page for the Tenant Admin Dashboard's "Launch" button — see
// AuthController.GatewayLogin. The Dashboard redirects here with a short-lived gateway JWT in
// the `token` query param; this page exchanges it for a normal local session and forwards on,
// so the operator never sees a login screen.
export const Route = createFileRoute("/gateway-callback")({
  validateSearch: (search) => ({
    token: (search.token as string) || "",
    redirect: (search.redirect as string) || "/dashboard",
  }),
  component: GatewayCallback,
});

function GatewayCallback() {
  const { gatewayLogin } = useAuth();
  const { token, redirect } = Route.useSearch();
  const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "/dashboard";
  const [error, setError] = useState("");
  const ranOnce = useRef(false);

  useEffect(() => {
    // Guards against React StrictMode's double-invoke and any re-render before navigation
    // completes — this token is meant to be used exactly once.
    if (ranOnce.current) return;
    ranOnce.current = true;

    if (!token) {
      setError("No sign-in token was provided. Ask the Tenant Admin Dashboard to relaunch.");
      return;
    }

    gatewayLogin(token)
      .then(() => window.location.replace(safeRedirect))
      .catch((err: any) => setError(err?.message || "Single sign-on failed."));
  }, [token, safeRedirect, gatewayLogin]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm text-center">
        <div className="mb-8 flex justify-center"><BaqalaLogo /></div>
        <Card className="p-8 border-border/60 shadow-card space-y-4">
          {error ? (
            <>
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                <AlertTriangle className="h-6 w-6 text-destructive" />
              </div>
              <p className="text-sm font-medium">Sign-in failed</p>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button asChild className="w-full gradient-primary text-primary-foreground border-0 mt-2">
                <Link to="/login" search={{ redirect: "/dashboard" }}>Go to login</Link>
              </Button>
            </>
          ) : (
            <>
              <Loader2 className="h-6 w-6 animate-spin mx-auto text-primary" />
              <p className="text-sm text-muted-foreground">Signing you in…</p>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
