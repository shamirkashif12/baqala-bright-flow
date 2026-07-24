import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ArrowRight, ArrowLeft, Bell, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type TourStep = {
  /** CSS selector for the element this step points at, e.g. '[data-tour="sidebar-nav"]' */
  target: string;
  /** Single instruction sentence, rendered as "Step N: {text}" */
  text: string;
  placement?: "top" | "bottom" | "left" | "right";
};

type Rect = { top: number; left: number; width: number; height: number };
const GAP = 14;
const CARD_W = 300;
const CARD_H_ESTIMATE = 110;
const ARROW = 8;

function getRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

// Tracks the live viewport position of the current step's target element, keeping it in
// sync while the guided scrollIntoView animates and while the user scrolls/resizes manually.
function useTargetRect(selector: string | null) {
  const [rect, setRect] = useState<Rect | null>(null);

  useLayoutEffect(() => {
    if (!selector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(selector);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ behavior: "smooth", block: "center" });

    let raf = 0;
    const measure = () => setRect(getRect(el));
    const loop = () => {
      measure();
      raf = requestAnimationFrame(loop);
    };
    loop();
    // scrollIntoView settles well under this window on any reasonable viewport distance.
    const stopLoop = setTimeout(() => cancelAnimationFrame(raf), 600);

    const onScrollOrResize = () => measure();
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(stopLoop);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [selector]);

  return rect;
}

function computePlacement(rect: Rect, placement: TourStep["placement"], cardW: number, cardH: number) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let p = placement ?? "bottom";

  if (p === "bottom" && rect.top + rect.height + GAP + cardH > vh) p = "top";
  if (p === "top" && rect.top - GAP - cardH < 0) p = "bottom";

  let top = 0;
  let left = 0;
  switch (p) {
    case "top":
      top = rect.top - GAP - cardH;
      left = rect.left + rect.width / 2 - cardW / 2;
      break;
    case "bottom":
      top = rect.top + rect.height + GAP;
      left = rect.left + rect.width / 2 - cardW / 2;
      break;
    case "left":
      top = rect.top + rect.height / 2 - cardH / 2;
      left = rect.left - GAP - cardW;
      break;
    case "right":
      top = rect.top + rect.height / 2 - cardH / 2;
      left = rect.left + rect.width + GAP;
      break;
  }
  const clampedLeft = Math.min(Math.max(left, GAP), vw - cardW - GAP);
  const clampedTop = Math.min(Math.max(top, GAP), vh - cardH - GAP);

  // Where the pointer tail should sit along the card's edge, aimed at the target's center.
  const arrowLeft = Math.min(Math.max(rect.left + rect.width / 2 - clampedLeft, 16), cardW - 16);
  const arrowTop = Math.min(Math.max(rect.top + rect.height / 2 - clampedTop, 16), cardH - 16);

  return { top: clampedTop, left: clampedLeft, side: p, arrowLeft, arrowTop };
}

function PointerTail({ side, arrowLeft, arrowTop }: { side: "top" | "bottom" | "left" | "right"; arrowLeft: number; arrowTop: number }) {
  const base = "absolute w-0 h-0 border-solid";
  switch (side) {
    // Card sits below the target — tail on the card's top edge, pointing up.
    case "bottom":
      return <span className={base} style={{ top: -ARROW, left: arrowLeft - ARROW, borderWidth: `0 ${ARROW}px ${ARROW}px ${ARROW}px`, borderColor: "transparent transparent var(--card) transparent" }} />;
    // Card sits above the target — tail on the card's bottom edge, pointing down.
    case "top":
      return <span className={base} style={{ bottom: -ARROW, left: arrowLeft - ARROW, borderWidth: `${ARROW}px ${ARROW}px 0 ${ARROW}px`, borderColor: "var(--card) transparent transparent transparent" }} />;
    // Card sits to the right of the target — tail on the card's left edge, pointing left.
    case "right":
      return <span className={base} style={{ left: -ARROW, top: arrowTop - ARROW, borderWidth: `${ARROW}px ${ARROW}px ${ARROW}px 0`, borderColor: "transparent var(--card) transparent transparent" }} />;
    // Card sits to the left of the target — tail on the card's right edge, pointing right.
    case "left":
      return <span className={base} style={{ right: -ARROW, top: arrowTop - ARROW, borderWidth: `${ARROW}px 0 ${ARROW}px ${ARROW}px`, borderColor: "transparent transparent transparent var(--card)" }} />;
  }
}

