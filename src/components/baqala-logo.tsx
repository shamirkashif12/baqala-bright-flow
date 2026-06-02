import { cn } from "@/lib/utils";
import logoAsset from "@/assets/mimony-logo.png.asset.json";

export function BaqalaLogo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative rounded-xl bg-white px-2 py-1.5 shadow-card flex items-center justify-center">
        <img
          src={logoAsset.url}
          alt="Mimony"
          className={cn("object-contain", showText ? "h-6 w-auto" : "h-7 w-7")}
          style={!showText ? { objectPosition: "left center", width: "1.75rem" } : undefined}
        />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="text-[10px] uppercase tracking-[0.18em] opacity-70">Baqala ECR</span>
          <span className="text-[10px] uppercase tracking-[0.15em] opacity-50 mt-1">KSA POS Suite</span>
        </div>
      )}
    </div>
  );
}