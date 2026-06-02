import { createFileRoute, Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BaqalaLogo } from "@/components/baqala-logo";
import { Check, Building2, FileText, Store, Terminal as TerminalIcon, Users } from "lucide-react";

export const Route = createFileRoute("/signup")({ component: Signup });

const steps = [
  { i: Building2, t: "Business" },
  { i: FileText, t: "CR & VAT" },
  { i: Store, t: "Branch" },
  { i: TerminalIcon, t: "Terminal" },
  { i: Users, t: "Role" },
];

function Signup() {
  const active = 1;
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border/60 bg-card">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <BaqalaLogo />
          <Link to="/login" search={{ redirect: '/' }} className="text-sm text-muted-foreground hover:text-foreground">Already have an account? <span className="text-primary font-semibold">Sign in</span></Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <Badge className="bg-primary/10 text-primary border-primary/20">Step {active + 1} of 5</Badge>
        <h1 className="text-3xl font-bold tracking-tight mt-3">Register your business</h1>
        <p className="text-muted-foreground mt-1">A few details to set up your Baqala ECR workspace.</p>

        {/* Stepper */}
        <div className="flex items-center gap-2 mt-8">
          {steps.map((s, i) => (
            <div key={s.t} className="flex items-center gap-2 flex-1">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${i < active ? "bg-success text-success-foreground" : i === active ? "gradient-primary text-primary-foreground shadow-glow" : "bg-muted text-muted-foreground"}`}>
                {i < active ? <Check className="h-4 w-4" /> : <s.i className="h-4 w-4" />}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-semibold ${i === active ? "text-foreground" : "text-muted-foreground"}`}>{s.t}</p>
                {i < steps.length - 1 && <div className={`h-0.5 mt-1 rounded-full ${i < active ? "bg-success" : "bg-border"}`} />}
              </div>
            </div>
          ))}
        </div>

        <Card className="p-6 mt-8 border-border/60 shadow-card">
          <h3 className="font-semibold">Commercial Registration & VAT</h3>
          <p className="text-sm text-muted-foreground">We use these to issue ZATCA-compliant invoices.</p>
          <div className="grid sm:grid-cols-2 gap-4 mt-6">
            <div><Label>Commercial Registration (CR)</Label><Input className="mt-1.5 h-11" placeholder="1010xxxxxx" /></div>
            <div><Label>VAT Registration Number</Label><Input className="mt-1.5 h-11" placeholder="300xxxxxxxxxxxx" /></div>
            <div><Label>Business name (English)</Label><Input className="mt-1.5 h-11" placeholder="Baqala Al Faisal Trading Co." /></div>
            <div><Label>اسم النشاط (Arabic)</Label><Input className="mt-1.5 h-11" dir="rtl" placeholder="مؤسسة بقالة الفيصل التجارية" /></div>
            <div className="sm:col-span-2"><Label>City / Region</Label><Input className="mt-1.5 h-11" placeholder="Riyadh, Kingdom of Saudi Arabia" /></div>
          </div>
          <div className="flex justify-between mt-8">
            <Button variant="outline">Back</Button>
            <Button className="gradient-primary text-primary-foreground border-0 shadow-glow">Continue</Button>
          </div>
        </Card>
      </div>
    </div>
  );
}