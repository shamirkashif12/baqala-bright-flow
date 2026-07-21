import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Gift, ArrowUpCircle, ArrowDownCircle, Clock, RefreshCcw, Search } from "lucide-react";
import { api, type PublicLoyaltyProgram, type PublicLoyaltyLookup } from "@/lib/api";
import { SARIcon } from "@/lib/currency";

// Public, unauthenticated — reachable via a link/QR shown on receipts or in-store (see the
// "Public Loyalty Page" panel on /loyalty-program). Lives outside the _app.* route prefix, so it
// is not wrapped by RouteGuard/_app.tsx's token check and needs no sign-in.
export const Route = createFileRoute("/loyalty/$branchId")({ ssr: false, component: PublicLoyaltyPage });

function txIcon(type: string) {
  if (type === "earn") return <ArrowUpCircle className="h-4 w-4 text-green-500 shrink-0" />;
  if (type === "redeem") return <ArrowDownCircle className="h-4 w-4 text-red-500 shrink-0" />;
  if (type === "expire") return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
  if (type === "adjust") return <RefreshCcw className="h-4 w-4 text-blue-500 shrink-0" />;
  return <Gift className="h-4 w-4 text-purple-500 shrink-0" />;
}

function PublicLoyaltyPage() {
  const { branchId } = Route.useParams();
  const [program, setProgram] = useState<PublicLoyaltyProgram | null>(null);
  const [loadingProgram, setLoadingProgram] = useState(true);
  const [notAvailable, setNotAvailable] = useState(false);

  const [phone, setPhone] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [result, setResult] = useState<PublicLoyaltyLookup | null>(null);

  useEffect(() => {
    setLoadingProgram(true);
    api.getPublicLoyaltyProgram(branchId)
      .then(setProgram)
      .catch(() => setNotAvailable(true))
      .finally(() => setLoadingProgram(false));
  }, [branchId]);

  const brandColor = program?.brandColor ?? "#7c3aed";

  const handleLookup = async () => {
    if (!phone.trim()) return;
    setLookupLoading(true);
    setLookupError(null);
    setResult(null);
    try {
      setResult(await api.lookupPublicLoyalty(branchId, phone.trim()));
    } catch (e: unknown) {
      setLookupError(e instanceof Error ? e.message : "No loyalty account found for that phone number.");
    } finally {
      setLookupLoading(false);
    }
  };

  if (loadingProgram) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (notAvailable || !program) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-4">
        <Card className="p-8 text-center max-w-sm">
          <Gift className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="font-semibold">This loyalty page isn't available.</p>
          <p className="text-sm text-muted-foreground mt-1">Please check with the store for the correct link.</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col items-center px-4 py-10">
      <div className="w-full max-w-sm space-y-6">
        {/* Branding — the branch's own identity is the primary visual, not the platform's */}
        <div className="text-center space-y-2">
          {program.logoUrl
            ? <img src={program.logoUrl} alt={program.programName} className="h-16 w-16 rounded-full object-cover mx-auto border border-border/60" />
            : <div className="h-16 w-16 rounded-full mx-auto flex items-center justify-center" style={{ backgroundColor: `${brandColor}1a` }}>
                <Gift className="h-7 w-7" style={{ color: brandColor }} />
              </div>}
          <h1 className="text-xl font-bold">{program.programName}</h1>
          <p className="text-sm text-muted-foreground">{program.branchName}</p>
          {program.description && <p className="text-sm text-muted-foreground max-w-xs mx-auto">{program.description}</p>}
          <p className="text-xs text-muted-foreground pt-1">
            Earn {program.pointsPerCurrencyUnit} pt per <SARIcon />1 spent · {Math.round(1 / program.redemptionValuePerPoint)} pts = <SARIcon />1
          </p>
        </div>

        {/* Phone lookup */}
        <Card className="p-5 space-y-3" style={{ borderColor: `${brandColor}40` }}>
          <Label className="text-xs">Check your points balance</Label>
          <div className="flex gap-2">
            <Input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleLookup()}
              placeholder="Your phone number"
              className="h-10"
              type="tel"
            />
            <Button className="h-10 px-4 shrink-0 border-0 text-white" style={{ backgroundColor: brandColor }} onClick={handleLookup} disabled={lookupLoading}>
              {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
            </Button>
          </div>
          {lookupError && <p className="text-xs text-destructive">{lookupError}</p>}
        </Card>

        {/* Result */}
        {result && (
          <Card className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold">{result.fullName}</p>
                <p className="text-xs text-muted-foreground capitalize">{result.tier} member</p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold tabular-nums" style={{ color: brandColor }}>
                  {result.loyaltyBalance.toLocaleString()} pts
                </p>
                <p className="text-xs text-muted-foreground">
                  ≈ <SARIcon />{(result.loyaltyBalance * program.redemptionValuePerPoint).toFixed(2)}
                </p>
              </div>
            </div>

            {result.recentHistory.length > 0 && (
              <div className="space-y-1.5 pt-2 border-t">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Recent Activity</p>
                {result.recentHistory.map((tx, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    {txIcon(tx.transactionType)}
                    <span className="flex-1 min-w-0 truncate text-xs text-muted-foreground">
                      {tx.description ?? tx.transactionType}
                    </span>
                    <span className={`text-xs font-semibold tabular-nums ${tx.points > 0 ? "text-green-600" : "text-red-500"}`}>
                      {tx.points > 0 ? "+" : ""}{tx.points}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
