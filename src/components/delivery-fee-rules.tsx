import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, Plus, Pencil, Trash2, Power, MapPin, Ban, Truck } from "lucide-react";
import { AddressMapPicker } from "@/components/address-map-picker";
import { SARIcon } from "@/lib/currency";
import {
  api,
  type DeliveryFeeRule,
  type DeliveryFeeRulePayload,
  type DeliveryFeeRuleType,
  type DeliveryFeeQuote,
} from "@/lib/api";

const RULE_TYPE_LABELS: Record<DeliveryFeeRuleType, string> = {
  flat: "Flat — every delivery",
  radius: "Distance from a point",
  bbox: "Map area (rectangle)",
};

type Form = {
  name: string;
  ruleType: DeliveryFeeRuleType;
  centerLatitude: number | null;
  centerLongitude: number | null;
  minDistanceKm: string;
  maxDistanceKm: string;
  minLatitude: string;
  maxLatitude: string;
  minLongitude: string;
  maxLongitude: string;
  feeAmount: string;
  freeAboveOrderAmount: string;
  isServiceable: boolean;
  unserviceableMessage: string;
  priority: string;
};

const EMPTY_FORM: Form = {
  name: "",
  ruleType: "flat",
  centerLatitude: null,
  centerLongitude: null,
  minDistanceKm: "0",
  maxDistanceKm: "",
  minLatitude: "",
  maxLatitude: "",
  minLongitude: "",
  maxLongitude: "",
  feeAmount: "",
  freeAboveOrderAmount: "",
  isServiceable: true,
  unserviceableMessage: "",
  priority: "0",
};

const num = (v: string): number | null => {
  if (v.trim() === "") return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
};

// One line summarising what a rule matches, so the list is readable without opening each row —
// the whole risk with geographic rules is that their effect isn't obvious from a name alone.
function describe(rule: DeliveryFeeRule): string {
  if (rule.ruleType === "radius") {
    const from = rule.minDistanceKm ?? 0;
    const to = rule.maxDistanceKm;
    return to != null ? `${from}–${to} km from the pin` : `Beyond ${from} km from the pin`;
  }
  if (rule.ruleType === "bbox") {
    return `Inside ${rule.minLatitude}, ${rule.minLongitude} → ${rule.maxLatitude}, ${rule.maxLongitude}`;
  }
  return "Every delivery";
}

