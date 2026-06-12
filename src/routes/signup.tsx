import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { BaqalaLogo } from "@/components/baqala-logo";
import { useAuth } from "@/lib/auth";
import { Loader2, MailCheck } from "lucide-react";

export const Route = createFileRoute("/signup")({ component: Signup });

function Signup() {
  const { signup } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!email.includes("@")) return setError("Enter a valid email address.");
    if (password.length < 8) return setError("Password must be at least 8 characters.");
    if (password !== confirm) return setError("Passwords do not match.");
    setLoading(true);
    try {
      const { needsVerification } = await signup({ email, password, name });
      if (needsVerification) setSent(email);
      else setSent(null);
    } catch (err: any) {
      setError(err?.message || "Could not create account.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <BaqalaLogo />
          <Link to="/login" search={{ redirect: '/' }} className="text-sm text-muted-foreground hover:text-foreground">Already have an account? <span className="text-primary font-semibold">Sign in</span></Link>
        </div>
      </header>

      <div className="max-w-md mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold tracking-tight">Create your account</h1>
        <p className="text-muted-foreground mt-1">We'll send a verification link to your email.</p>

        {sent ? (
          <Card className="p-6 mt-8 border-border/60 shadow-card text-center space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
              <MailCheck className="h-6 w-6 text-primary" />
            </div>
            <h3 className="font-semibold">Check your inbox</h3>
            <p className="text-sm text-muted-foreground">
              We sent a verification link to <span className="font-medium text-foreground">{sent}</span>. Click it to activate your account, then sign in.
            </p>
            <Link to="/login" search={{ redirect: "/dashboard" }}>
              <Button className="w-full h-11 gradient-primary text-primary-foreground border-0 shadow-glow mt-2">Go to sign in</Button>
            </Link>
          </Card>
        ) : (
          <form onSubmit={onSubmit}>
            <Card className="p-6 mt-8 border-border/60 shadow-card space-y-4">
              {error && (
                <div className="rounded-lg bg-destructive/10 text-destructive text-sm px-3 py-2 border border-destructive/20">{error}</div>
              )}
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1.5 h-11" placeholder="Abdullah Al Faisal" disabled={loading} />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 h-11" placeholder="owner@yourmart.sa" autoComplete="email" disabled={loading} />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 h-11" placeholder="At least 8 characters" autoComplete="new-password" disabled={loading} />
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5 h-11" autoComplete="new-password" disabled={loading} />
              </div>
              <Button type="submit" disabled={loading} className="w-full h-11 gradient-primary text-primary-foreground border-0 shadow-glow gap-2">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {loading ? "Creating account…" : "Create account"}
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                By signing up you agree to verify your email before accessing the dashboard.
              </p>
            </Card>
          </form>
        )}
      </div>
    </div>
  );
}