import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { type HubConnection } from "@microsoft/signalr";
import {
  createCustomerDisplayConnection,
  idleCustomerDisplaySnapshot,
  type CustomerDisplaySnapshot,
} from "@/lib/customer-display";
import { useAuth } from "@/lib/auth";
import { api, type PairableTerminal } from "@/lib/api";
import { SAR } from "@/lib/currency";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Lock, ShoppingCart, CheckCircle2, Loader2, Copy, ArrowLeft, User, Award, Store,
} from "lucide-react";
import { toast } from "sonner";

// Full-screen, no app chrome — this is meant to face the customer, not the staff member, but it's
// still a protected route behind the normal staff login (Layer 1 of the spec's three-layer auth).
// It lives outside the _app.* prefix specifically to skip AppLayout's sidebar, not to skip auth —
// so this route re-implements the same token/expiry check _app.tsx does rather than inheriting it.
export const Route = createFileRoute("/customer-display")({
  ssr: false,
  validateSearch: (search) => ({ terminal: (search.terminal as string) || undefined }),
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const token = localStorage.getItem("baqala_token");
    const expiry = localStorage.getItem("baqala_session_expires");
    const expired = expiry ? Date.now() > parseInt(expiry, 10) : false;
    if (!token || expired) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: CustomerDisplayPage,
});

const STORAGE_KEY = "baqala_customer_display_terminal";
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidGuid(s: string | undefined | null): s is string {
  return !!s && GUID_RE.test(s);
}

// Reused between the idle header and the thank-you screen so a customer glancing between the till
// and this display perceives one consistent brand, per the spec's styling notes. Uses the app's own
// dark-purple sidebar gradient (not a generic slate/emerald one) so this screen reads as the same
// product as the till, not a different app.
const HERO_GRADIENT = "gradient-sidebar";

function CustomerDisplayPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { loading, canViewModule } = useAuth();
  const hasAccess = !loading && canViewModule("Customer Display");

  const [terminalId, setTerminalIdState] = useState<string | null>(() => {
    if (isValidGuid(search.terminal)) return search.terminal;
    return typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
  });

  const setTerminalId = (id: string | null) => {
    setTerminalIdState(id);
    if (id) localStorage.setItem(STORAGE_KEY, id);
    else localStorage.removeItem(STORAGE_KEY);
    navigate({ to: "/customer-display", search: { terminal: id ?? undefined }, replace: true });
  };

  const [pairableTerminals, setPairableTerminals] = useState<PairableTerminal[]>([]);
  const [pairableLoading, setPairableLoading] = useState(false);

  useEffect(() => {
    if (!hasAccess) return;
    setPairableLoading(true);
    api.getPairableTerminals()
      .then(setPairableTerminals)
      .catch(() => setPairableTerminals([]))
      .finally(() => setPairableLoading(false));
  }, [hasAccess]);

  const [joinState, setJoinState] = useState<"connecting" | "joined" | "restricted">("connecting");
  const [snapshot, setSnapshot] = useState<CustomerDisplaySnapshot>(idleCustomerDisplaySnapshot());
  const hubRef = useRef<HubConnection | null>(null);

  useEffect(() => {
    if (!hasAccess || !terminalId) return;
    setJoinState("connecting");
    // Switching (or first pairing to) a terminal must never show a stale cart from whatever was
    // last rendered — reset to idle immediately, the real snapshot arrives once joined.
    setSnapshot(idleCustomerDisplaySnapshot());

    const hub = createCustomerDisplayConnection();
    hubRef.current = hub;
    hub.on("CartUpdated", (s: CustomerDisplaySnapshot) => setSnapshot(s));

    const join = () =>
      hub.invoke("JoinTerminal", terminalId)
        .then(() => setJoinState("joined"))
        .catch(() => setJoinState("restricted"));

    hub.onreconnecting(() => setJoinState("connecting"));
    hub.onreconnected(() => { void join(); });
    hub.start().then(join).catch(() => setJoinState("restricted"));

    return () => {
      hub.stop();
      if (hubRef.current === hub) hubRef.current = null;
    };
  }, [hasAccess, terminalId]);

  const currentTerminal = pairableTerminals.find((t) => t.id === terminalId);
  const registerLabel = currentTerminal
    ? `${currentTerminal.branch?.name ?? "Branch"} · ${currentTerminal.name}`
    : "";

  const copyPickerLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/customer-display`);
    toast.success("Link copied");
  };

  if (loading) return null;

  if (!hasAccess) {
    return (
      <GateScreen icon={<Lock className="h-14 w-14" />} title="Access Restricted">
        <p>You don't have access to the Customer Display.</p>
      </GateScreen>
    );
  }

  if (!terminalId) {
    return (
      <PickerScreen
        terminals={pairableTerminals}
        loading={pairableLoading}
        onPick={setTerminalId}
        onCopyLink={copyPickerLink}
      />
    );
  }

  if (joinState === "restricted") {
    return (
      <GateScreen icon={<Lock className="h-14 w-14" />} title="This register isn't available to you">
        <p className="mb-4">Ask a supervisor to pair this display with a register you're assigned to.</p>
        <Button variant="secondary" onClick={() => setTerminalId(null)}>
          <ArrowLeft className="h-4 w-4 mr-1.5" /> Choose a different register
        </Button>
      </GateScreen>
    );
  }

  if (joinState === "connecting") {
    return (
      <GateScreen icon={<Loader2 className="h-14 w-14 animate-spin" />} title="Connecting…">
        <p>Pairing with the register.</p>
      </GateScreen>
    );
  }

  if (snapshot.status === "Approved") {
    return <ThankYouScreen snapshot={snapshot} />;
  }

  if (snapshot.lines.length === 0) {
    return <IdleScreen registerLabel={registerLabel} />;
  }

  return <ActiveCartScreen snapshot={snapshot} registerLabel={registerLabel} />;
}

// ─── Shared gate (no-access / restricted / connecting) ───────────────────────────
function GateScreen({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center text-center px-8 text-white ${HERO_GRADIENT}`}>
      <div className="mb-6 text-white/70">{icon}</div>
      <h1 className="text-2xl font-semibold mb-3">{title}</h1>
      <div className="text-white/70 max-w-md">{children}</div>
    </div>
  );
}

