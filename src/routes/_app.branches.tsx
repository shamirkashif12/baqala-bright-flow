import { createFileRoute } from "@tanstack/react-router";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, MapPin, Users, Terminal as TerminalIcon, Plus, Clock, TrendingUp } from "lucide-react";
import { Toolbar, StatusBadge } from "@/components/module-placeholder";

export const Route = createFileRoute("/_app/branches")({ component: Branches });

const branches = [
  { name: "Olaya — Riyadh HQ", manager: "Abdullah Al Faisal", address: "King Fahd Rd, Olaya, Riyadh", hours: "24/7", terminals: 5, staff: 12, sales: "ر.س 18,420", status: "active" },
  { name: "Al Khobar Corniche", manager: "Khalid Al Shehri", address: "Corniche Rd, Al Khobar 31952", hours: "06:00 — 02:00", terminals: 3, staff: 8, sales: "ر.س 12,890", status: "active" },
  { name: "Jeddah Tahlia", manager: "Sara Al Qahtani", address: "Tahlia St, Jeddah 23434", hours: "07:00 — 01:00", terminals: 3, staff: 9, sales: "ر.س 11,260", status: "active" },
  { name: "Madinah Quba", manager: "Faisal Al Harbi", address: "Quba Rd, Al Madinah", hours: "05:00 — 00:00", terminals: 2, staff: 6, sales: "ر.س 6,350", status: "maintenance" },
];

function Branches() {
  return (
    <PageShell title="Branches" subtitle="Multi-location management across the Kingdom">
      <Toolbar placeholder="Search branches…" primaryLabel="New Branch" primaryIcon={Plus} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((b) => (
          <Card key={b.name} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center shadow-glow"><Building2 className="h-5 w-5 text-primary-foreground" /></div>
                <div>
                  <h3 className="font-semibold">{b.name}</h3>
                  <p className="text-xs text-muted-foreground">Manager: {b.manager}</p>
                </div>
              </div>
              <StatusBadge status={b.status} />
            </div>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {b.address}</div>
              <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> {b.hours}</div>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-border/60">
              <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Terminals</p><p className="font-bold text-lg">{b.terminals}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Staff</p><p className="font-bold text-lg">{b.staff}</p></div>
              <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Today</p><p className="font-bold text-base text-primary">{b.sales}</p></div>
            </div>
            <div className="flex gap-2 mt-4">
              <Button variant="outline" size="sm" className="flex-1">View</Button>
              <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0">Manage</Button>
            </div>
          </Card>
        ))}
      </div>
    </PageShell>
  );
}