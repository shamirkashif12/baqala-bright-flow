import { cn } from "@/lib/utils";

export function BaqalaLogo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative h-9 w-9 rounded-xl gradient-primary flex items-center justify-center shadow-glow">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-primary-foreground" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {/* Receipt + bag hybrid */}
          <path d="M5 3h11l3 3v14a1 1 0 0 1-1.5.87L15 19l-2.5 1.5L10 19l-2.5 1.5L5 19V3z" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </svg>
        <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-warning border-2 border-sidebar" />
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="font-display font-extrabold text-base tracking-tight">Baqala<span className="text-primary-glow">ECR</span></span>
          <span className="text-[10px] uppercase tracking-[0.15em] opacity-60 mt-0.5">KSA POS Suite</span>
        </div>
      )}
    </div>
  );
}