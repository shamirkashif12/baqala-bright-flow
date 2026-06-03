import { cn } from "@/lib/utils";

export function BaqalaLogo({ className, showText = true }: { className?: string; showText?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div className="relative h-10 w-10 rounded-xl bg-gradient-to-br from-primary to-primary/70 flex items-center justify-center shadow-glow shrink-0">
        <svg viewBox="0 0 32 32" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {/* Receipt + M mark */}
          <path d="M7 5h18v22l-3-2-3 2-3-2-3 2-3-2-3 2V5z" fill="white" fillOpacity="0.12" />
          <path d="M11 11l3 5 2-3 2 3 3-5" />
          <circle cx="16" cy="22" r="1.2" fill="currentColor" />
        </svg>
      </div>
      {showText && (
        <div className="flex flex-col leading-none">
          <span className="text-base font-extrabold tracking-tight">MI Money</span>
          <span className="text-[10px] uppercase tracking-[0.18em] opacity-60 mt-1">Mart ECR · KSA</span>
        </div>
      )}
    </div>
  );
}