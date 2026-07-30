import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { PageShell } from "@/components/app-topbar";
import { LoadErrorBanner } from "@/components/load-error-banner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, MapPin, Phone, Plus, Search, Pencil, Trash2, ShoppingBag, Terminal, Copy, Check, Printer, Download, QrCode } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { api, type Branch } from "@/lib/api";
import { toast } from "sonner";
import { usePermission } from "@/lib/use-permission";
import { isValidSaudiPhone } from "@/lib/validation";

export const Route = createFileRoute("/_app/branches")({ component: Branches });

type BranchStats = { orders: number; terminals: number };
type BranchForm = { name: string; nameAr: string; city: string; address: string; contactNumber: string; status: string; };

const emptyForm: BranchForm = { name: "", nameAr: "", city: "", address: "", contactNumber: "", status: "active" };

function FieldRow({ label, children, error }: { label: string; children: React.ReactNode; error?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-700 border-green-200",
    inactive: "bg-gray-100 text-gray-500 border-gray-200",
    disabled: "bg-red-100 text-red-600 border-red-200",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />{status}
    </span>
  );
}

// ─── View Sheet ───────────────────────────────────────────────────────────────
// Per-branch public ordering link + QR — every branch's ordering page is scoped to its own
// stock (see OnlineOrdersController's public catalog endpoint), so each needs its own code to
// print/post in-store, unlike the single tenant-wide QR the Loyalty Program page generates.
// Uses QRCodeCanvas (not the QRCodeSVG the loyalty page uses) specifically so "Download" can
// export a real PNG via canvas.toBlob() rather than only supporting copy/print.
function OnlineOrderingQrPanel({ branchId }: { branchId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/order/${branchId}`;

  const copy = async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const download = () => {
    canvasRef.current?.toBlob(blob => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `online-ordering-qr-${branchId}.png`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  };

  return (
    <Card className="p-4 border-border/60 shadow-card space-y-3">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
        <QrCode className="h-3.5 w-3.5" /> Online Ordering QR
      </p>
      {/* Stacked, not side-by-side like the Loyalty Program page's panel — this one lives inside
          a max-w-md Sheet, not an unconstrained page column, and the QR + Download/Print row
          together don't fit next to each other at that width without overflowing the card. */}
      <div className="flex justify-center">
        <div className="bg-white p-2 rounded-lg border border-border/60 print:shadow-none">
          <QRCodeCanvas ref={canvasRef} value={url} size={140} level="M" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground text-center">
        Print or display this QR at the branch — scanning it opens this branch's public ordering page.
      </p>
      <div className="flex items-center gap-2">
        <Input value={url} readOnly className="h-8 text-xs font-mono" />
        <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={copy}>
          {copied ? <Check className="h-3.5 w-3.5 text-green-600" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={download}>
          <Download className="h-3.5 w-3.5" /> Download
        </Button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5" onClick={() => window.print()}>
          <Printer className="h-3.5 w-3.5" /> Print
        </Button>
      </div>
    </Card>
  );
}

function ViewSheet({ branch, stats, onClose, onEdit }: {
  branch: Branch | null; stats?: BranchStats; onClose: () => void; onEdit: () => void;
}) {
  const { canEdit } = usePermission("Branches");
  if (!branch) return null;
  return (
    <Sheet open={!!branch} onOpenChange={v => !v && onClose()}>
      <SheetContent className="max-w-md overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <SheetTitle>{branch.name}</SheetTitle>
              <p className="text-xs text-muted-foreground font-mono">{branch.branchCode}</p>
            </div>
          </div>
        </SheetHeader>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <ShoppingBag className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{stats?.orders ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Total Orders</p>
          </div>
          <div className="rounded-xl bg-muted/40 p-3 text-center">
            <Terminal className="h-4 w-4 text-primary mx-auto mb-1" />
            <p className="text-xl font-bold">{stats?.terminals ?? "—"}</p>
            <p className="text-xs text-muted-foreground">Terminals</p>
          </div>
        </div>

        {/* Details */}
        <div className="mt-5 space-y-3 text-sm">
          {([
            ["Branch Code", branch.branchCode],
            ["Status", branch.status],
            ["City", branch.city ?? "—"],
            ["Address", branch.address ?? "—"],
            ["Phone", branch.contactNumber ?? "—"],
            ["Arabic Name", branch.nameAr ?? "—"],
            ["Created", new Date(branch.createdAt).toLocaleDateString("en-SA")],
          ] as [string, string][]).map(([l, v]) => (
            <div key={l} className="flex justify-between border-b border-border/40 pb-2">
              <span className="text-muted-foreground text-xs">{l}</span>
              <span className="font-medium text-xs text-right max-w-[200px]">{v}</span>
            </div>
          ))}
        </div>

        <div className="mt-5">
          <OnlineOrderingQrPanel branchId={branch.id} />
        </div>

        {canEdit && (
          <Button className="w-full mt-5 gradient-primary text-primary-foreground border-0 gap-2" onClick={() => { onClose(); onEdit(); }}>
            <Pencil className="h-4 w-4" /> Edit Branch
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Branch Form Dialog ───────────────────────────────────────────────────────
function BranchDialog({ open, branch, onClose, onDone }: {
  open: boolean; branch: Branch | null; onClose: () => void; onDone: () => void;
}) {
  const [form, setForm] = useState<BranchForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [phoneError, setPhoneError] = useState("");

  useEffect(() => {
    if (branch) {
      setForm({
        name: branch.name, nameAr: branch.nameAr ?? "",
        city: branch.city ?? "", address: branch.address ?? "",
        contactNumber: branch.contactNumber ?? "", status: branch.status,
      });
    } else {
      setForm(emptyForm);
    }
    setPhoneError("");
  }, [branch, open]);

  const set = (k: keyof BranchForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }));

  // Digits only, plus a single leading "+" for the country code (+966...) — filters out letters
  // and other characters as the cashier/admin types, instead of only catching it on save.
  const setPhone = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    const cleaned = (raw[0] === "+" ? "+" : "") + raw.replace(/[^\d]/g, "");
    setForm(p => ({ ...p, contactNumber: cleaned }));
  };

  const handleSave = async () => {
    if (!form.name) { toast.error("Branch name is required."); return; }
    if (form.contactNumber.trim() && !isValidSaudiPhone(form.contactNumber)) {
      setPhoneError("Enter a valid Saudi mobile number, e.g. +966501234567 or 0501234567.");
      return;
    }
    setPhoneError("");
    setSaving(true);
    try {
      if (branch) {
        await api.updateBranch(branch.id, form);
        toast.success("Branch updated.");
      } else {
        await api.createBranch(form);
        toast.success("Branch created.");
      }
      onDone(); onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save branch.");
    } finally { setSaving(false); }
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{branch ? "Edit Branch" : "New Branch"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="Branch Name (EN)">
              <Input value={form.name} onChange={set("name")} className="h-9" placeholder="Olaya — Riyadh HQ" />
            </FieldRow>
            <FieldRow label="Branch Name (AR)">
              <Input value={form.nameAr} onChange={set("nameAr")} className="h-9" dir="rtl" placeholder="فرع الرياض" />
            </FieldRow>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FieldRow label="City">
              <Input value={form.city} onChange={set("city")} className="h-9" placeholder="Riyadh" />
            </FieldRow>
            <FieldRow label="Phone (with country code)" error={phoneError}>
              <Input value={form.contactNumber} onChange={setPhone} className="h-9" maxLength={13} placeholder="+966501234567" inputMode="tel" />
            </FieldRow>
          </div>
          <FieldRow label="Address">
            <Input value={form.address} onChange={set("address")} className="h-9" placeholder="King Fahd Rd, Olaya" />
          </FieldRow>
          {branch && (
            <FieldRow label="Status">
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                  <SelectItem value="disabled">Disabled</SelectItem>
                </SelectContent>
              </Select>
            </FieldRow>
          )}
          <Button className="w-full gradient-primary text-primary-foreground border-0 mt-1" onClick={handleSave} disabled={saving}>
            {saving ? "Saving…" : branch ? "Save Changes" : "Create Branch"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────
function Branches() {
  const { canCreate, canEdit, canDelete } = usePermission("Branches");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [stats, setStats] = useState<Record<string, BranchStats>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [q, setQ] = useState("");
  const [viewBranch, setViewBranch] = useState<Branch | null>(null);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    // allSettled, not all: one sibling call failing must not discard the results that DID
    // arrive — that rendered 0/0/0 tiles and no branch card as if "loaded" (86eyag3ny).
    const [bs, orders, terminals] = await Promise.allSettled([
      api.getBranches(),
      api.getOrders(),
      api.getTerminals(),
    ]);
    if (bs.status === "fulfilled") {
      setBranches(bs.value);
      const s: Record<string, BranchStats> = {};
      bs.value.forEach(b => { s[b.id] = { orders: 0, terminals: 0 }; });
      if (orders.status === "fulfilled") orders.value.forEach((o: { branchId: string }) => { if (s[o.branchId]) s[o.branchId].orders++; });
      if (terminals.status === "fulfilled") terminals.value.forEach((t: { branchId: string }) => { if (s[t.branchId]) s[t.branchId].terminals++; });
      setStats(s);
    }
    setLoadError([bs, orders, terminals].some(r => r.status === "rejected"));
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleDelete = async (b: Branch) => {
    if (!confirm(`Disable branch "${b.name}"? It will no longer appear as active.`)) return;
    try {
      await api.deleteBranch(b.id);
      toast.success("Branch disabled.");
      load();
    } catch { toast.error("Failed to disable branch."); }
  };

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
        canCreate ? (
          <Button size="sm" className="gradient-primary text-primary-foreground border-0 shadow-glow gap-1.5" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" /> New Branch
          </Button>
        ) : undefined
      }
    >
      {loadError && <LoadErrorBanner onRetry={load} />}
      {/* Summary strip */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 border-border/60 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-green-100 flex items-center justify-center shrink-0">
            <Building2 className="h-4 w-4 text-green-600" />
          </div>
          <div>
            <p className="text-xl font-bold">{branches.filter(b => b.status === "active").length}</p>
            <p className="text-xs text-muted-foreground">Active Branches</p>
          </div>
        </Card>
        <Card className="p-3 border-border/60 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <ShoppingBag className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-xl font-bold">{Object.values(stats).reduce((s, v) => s + v.orders, 0)}</p>
            <p className="text-xs text-muted-foreground">Total Orders</p>
          </div>
        </Card>
        <Card className="p-3 border-border/60 flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
            <Terminal className="h-4 w-4 text-blue-600" />
          </div>
          <div>
            <p className="text-xl font-bold">{Object.values(stats).reduce((s, v) => s + v.terminals, 0)}</p>
            <p className="text-xs text-muted-foreground">Total Terminals</p>
          </div>
        </Card>
      </div>

      <div className="relative w-64">
        <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
        <Input value={q} onChange={e => setQ(e.target.value)} placeholder="Search branches…" className="h-9 pl-8" />
      </div>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-52 rounded-2xl" />)}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(b => {
            const bStats = stats[b.id];
            return (
              <Card key={b.id} className="p-5 border-border/60 shadow-card hover:shadow-elegant transition-all flex flex-col">
                {/* Header */}
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="h-11 w-11 rounded-xl gradient-primary flex items-center justify-center shadow-glow shrink-0">
                      <Building2 className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <div>
                      <h3 className="font-semibold leading-tight">{b.name}</h3>
                      <p className="text-xs text-muted-foreground font-mono">{b.branchCode}</p>
                    </div>
                  </div>
                  <StatusBadge status={b.status} />
                </div>

                {/* Info */}
                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {(b.city || b.address) && (
                    <div className="flex items-start gap-2">
                      <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span>{[b.city, b.address].filter(Boolean).join(" — ")}</span>
                    </div>
                  )}
                  {b.contactNumber && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{b.contactNumber}</span>
                    </div>
                  )}
                </div>

                {/* Stats */}
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center gap-2">
                    <ShoppingBag className="h-3.5 w-3.5 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-bold">{bStats?.orders ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Orders</p>
                    </div>
                  </div>
                  <div className="rounded-lg bg-muted/40 px-3 py-2 flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <div>
                      <p className="text-sm font-bold">{bStats?.terminals ?? 0}</p>
                      <p className="text-[10px] text-muted-foreground">Terminals</p>
                    </div>
                  </div>
                </div>

                {/* Created */}
                <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Created</p>
                    <p className="text-xs font-medium">{new Date(b.createdAt).toLocaleDateString("en-SA")}</p>
                  </div>
                  {canDelete && (
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10"
                      onClick={() => handleDelete(b)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-3">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => setViewBranch(b)}>View</Button>
                  {canEdit && (
                    <Button size="sm" className="flex-1 gradient-primary text-primary-foreground border-0"
                      onClick={() => setEditBranch(b)}>Manage</Button>
                  )}
                </div>
              </Card>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center py-10 text-muted-foreground text-sm">No branches found.</div>
          )}
        </div>
      )}

      <ViewSheet
        branch={viewBranch}
        stats={viewBranch ? stats[viewBranch.id] : undefined}
        onClose={() => setViewBranch(null)}
        onEdit={() => setEditBranch(viewBranch)}
      />
      <BranchDialog
        open={!!editBranch}
        branch={editBranch}
        onClose={() => setEditBranch(null)}
        onDone={load}
      />
      <BranchDialog
        open={createOpen}
        branch={null}
        onClose={() => setCreateOpen(false)}
        onDone={load}
      />
    </PageShell>
  );
}