export function ProductTour({
  active, welcomeTitle, welcomeBody, steps, onFinish,
}: {
  active: boolean;
  welcomeTitle: string;
  welcomeBody: string;
  steps: TourStep[];
  onFinish: () => void;
}) {
  const [phase, setPhase] = useState<"welcome" | "step">("welcome");
  const [stepIndex, setStepIndex] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);
  const [cardH, setCardH] = useState(CARD_H_ESTIMATE);

  useEffect(() => {
    if (active) {
      setPhase("welcome");
      setStepIndex(0);
    }
  }, [active]);

  const step = active && phase === "step" ? steps[stepIndex] : null;
  const rect = useTargetRect(step ? step.target : null);

  // Re-measure the card's actual rendered height (instruction length varies per step)
  // so the tooltip doesn't overlap its target when placed above it.
  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight || CARD_H_ESTIMATE);
  }, [step, rect]);

  if (!active) return null;

  const end = () => onFinish();
  const isLast = stepIndex === steps.length - 1;

  if (phase === "welcome") {
    return (
      <Dialog open onOpenChange={(v) => !v && end()}>
        <DialogContent className="max-w-sm text-center gap-4">
          <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Bell className="h-6 w-6 text-primary" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-bold">{welcomeTitle}</h2>
            <p className="text-sm text-muted-foreground">{welcomeBody}</p>
          </div>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" className="gap-1.5" onClick={end}>
              <X className="h-3.5 w-3.5" /> Skip
            </Button>
            <Button className="gap-1.5 gradient-primary text-primary-foreground border-0" onClick={() => setPhase("step")}>
              <Play className="h-3.5 w-3.5" /> Start
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  if (!step || !rect) return null;

  const pos = computePlacement(rect, step.placement, CARD_W, cardH);

  return createPortal(
    <>
      {/* Click-blocking layer: keeps the user inside the guided flow while it's open. */}
      <div className="fixed inset-0 z-[190]" onClick={(e) => e.stopPropagation()} />
      {/* Spotlight: a ring around the target plus a dimmed backdrop everywhere else,
          produced with an oversized box-shadow instead of a clipped overlay. */}
      <div
        className="fixed rounded-xl transition-[top,left,width,height] duration-200 pointer-events-none z-[195]"
        style={{
          top: rect.top - 6,
          left: rect.left - 6,
          width: rect.width + 12,
          height: rect.height + 12,
          boxShadow: "0 0 0 9999px rgba(15,23,42,0.6), 0 0 0 2px var(--primary)",
        }}
      />
      <div
        ref={cardRef}
        className="fixed z-[200] rounded-xl border border-border/60 bg-card text-card-foreground shadow-elegant p-3.5"
        style={{ top: pos.top, left: pos.left, width: CARD_W }}
      >
        <PointerTail side={pos.side as "top" | "bottom" | "left" | "right"} arrowLeft={pos.arrowLeft} arrowTop={pos.arrowTop} />
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm leading-snug">
            <span className="font-bold text-primary">Step {stepIndex + 1}:</span> {step.text}
          </p>
          <button
            onClick={end}
            aria-label="Close tour"
            className="shrink-0 text-muted-foreground hover:text-foreground -mt-0.5 -mr-0.5 p-1 rounded cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center justify-between pt-2.5 mt-2 border-t border-border/60">
          <button
            onClick={end}
            className="text-xs text-muted-foreground hover:text-foreground hover:underline cursor-pointer"
          >
            Skip
          </button>
          <div className="flex items-center gap-1.5">
            {stepIndex > 0 && (
              <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-xs" onClick={() => setStepIndex((i) => i - 1)}>
                <ArrowLeft className="h-3 w-3" /> Back
              </Button>
            )}
            <Button
              size="sm"
              className="h-7 gap-1 px-2.5 text-xs gradient-primary text-primary-foreground border-0"
              onClick={() => (isLast ? end() : setStepIndex((i) => i + 1))}
            >
              {isLast ? "Finish" : "Next"} {!isLast && <ArrowRight className="h-3 w-3" />}
            </Button>
          </div>
        </div>
        <div className="flex items-center justify-center gap-1 pt-2">
          {steps.map((_, i) => (
            <span
              key={i}
              className={cn("h-1.5 rounded-full transition-all", i === stepIndex ? "w-4 bg-primary" : "w-1.5 bg-muted")}
            />
          ))}
        </div>
      </div>
    </>,
    document.body,
  );
}
