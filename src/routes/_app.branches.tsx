import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, MapPin, Plus, Clock } from "lucide-react";
import { Toolbar, StatusBadge } from "@/components/module-placeholder";
import { api, type Branch } from "@/lib/api";

export const Route = createFileRoute("/_app/branches")({ component: Branches });

function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getBranches()
      .then(setBranches)
      .finally(() => setLoading(false));
  }, []);

  return (
    <PageShell title="Branches" subtitle="Multi-location management across the Kingdom">
      <Toolbar placeholder="Search branches…" primaryLabel="New Branch" primaryIcon={Plus} />
      {loading ? (
        <div className="text-muted-foreground text-sm">Loading…</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {branches.map((b) => (
            <Card key={b.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                    <Building2 className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{b.name}</h3>
                    <p className="text-xs text-muted-foreground">{b.branchCode}</p>
                  </div>
                </div>
                <StatusBadge status={b.status} />
              </div>
              <div className="space-y-2 text-xs text-muted-foreground">
                {b.address && <div className="flex items-center gap-2"><MapPin className="h-3.5 w-3.5" /> {b.address}</div>}
                {b.city && <div className="flex items-center gap-2"><Clock className="h-3.5 w-3.5" /> {b.city}</div>}
              </div>
              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1">View</Button>
                <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0">Manage</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
