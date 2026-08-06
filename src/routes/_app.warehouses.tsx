import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { MetricCard } from "@/components/metric-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SearchableMultiSelect } from "@/components/report-filters/searchable-multi-select";
import { Skeleton } from "@/components/ui/skeleton";
import { Eye, Warehouse, Plus, Pencil, MapPin, User, CheckCircle, Package } from "lucide-react";
import { api, type Warehouse as WarehouseType } from "@/lib/api";
import { WarehouseFormSheet } from "@/components/warehouse-form-sheet";
import { usePermission } from "@/lib/use-permission";

export const Route = createFileRoute("/_app/warehouses")({ component: Warehouses });

// ─── Warehouse Management Tab ─────────────────────────────────────────────────

function WarehouseManagement() {
  const navigate = useNavigate();
  const { canCreate, canEdit } = usePermission("Warehouses");
  const [warehouses, setWarehouses] = useState<WarehouseType[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<WarehouseType | null>(null);
  const viewWarehouse = (id: string) => navigate({ to: "/warehouses/$warehouseId", params: { warehouseId: id } });

  const load = () => {
    setLoading(true);
    api.getWarehouses()
      .then(w => { setWarehouses(w); setLoadError(false); })
      // Keep previously loaded warehouses on failure — an unhandled rejection here used to
      // render zero tiles / an empty list as if loaded (86eyag3ny).
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return warehouses.filter(w => {
      const mq = !q || w.name.toLowerCase().includes(q.toLowerCase()) || w.code.toLowerCase().includes(q.toLowerCase()) || (w.city?.toLowerCase().includes(q.toLowerCase()) ?? false);
      const ms = statusFilter.length === 0 || statusFilter.includes(w.status);
      return mq && ms;
    });
  }, [warehouses, q, statusFilter]);

  const totalWH = warehouses.length;
  const activeWH = warehouses.filter(w => w.status === "active").length;
  const totalSKUs = warehouses.reduce((s, w) => s + (w.stock?.length ?? 0), 0);

  return (
    <div className="space-y-5">
      {loadError && <LoadErrorBanner onRetry={load} />}
      <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(200px,1fr))]">
        <MetricCard
          label="Total Warehouses" value={String(totalWH)} icon={Warehouse} accent="primary"
          onClick={() => setStatusFilter([])} active={statusFilter.length === 0}
        />
        <MetricCard
          label="Active" value={String(activeWH)} icon={CheckCircle} accent="success"
          onClick={() => setStatusFilter(v => v.length === 1 && v[0] === "active" ? [] : ["active"])}
          active={statusFilter.length === 1 && statusFilter[0] === "active"}
        />
        <MetricCard label="SKUs Managed" value={String(totalSKUs)} icon={Package} accent="default" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, code, city…" className="h-9 w-64" />
        <div className="w-36">
          <SearchableMultiSelect
            placeholder="All Statuses"
            options={[
              { id: "active", label: "Active" },
              { id: "inactive", label: "Inactive" },
            ]}
            selected={statusFilter}
            onChange={setStatusFilter}
          />
        </div>
        <div className="flex-1" />
        {canCreate && (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Warehouse
          </Button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {warehouses.length === 0 ? "No warehouses yet. Create your first one." : "No warehouses match your search."}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map(w => (
            <Card
              key={w.id}
              className="border-border/60 shadow-card hover:border-primary/30 transition-all cursor-pointer"
              onClick={() => viewWarehouse(w.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
                      <Warehouse className="h-4.5 w-4.5 text-primary-foreground" />
                    </div>
                    <div>
                      <p className="font-semibold text-sm leading-tight">{w.name}</p>
                      <p className="text-xs font-mono text-muted-foreground">{w.code}</p>
                    </div>
                  </div>
                  <Badge variant="outline" className={w.status === "active" ? "text-xs bg-success/15 text-success border-success/30" : "text-xs bg-muted text-muted-foreground"}>
                    {w.status}
                  </Badge>
                </div>
                <div className="text-center border-t border-border/40 pt-3">
                  <p className="text-sm font-bold">{w.stock?.length ?? 0}</p>
                  <p className="text-xs text-muted-foreground">SKUs</p>
                </div>
                {(w.city || w.contactPerson) && (
                  <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground border-t border-border/30 pt-3">
                    {w.city && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{w.city}</span>}
                    {w.contactPerson && <span className="flex items-center gap-1"><User className="h-3 w-3" />{w.contactPerson}</span>}
                  </div>
                )}
                <div className="mt-3 flex gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="ghost" className="h-7 text-xs px-2 gap-1" onClick={() => viewWarehouse(w.id)}>
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  {canEdit && (
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2 gap-1" onClick={() => { setEditTarget(w); setCreateOpen(true); }}>
                      <Pencil className="h-3.5 w-3.5" /> Edit
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <WarehouseFormSheet
        open={createOpen}
        onOpenChange={v => { setCreateOpen(v); if (!v) setEditTarget(null); }}
        warehouse={editTarget}
        onSaved={load}
      />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

function Warehouses() {
  return (
    <PageShell
      title="Warehouses"
      subtitle="Manage warehouse entities and stock — inter-branch stock movement is handled on the Stock Transfers page"
    >
      <WarehouseManagement />
    </PageShell>
  );
}
