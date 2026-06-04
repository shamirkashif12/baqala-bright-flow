import { cn } from "@/lib/utils";
import mimonyLogo from "@/assets/mimony-logo.png.asset.json";

export function BaqalaLogo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {showText ? (
        <div className="flex flex-col leading-none">
          <img
            src={mimonyLogo.url}
            alt="MI Money"
            className="h-8 w-auto object-contain"
            loading="eager"
          />
          <span className="text-[10px] uppercase tracking-[0.18em] opacity-60 mt-1.5 pl-0.5">
            Mart ECR · KSA
          </span>
        </div>
      ) : (
        <div className="h-9 w-9 rounded-lg bg-white flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
          <img src={mimonyLogo.url} alt="MI Money" className="h-7 w-auto object-contain" />
        </div>
      )}
    </div>
  );
}