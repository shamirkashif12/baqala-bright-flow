import { useNavigate } from "react-router-dom";
import { Settings, ScanBarcode, ShoppingBag, CreditCard } from "lucide-react";
import { useSession } from "../lib/session";
import { Button } from "../components/ui/button";
import mimonyLogo from "../assets/mimony-logo.png";

const STEPS = [
  { icon: ScanBarcode, label: "Scan items" },
  { icon: ShoppingBag, label: "Review bag" },
  { icon: CreditCard, label: "Pay & go" },
];

export default function WelcomeScreen() {
  const navigate = useNavigate();
  const { branchName } = useSession();

  return (
    <div className="relative flex h-full flex-col items-center justify-center gap-8 sm:gap-10 overflow-hidden bg-gradient-to-br from-primary/10 via-background to-secondary p-4 sm:p-8 text-center">
      {/* Decorative ambient blobs — purely visual, kept off the tap target area */}
      <div className="pointer-events-none absolute -top-24 -left-24 h-64 w-64 sm:h-96 sm:w-96 rounded-full bg-primary/20 blur-3xl animate-blob-float" />
      <div
        className="pointer-events-none absolute -bottom-32 -right-16 h-72 w-72 sm:h-[28rem] sm:w-[28rem] rounded-full bg-accent/40 blur-3xl animate-blob-float"
        style={{ animationDelay: "3s" }}
      />

      <button
        type="button"
        aria-label="Reconfigure terminal"
        title="Reconfigure terminal (staff only)"
        onClick={() => navigate("/setup?step=pair")}
        className="absolute top-3 right-3 sm:top-4 sm:right-4 z-10 rounded-full p-2 text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
      >
        <Settings className="h-5 w-5" />
      </button>

      <div className="relative z-10 flex flex-col items-center gap-6 sm:gap-8 animate-fade-up">
        <div className="flex h-16 sm:h-20 items-center justify-center rounded-2xl bg-card px-5 sm:px-6 shadow-glow">
          <img src={mimonyLogo} alt="Mimony" className="h-8 sm:h-10 w-auto object-contain" />
        </div>

        <div>
          <h1 className="font-display text-3xl sm:text-4xl md:text-5xl font-bold text-primary break-words">Mimony Self-Checkout</h1>
          <p className="mt-2 text-base sm:text-lg text-muted-foreground">
            {branchName ? `${branchName} · Scan your own items and pay in seconds` : "Scan your own items and pay in seconds"}
          </p>
        </div>

        <div className="flex items-center gap-3 sm:gap-5">
          {STEPS.map(({ icon: Icon, label }, i) => (
            <div key={label} className="flex items-center gap-3 sm:gap-5">
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full bg-card border border-border shadow-card">
                  <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                </div>
                <span className="text-xs sm:text-sm text-muted-foreground">{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="h-px w-4 sm:w-8 bg-border" />}
            </div>
          ))}
        </div>

        <div className="rounded-full animate-pulse-ring">
          <Button
            className="h-auto w-full max-w-sm sm:w-auto px-8 sm:px-12 md:px-16 py-5 sm:py-6 md:py-8 text-xl sm:text-2xl md:text-3xl gradient-primary text-primary-foreground border-0 shadow-glow rounded-full"
            onClick={() => navigate("/scan")}
          >
            Tap to Start
          </Button>
        </div>
      </div>
    </div>
  );
}