// ─── Register picker ──────────────────────────────────────────────────────────────
function PickerScreen({
  terminals, loading, onPick, onCopyLink,
}: {
  terminals: PairableTerminal[];
  loading: boolean;
  onPick: (id: string) => void;
  onCopyLink: () => void;
}) {
  const [selected, setSelected] = useState<string>("");
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center px-8 text-white ${HERO_GRADIENT}`}>
      <Store className="h-12 w-12 text-primary-glow mb-4" />
      <h1 className="text-2xl font-semibold mb-1">Pair a Register</h1>
      <p className="text-white/70 mb-8 text-center max-w-sm">
        Choose which register this screen should mirror.
      </p>
      <div className="w-full max-w-sm space-y-3">
        <Select value={selected} onValueChange={setSelected}>
          <SelectTrigger className="bg-white/10 border-white/20 text-white">
            <SelectValue placeholder={loading ? "Loading registers…" : "Select a register"} />
          </SelectTrigger>
          <SelectContent>
            {terminals.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.branch?.name ?? "Branch"} · {t.name}
              </SelectItem>
            ))}
            {!loading && terminals.length === 0 && (
              <div className="px-3 py-2 text-sm text-muted-foreground">No registers available to you</div>
            )}
          </SelectContent>
        </Select>
        <Button className="w-full" disabled={!selected} onClick={() => onPick(selected)}>
          Pair
        </Button>
        <Button variant="outline" className="w-full bg-white/5 border-white/20 text-white hover:bg-white/10" onClick={onCopyLink}>
          <Copy className="h-4 w-4 mr-1.5" /> Copy this page's link
        </Button>
      </div>
    </div>
  );
}

// ─── Idle / empty cart ────────────────────────────────────────────────────────────
function IdleScreen({ registerLabel }: { registerLabel: string }) {
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center text-center px-8 text-white ${HERO_GRADIENT}`}>
      <ShoppingCart className="h-20 w-20 text-primary-glow animate-pulse mb-6" />
      <h1 className="text-3xl font-semibold mb-2">Welcome!</h1>
      <p className="text-white/70 max-w-md">Your order will appear here as items are scanned.</p>
      {registerLabel && <p className="text-white/40 text-sm mt-8">{registerLabel}</p>}
    </div>
  );
}