function RuleDialog({
  open,
  rule,
  branchId,
  onClose,
  onDone,
}: {
  open: boolean;
  rule: DeliveryFeeRule | null; // null = create
  // The branch this rule belongs to. Rules are always created branch-scoped here: POS Settings is
  // a per-branch screen, and a tenant-wide rule created from it would silently change every other
  // branch's delivery pricing too.
  branchId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setForm(
      rule
        ? {
            name: rule.name,
            ruleType: rule.ruleType,
            centerLatitude: rule.centerLatitude ?? null,
            centerLongitude: rule.centerLongitude ?? null,
            minDistanceKm: rule.minDistanceKm != null ? String(rule.minDistanceKm) : "0",
            maxDistanceKm: rule.maxDistanceKm != null ? String(rule.maxDistanceKm) : "",
            minLatitude: rule.minLatitude != null ? String(rule.minLatitude) : "",
            maxLatitude: rule.maxLatitude != null ? String(rule.maxLatitude) : "",
            minLongitude: rule.minLongitude != null ? String(rule.minLongitude) : "",
            maxLongitude: rule.maxLongitude != null ? String(rule.maxLongitude) : "",
            feeAmount: String(rule.feeAmount),
            freeAboveOrderAmount:
              rule.freeAboveOrderAmount != null ? String(rule.freeAboveOrderAmount) : "",
            isServiceable: rule.isServiceable,
            unserviceableMessage: rule.unserviceableMessage ?? "",
            priority: String(rule.priority),
          }
        : EMPTY_FORM,
    );
  }, [open, rule]);

  const set =
    <K extends keyof Form>(key: K) =>
    (value: Form[K]) =>
      setForm((p) => ({ ...p, [key]: value }));

  const save = async () => {
    if (!form.name.trim())
      return setError("Give the rule a name — it's what the customer sees on their bill.");
    const fee = num(form.feeAmount) ?? 0;
    if (fee < 0) return setError("The delivery fee can't be negative.");

    if (form.ruleType === "radius") {
      if (form.centerLatitude == null || form.centerLongitude == null)
        return setError("Pick the centre point on the map.");
      const max = num(form.maxDistanceKm);
      if (max == null && form.isServiceable)
        return setError("Set a maximum distance, or mark the area as not deliverable.");
      if (max != null && (num(form.minDistanceKm) ?? 0) >= max)
        return setError("The maximum distance must be greater than the minimum.");
    }
    if (form.ruleType === "bbox") {
      const [minLat, maxLat, minLng, maxLng] = [
        num(form.minLatitude),
        num(form.maxLatitude),
        num(form.minLongitude),
        num(form.maxLongitude),
      ];
      if (minLat == null || maxLat == null || minLng == null || maxLng == null)
        return setError("An area rule needs all four boundary coordinates.");
      if (minLat >= maxLat) return setError("The north edge must be above the south edge.");
      if (minLng >= maxLng) return setError("The east edge must be right of the west edge.");
    }

    const payload: DeliveryFeeRulePayload = {
      branchId,
      name: form.name.trim(),
      ruleType: form.ruleType,
      centerLatitude: form.centerLatitude,
      centerLongitude: form.centerLongitude,
      minDistanceKm: num(form.minDistanceKm),
      maxDistanceKm: num(form.maxDistanceKm),
      minLatitude: num(form.minLatitude),
      maxLatitude: num(form.maxLatitude),
      minLongitude: num(form.minLongitude),
      maxLongitude: num(form.maxLongitude),
      feeAmount: fee,
      freeAboveOrderAmount: num(form.freeAboveOrderAmount),
      isServiceable: form.isServiceable,
      unserviceableMessage: form.unserviceableMessage.trim() || null,
      priority: num(form.priority) ?? 0,
      isActive: rule?.isActive ?? true,
    };

    setSaving(true);
    setError("");
    try {
      if (rule) {
        await api.updateDeliveryFeeRule(rule.id, payload);
        toast.success("Delivery rule updated");
      } else {
        await api.createDeliveryFeeRule(payload);
        toast.success("Delivery rule created");
      }
      onDone();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save the delivery rule.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rule ? "Edit delivery rule" : "New delivery rule"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          <div>
            <Label className="text-xs">Name *</Label>
            <Input
              className="h-9 mt-1"
              placeholder="Inner city (0–5 km)"
              value={form.name}
              onChange={(e) => {
                set("name")(e.target.value);
                setError("");
              }}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Shown on the customer's order summary next to the charge.
            </p>
          </div>

          <div>
            <Label className="text-xs">Applies to</Label>
            <Select
              value={form.ruleType}
              onValueChange={(v) => set("ruleType")(v as DeliveryFeeRuleType)}
            >
              <SelectTrigger className="h-9 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(RULE_TYPE_LABELS) as DeliveryFeeRuleType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {RULE_TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              Distance and area rules match the pin the customer drops on the checkout map. An order
              placed without a pin can only match a flat rule.
            </p>
          </div>

          {form.ruleType === "radius" && (
            <>
              <div>
                <Label className="text-xs">Centre point *</Label>
                <div className="mt-1 rounded-xl overflow-hidden border border-border/60">
                  <AddressMapPicker
                    latitude={form.centerLatitude}
                    longitude={form.centerLongitude}
                    onLocationChange={(lat, lng) => {
                      setForm((p) => ({ ...p, centerLatitude: lat, centerLongitude: lng }));
                      setError("");
                    }}
                  />
                </div>
                {form.centerLatitude != null && (
                  <p className="text-[10px] text-muted-foreground mt-1 font-mono">
                    {form.centerLatitude.toFixed(5)}, {form.centerLongitude?.toFixed(5)}
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">From (km)</Label>
                  <Input
                    className="h-9 mt-1"
                    type="number"
                    step="0.1"
                    min={0}
                    value={form.minDistanceKm}
                    onChange={(e) => {
                      set("minDistanceKm")(e.target.value);
                      setError("");
                    }}
                  />
                </div>
                <div>
                  <Label className="text-xs">To (km){form.isServiceable ? " *" : ""}</Label>
                  <Input
                    className="h-9 mt-1"
                    type="number"
                    step="0.1"
                    min={0}
                    placeholder="5"
                    value={form.maxDistanceKm}
                    onChange={(e) => {
                      set("maxDistanceKm")(e.target.value);
                      setError("");
                    }}
                  />
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground -mt-1">
                Build rings by adding several rules: 0–5 km, then 5–15 km, and so on. The tightest
                matching ring wins.
              </p>
            </>
          )}

          {form.ruleType === "bbox" && (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">South latitude *</Label>
                <Input
                  className="h-9 mt-1"
                  type="number"
                  step="0.0001"
                  placeholder="24.6000"
                  value={form.minLatitude}
                  onChange={(e) => {
                    set("minLatitude")(e.target.value);
                    setError("");
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">North latitude *</Label>
                <Input
                  className="h-9 mt-1"
                  type="number"
                  step="0.0001"
                  placeholder="24.8000"
                  value={form.maxLatitude}
                  onChange={(e) => {
                    set("maxLatitude")(e.target.value);
                    setError("");
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">West longitude *</Label>
                <Input
                  className="h-9 mt-1"
                  type="number"
                  step="0.0001"
                  placeholder="46.5000"
                  value={form.minLongitude}
                  onChange={(e) => {
                    set("minLongitude")(e.target.value);
                    setError("");
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">East longitude *</Label>
                <Input
                  className="h-9 mt-1"
                  type="number"
                  step="0.0001"
                  placeholder="46.8000"
                  value={form.maxLongitude}
                  onChange={(e) => {
                    set("maxLongitude")(e.target.value);
                    setError("");
                  }}
                />
              </div>
            </div>
          )}

          <div className="flex items-start justify-between gap-4 p-3 rounded-xl border border-border/60">
            <div>
              <p className="text-sm font-medium">We deliver here</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Turn off to refuse orders from this area at checkout instead of charging for them.
              </p>
            </div>
            <Switch checked={form.isServiceable} onCheckedChange={set("isServiceable")} />
          </div>

          {!form.isServiceable ? (
            <div>
              <Label className="text-xs">Message shown to the customer</Label>
              <Textarea
                className="mt-1 text-sm"
                rows={2}
                placeholder="Sorry — we don't deliver to that area yet. Try collecting in store."
                value={form.unserviceableMessage}
                onChange={(e) => set("unserviceableMessage")(e.target.value)}
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Delivery fee (SAR) *</Label>
                <Input
                  className="h-9 mt-1"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="0.00"
                  value={form.feeAmount}
                  onChange={(e) => {
                    set("feeAmount")(e.target.value);
                    setError("");
                  }}
                />
              </div>
              <div>
                <Label className="text-xs">Free above (SAR)</Label>
                <Input
                  className="h-9 mt-1"
                  type="number"
                  step="0.01"
                  min={0}
                  placeholder="Never"
                  value={form.freeAboveOrderAmount}
                  onChange={(e) => set("freeAboveOrderAmount")(e.target.value)}
                />
              </div>
            </div>
          )}

          <div>
            <Label className="text-xs">Priority</Label>
            <Input
              className="h-9 mt-1 w-28"
              type="number"
              step="1"
              value={form.priority}
              onChange={(e) => set("priority")(e.target.value)}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Higher wins when two rules both match an address.
            </p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin me-1.5" />}
            {rule ? "Save changes" : "Create rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// "What would we charge to deliver here?" against the real resolver. Overlapping geographic rules
// don't have a readable combined effect, so configuring them without a way to test a pin means
// finding out from a customer.
function PreviewPanel({ branchId }: { branchId: string }) {
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [subtotal, setSubtotal] = useState("100");
  const [result, setResult] = useState<DeliveryFeeQuote | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async (latitude: number | null, longitude: number | null, orderSubtotal: string) => {
    setLoading(true);
    try {
      setResult(
        await api.previewDeliveryFee({
          branchId,
          latitude,
          longitude,
          orderSubtotal: Number(orderSubtotal) || 0,
        }),
      );
    } catch {
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-primary" />
        <p className="text-sm font-medium">Test an address</p>
      </div>
      <div className="rounded-xl overflow-hidden border border-border/60">
        <AddressMapPicker
          latitude={lat}
          longitude={lng}
          onLocationChange={(la, ln) => {
            setLat(la);
            setLng(ln);
            run(la, ln, subtotal);
          }}
        />
      </div>
      <div className="flex items-end gap-2">
        <div className="w-40">
          <Label className="text-xs">Order subtotal (SAR)</Label>
          <Input
            className="h-9 mt-1"
            type="number"
            step="0.01"
            min={0}
            value={subtotal}
            onChange={(e) => setSubtotal(e.target.value)}
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9"
          disabled={loading}
          onClick={() => run(lat, lng, subtotal)}
        >
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Check"}
        </Button>
      </div>

      {result && (
        <div className="rounded-xl border border-border/60 p-3 text-sm space-y-1">
          {!result.isServiceable ? (
            <p className="text-destructive flex items-start gap-1.5">
              <Ban className="h-4 w-4 shrink-0 mt-0.5" />
              {result.unserviceableMessage ?? "Not deliverable."}
            </p>
          ) : (
            <p className="flex items-center gap-1.5 font-semibold">
              <Truck className="h-4 w-4 text-primary" />
              {result.amount > 0 ? (
                <>
                  <SARIcon />
                  {result.amount.toFixed(2)}
                </>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400">Free delivery</span>
              )}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {result.source === "rule"
              ? `Matched "${result.ruleName}"`
              : result.source === "settings"
                ? "No rule matched — branch default fee"
                : result.source === "blocked"
                  ? `Blocked by "${result.ruleName}"`
                  : "No rule and no default fee — delivery is free"}
            {result.distanceKm != null && ` · ${result.distanceKm} km away`}
            {result.waivedByThreshold && " · waived by the free-delivery threshold"}
          </p>
        </div>
      )}
    </Card>
  );
}

export function DeliveryFeeRules({ branchId, canEdit }: { branchId: string; canEdit: boolean }) {
  const [rules, setRules] = useState<DeliveryFeeRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<DeliveryFeeRule | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    try {
      setRules(await api.getDeliveryFeeRules({ branchId: [branchId] }));
    } catch {
      setRules([]);
    } finally {
      setLoading(false);
    }
  }, [branchId]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (r: DeliveryFeeRule) => {
    setBusyId(r.id);
    try {
      await api.toggleDeliveryFeeRule(r.id);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to toggle the rule");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (r: DeliveryFeeRule) => {
    setBusyId(r.id);
    try {
      await api.deleteDeliveryFeeRule(r.id);
      toast.success("Delivery rule deleted");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete the rule");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Delivery zones</p>
          <p className="text-xs text-muted-foreground">
            Charge by distance or area. Where no zone matches, the branch default above applies.
          </p>
        </div>
        {canEdit && (
          <Button
            size="sm"
            className="h-9 gap-1.5"
            disabled={!branchId}
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-4 w-4" /> New zone
          </Button>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-muted-foreground">Loading…</div>
        ) : rules.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            No delivery zones — every order is charged the branch default fee above.
          </div>
        ) : (
          <div className="divide-y">
            {rules.map((r) => (
              <div
                key={r.id}
                className={`flex items-center gap-3 p-3 ${r.isActive ? "" : "opacity-50"}`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-medium truncate">{r.name}</p>
                    {r.branchId == null && (
                      <Badge variant="outline" className="text-[10px]">
                        All branches
                      </Badge>
                    )}
                    {!r.isServiceable && (
                      <Badge variant="destructive" className="text-[10px]">
                        Not deliverable
                      </Badge>
                    )}
                    {r.priority !== 0 && (
                      <Badge variant="secondary" className="text-[10px]">
                        Priority {r.priority}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {describe(r)}
                    {r.freeAboveOrderAmount != null &&
                      ` · free above SAR ${r.freeAboveOrderAmount.toFixed(2)}`}
                  </p>
                </div>
                <div className="text-sm font-semibold tabular-nums shrink-0">
                  {r.isServiceable ? (
                    r.feeAmount > 0 ? (
                      <>
                        <SARIcon />
                        {r.feeAmount.toFixed(2)}
                      </>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 text-xs">Free</span>
                    )
                  ) : (
                    <span className="text-muted-foreground text-xs">—</span>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={busyId === r.id}
                      onClick={() => {
                        setEditing(r);
                        setDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      disabled={busyId === r.id}
                      title={r.isActive ? "Deactivate" : "Activate"}
                      onClick={() => toggle(r)}
                    >
                      <Power className={`h-3.5 w-3.5 ${r.isActive ? "text-emerald-600" : ""}`} />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      disabled={busyId === r.id}
                      onClick={() => remove(r)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {branchId && <PreviewPanel branchId={branchId} />}

      <RuleDialog
        open={dialogOpen}
        rule={editing}
        branchId={branchId}
        onClose={() => setDialogOpen(false)}
        onDone={load}
      />
    </div>
  );
}
