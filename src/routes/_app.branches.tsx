import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Building2, MapPin, Phone, Plus, Search } from "lucide-react";
import { StatusBadge } from "@/components/module-placeholder";
import { api, type Branch } from "@/lib/api";

export const Route = createFileRoute("/_app/branches")({ component: Branches });

function Branches() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    api.getBranches().then(setBranches).finally(() => setLoading(false));
  }, []);

  const filtered = branches.filter(b =>
    !q
    || b.name.toLowerCase().includes(q.toLowerCase())
    || b.branchCode.toLowerCase().includes(q.toLowerCase())
    || (b.city ?? "").toLowerCase().includes(q.toLowerCase())
  );

  return (
    <PageShell
      title="Branches"
      subtitle="Multi-location management across the Kingdom"
      actions={
        <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5">
          <Plus className="h-4 w-4" />New Branch
        </Button>
      }
    >
      <div className="flex items-center gap-2">
        <div className="relative w-64">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search branches…"
            className="h-9 pl-8"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(b => (
            <Card key={b.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                    <Building2 className="h-5 w-5 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{b.name}</h3>
                    <p className="text-xs text-muted-foreground font-mono">{b.branchCode}</p>
                  </div>
                </div>
                <StatusBadge status={b.status} />
              </div>

              <div className="space-y-2 text-xs text-muted-foreground">
                {(b.city || b.address) && (
                  <div className="flex items-start gap-2">
                    <MapPin className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    <span>{[b.city, b.address].filter(Boolean).join(" — ")}</span>
                  </div>
                )}
                {b.contactNumber && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                    <span>{b.contactNumber}</span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-border/60">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Created</p>
                <p className="text-xs font-medium">{new Date(b.createdAt).toLocaleDateString("en-SA")}</p>
              </div>

              <div className="flex gap-2 mt-4">
                <Button variant="outline" size="sm" className="flex-1">View</Button>
                <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0">Manage</Button>
              </div>
            </Card>
          ))}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-10 text-muted-foreground text-sm">
              No branches found.
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