// ─── Thank-you / approved ─────────────────────────────────────────────────────────
function ThankYouScreen({ snapshot }: { snapshot: CustomerDisplaySnapshot }) {
  return (
    <div className={`min-h-screen flex flex-col items-center justify-center text-center px-8 text-white ${HERO_GRADIENT}`}>
      <div className="rounded-full bg-brand-teal/20 p-6 mb-6">
        <CheckCircle2 className="h-20 w-20 text-brand-teal" />
      </div>
      <h1 className="text-4xl font-bold mb-2">Thank You!</h1>
      {snapshot.orderNo && <p className="text-white/60 mb-6">Order #{snapshot.orderNo}</p>}
      <div className="text-5xl font-bold">
        <SAR amount={snapshot.total} />
      </div>
    </div>
  );
}

// ─── Active cart (building / processing) ──────────────────────────────────────────
function ActiveCartScreen({
  snapshot, registerLabel,
}: {
  snapshot: CustomerDisplaySnapshot;
  registerLabel: string;
}) {
  const prevTotalRef = useRef(snapshot.total);
  const [pop, setPop] = useState(0);
  useEffect(() => {
    if (prevTotalRef.current !== snapshot.total) {
      prevTotalRef.current = snapshot.total;
      setPop((p) => p + 1);
    }
  }, [snapshot.total]);

  const hasLoyalty = !!snapshot.customerName && (snapshot.customerLoyaltyTier || snapshot.customerLoyaltyPoints != null);

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground">
      <style>{`
        @keyframes cd-line-in { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes cd-pop { 0% { transform: scale(1); } 40% { transform: scale(1.06); } 100% { transform: scale(1); } }
      `}</style>

      {/* Header */}
      <div className="border-b border-t-2 border-t-primary bg-card px-8 py-5 flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-primary" />
            {registerLabel || "Customer Display"}
          </p>
          {snapshot.customerName && (
            <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
              <User className="h-3.5 w-3.5" /> {snapshot.customerName}
              {hasLoyalty && (
                <span className="ml-2 inline-flex items-center gap-1 text-amber-600">
                  <Award className="h-3.5 w-3.5" />
                  {snapshot.customerLoyaltyTier}
                  {snapshot.customerLoyaltyPoints != null && ` · ${snapshot.customerLoyaltyPoints} pts`}
                  {snapshot.customerLoyaltyPointsSarValue != null && (
                    <> (<SAR amount={snapshot.customerLoyaltyPointsSarValue} />)</>
                  )}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {snapshot.status === "Processing" && (
        <div className="bg-amber-500 text-amber-950 text-center py-2.5 font-medium animate-pulse">
          Processing payment…
        </div>
      )}

      {/* Line items */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <div className="max-w-3xl mx-auto space-y-3">
          {snapshot.lines.map((line, idx) => (
            <div
              key={`${line.name}-${idx}`}
              className="flex items-center justify-between rounded-lg border bg-card px-4 py-3"
              style={{ animation: "cd-line-in 300ms ease-out both", animationDelay: `${Math.min(idx, 20) * 40}ms` }}
            >
              <div>
                <p className="font-medium">{line.name}</p>
                <p className="text-sm text-muted-foreground">
                  {line.qty} {line.uom} × <SAR amount={line.unitPrice} />
                </p>
              </div>
              <p className="text-lg font-semibold"><SAR amount={line.lineTotal} /></p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer totals */}
      <div className="border-t bg-card px-8 py-5">
        <div className="max-w-3xl mx-auto space-y-1.5">
          <Row label="Subtotal" value={snapshot.subtotal} />
          {snapshot.discounts.map((d, i) => <Row key={`d-${i}`} label={d.label} value={-d.amount} muted />)}
          {snapshot.fees.map((f, i) => <Row key={`f-${i}`} label={f.label} value={f.amount} muted />)}
          <Row label="VAT" value={snapshot.vat} />
          <div className="flex items-center justify-between pt-2 border-t mt-2">
            <span className="text-xl font-semibold">Total</span>
            <span key={pop} className="text-3xl font-bold text-primary" style={{ animation: "cd-pop 350ms ease-out" }}>
              <SAR amount={snapshot.total} />
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${muted ? "text-muted-foreground" : ""}`}>
      <span>{label}</span>
      <span>{value < 0 ? "-" : ""}<SAR amount={Math.abs(value)} /></span>
    </div>
  );
}
