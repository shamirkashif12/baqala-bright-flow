import { useEffect, useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useSession } from "../lib/session";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { PrinterSetupStep } from "../components/PrinterSetup";
import { ApiError } from "../lib/api";

export default function SetupScreen() {
  const { pair, paired, terminalName } = useSession();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  // Staff can revisit this screen later without re-pairing (?step=printer) or to
  // deliberately re-pair a different/same terminal (?step=pair) — see the "Reconfigure"
  // link on the Welcome screen. With no ?step at all while already paired, a customer
  // just wandered in here by accident, so bounce them back to Welcome.
  const step = params.get("step");
  const [stage, setStage] = useState<"pair" | "printer">(step === "printer" ? "printer" : "pair");
  const [terminalCode, setTerminalCode] = useState("");
  const [pairingSecret, setPairingSecret] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const accidental = paired && stage === "pair" && step !== "printer" && step !== "pair";

  useEffect(() => {
    if (accidental) navigate("/", { replace: true });
  }, [accidental, navigate]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await pair(terminalCode.trim(), pairingSecret.trim());
      setStage("printer");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not reach the server — check the connection.");
    } finally {
      setLoading(false);
    }
  }

  if (accidental) return null;

  return (
    <div className="flex h-full items-center justify-center overflow-y-auto bg-muted p-4 sm:p-8">
      <Card className="w-full max-w-md shadow-elegant my-auto">
        {stage === "pair" ? (
          <>
            <CardHeader>
              <CardTitle className="font-display text-2xl">Self-Checkout Setup</CardTitle>
              <CardDescription>
                {paired
                  ? `Currently paired as "${terminalName}". Enter a different terminal code and pairing secret to re-pair this device.`
                  : "One-time setup. Enter the terminal code and pairing secret provided by staff."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="space-y-1">
                  <Label>Terminal code</Label>
                  <Input
                    className="h-12 text-lg"
                    placeholder="e.g. KIOSK-01"
                    value={terminalCode}
                    onChange={(e) => setTerminalCode(e.target.value)}
                    autoFocus
                    required
                  />
                </div>
                <div className="space-y-1">
                  <Label>Pairing secret</Label>
                  <Input
                    className="h-12 text-lg"
                    value={pairingSecret}
                    onChange={(e) => setPairingSecret(e.target.value)}
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={loading} className="h-12 text-base gradient-primary text-primary-foreground border-0">
                  {loading ? "Pairing…" : paired ? "Re-pair this terminal" : "Pair this terminal"}
                </Button>
                {paired && (
                  <Button type="button" variant="ghost" onClick={() => navigate("/", { replace: true })}>
                    Cancel
                  </Button>
                )}
              </form>
            </CardContent>
          </>
        ) : (
          <CardContent className="pt-6">
            <PrinterSetupStep onDone={() => navigate("/", { replace: true })} onSkip={() => navigate("/", { replace: true })} />
          </CardContent>
        )}
      </Card>
    </div>
  );
}
