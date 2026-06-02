import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { BaqalaLogo } from "@/components/baqala-logo";
import { ShieldCheck, ScanBarcode, Smartphone, Building2 } from "lucide-react";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-background">
      {/* Left brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between p-10 gradient-primary text-primary-foreground overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 20%, white 0, transparent 40%), radial-gradient(circle at 80% 70%, white 0, transparent 35%)" }} />
        <div className="relative z-10">
          <BaqalaLogo />
        </div>
        <div className="relative z-10 space-y-6 max-w-md">
          <Badge className="bg-white/15 text-primary-foreground border-white/20 backdrop-blur"><ShieldCheck className="h-3 w-3 mr-1.5" />ZATCA Phase 2 ready</Badge>
          <h1 className="text-4xl xl:text-5xl font-bold leading-tight">The modern POS for Saudi <span className="block">baqalas & marts.</span></h1>
          <p className="text-primary-foreground/80">Run one shop or fifty branches. Inventory, suppliers, kiosks, mobile POS and ZATCA invoicing — in one Arabic-friendly cloud.</p>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {[{i: ScanBarcode, l: "POS"}, {i: Smartphone, l: "Mobile"}, {i: Building2, l: "Multi-branch"}].map((f) => (
              <div key={f.l} className="rounded-2xl bg-white/10 backdrop-blur border border-white/15 p-4 text-center">
                <f.i className="h-5 w-5 mx-auto mb-1.5 opacity-90" />
                <p className="text-xs font-semibold">{f.l}</p>
              </div>
            ))}
          </div>
        </div>
        <p className="relative z-10 text-xs opacity-70">© 2026 Baqala ECR · Riyadh, KSA</p>
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden mb-8 flex justify-center"><BaqalaLogo /></div>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back</h2>
          <p className="text-muted-foreground text-sm mt-1">Sign in to your Baqala ECR dashboard.</p>

          <Card className="p-6 mt-6 border-border/60 shadow-card space-y-4">
            <div>
              <Label>Email or phone</Label>
              <Input className="mt-1.5 h-11" placeholder="owner@baqala-faisal.sa" />
            </div>
            <div>
              <div className="flex items-center justify-between"><Label>Password</Label><a className="text-xs text-primary hover:underline">Forgot?</a></div>
              <Input type="password" className="mt-1.5 h-11" placeholder="••••••••" />
            </div>
            <div className="flex items-center gap-2"><Checkbox id="r" defaultChecked /><label htmlFor="r" className="text-sm text-muted-foreground">Keep me signed in on this device</label></div>
            <Link to="/dashboard"><Button className="w-full h-11 gradient-primary text-primary-foreground border-0 shadow-glow">Sign in</Button></Link>
            <div className="relative my-2"><div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div><div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or</span></div></div>
            <Button variant="outline" className="w-full h-11">Use NAFATH ID</Button>
          </Card>

          <p className="text-center text-sm text-muted-foreground mt-6">
            New to Baqala ECR? <Link to="/signup" className="text-primary font-semibold hover:underline">Register your business</Link>
          </p>
        </div>
      </div>
    </div>
  );
}