import { cn } from "@/lib/utils";
import mimonyLogo from "@/assets/mimony-logo.png";

export function BaqalaLogo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      {showText ? (
        <div className="flex flex-col leading-none">
          <img
            src={mimonyLogo}
            alt="MI Money"
            className="h-8 w-auto object-contain"
            loading="eager"
          />
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sidebar-primary/80 mt-1 pl-0.5">
            Mart ECR · KSA
          </span>
        </div>
      ) : (
        <div className="h-7 w-10 rounded-md bg-white flex items-center justify-center shrink-0 shadow-sm overflow-hidden">
          <img src={mimonyLogo} alt="MI Money" className="h-full w-full object-cover object-left" />
        </div>
      )}
    </div>
  );
}