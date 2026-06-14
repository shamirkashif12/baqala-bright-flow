import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BaqalaLogo } from "@/components/baqala-logo";
import { useAuth } from "@/lib/auth";
import { ShieldCheck, ScanBarcode, Smartphone, Building2, Eye, EyeOff, Loader2 } from "lucide-react";
export const Route = createFileRoute("/login")({
  validateSearch: (search) => ({
    redirect: (search.redirect as string) || "/dashboard",
  }),
  component: Login,
});

function Login() {
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const { redirect } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Already logged in? Redirect (must be in effect, not render).
  useEffect(() => {
    if (isAuthenticated) {
      navigate({ to: redirect, replace: true });
    }
  }, [isAuthenticated, navigate, redirect]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.trim()) { setError("Enter your email or phone number"); return; }
    if (!password) { setError("Enter your password"); return; }
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate({ to: redirect });
    } catch (err: any) {
      setError(err?.message || "Sign in failed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-10 gradient-primary text-primary-foreground overflow-hidden">
        {/* Animated mesh / orbs */}
        <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-white/20 blur-3xl animate-pulse" />
        <div className="absolute bottom-10 -right-24 h-96 w-96 rounded-full bg-primary-glow/40 blur-3xl animate-pulse" style={{ animationDelay: "1s" }} />
        <div className="absolute inset-0 opacity-[0.12] [background-image:linear-gradient(white_1px,transparent_1px),linear-gradient(90deg,white_1px,transparent_1px)] [background-size:32px_32px]" />
        <div className="relative z-10">
          <BaqalaLogo />
          <div className="mt-4 flex flex-wrap gap-1.5">
            {["POS", "Inventory", "Suppliers", "Delivery", "Devices"].map(p => (
              <Badge key={p} className="bg-white/15 text-primary-foreground border-white/20 backdrop-blur text-[10px]">{p}</Badge>
            ))}
          </div>
        </div>
        {/* Floating KPI chips */}
        <div className="absolute top-32 right-10 rounded-2xl bg-white/15 backdrop-blur border border-white/20 p-3 z-10 animate-pulse" style={{ animationDuration: "3s" }}>
          <p className="text-[10px] uppercase tracking-wider opacity-80">Today's Sales</p>
          <p className="text-lg font-bold">ر.س 48,920</p>
          <p className="text-[10px] text-success-foreground bg-success/40 inline-block px-1.5 rounded mt-1">+18%</p>
        </div>
        <div className="absolute bottom-44 right-20 rounded-2xl bg-white/15 backdrop-blur border border-white/20 p-3 z-10 animate-pulse" style={{ animationDuration: "4s", animationDelay: "0.5s" }}>
          <p className="text-[10px] uppercase tracking-wider opacity-80">Active Terminals</p>
          <p className="text-lg font-bold">11 / 12</p>
        </div>
        <div className="relative z-10 space-y-6 max-w-md">
          <Badge className="bg-white/15 text-primary-foreground border-white/20 backdrop-blur gap-1.5">
            <ShieldCheck className="h-3 w-3" />ZATCA Phase 2 ready
          </Badge>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight">Manage your Mart <span className="block">smartly with MI Money.</span></h1>
          <p className="text-primary-foreground/80">POS, inventory, suppliers, delivery, devices — one Arabic-friendly cloud for every Saudi mart, kiosk and multi-branch operation.</p>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {[{i: ScanBarcode, l: "POS"}, {i: Smartphone, l: "Mobile"}, {i: Building2, l: "Multi-branch"}].map((f) => (
              <div key={f.l} className="rounded-2xl bg-white/10 backdrop-blur border border-white/15 p-4 text-center">
                <f.i className="h-5 w-5 mx-auto mb-1.5 opacity-90" />
                <p className="text-xs font-semibold">{f.l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs opacity-70">© 2026 MI Money · Riyadh, KSA</p>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center"><BaqalaLogo /></div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-muted-foreground text-sm mt-1">Sign in to your MI Money dashboard.</p>

          <form onSubmit={handleSubmit}>
            <Card className="p-6 mt-6 border-border/60 shadow-card space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 border border-destructive/20">
                  {error}
                </div>
              )}
              <div>
                <Label htmlFor="email">Email or phone</Label>
                <Input
                  id="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 h-11"
                  placeholder="owner@baqala-faisal.sa"
                  autoComplete="email"
                  disabled={loading}
                />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Password</Label>
                  <span className="text-xs text-primary hover:underline cursor-pointer">Forgot?</span>
                </div>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="h-11 pr-10"
                    placeholder="••••••••"
                    autoComplete="current-password"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="remember" checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
                <label htmlFor="remember" className="text-sm text-muted-foreground">Keep me signed in on this device</label>
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary text-primary-foreground border-0 shadow-glow gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Signing in…" : "Sign in"}
              </Button>
              <div className="relative my-2">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or</span></div>
              </div>
              <Button type="button" variant="outline" className="w-full h-11" disabled={loading}>
                Use NAFATH ID
              </Button>
              <Link to="/signup" className="block">
                <Button type="button" variant="outline" className="w-full h-11 border-primary/30 text-primary hover:bg-primary/5" disabled={loading}>
                  Create a new account
                </Button>
              </Link>
            </Card>
          </form>

          <p className="text-center text-sm text-muted-foreground mt-6">
            New to MI Money? <Link to="/signup" className="text-primary font-semibold hover:underline">Register your business</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
