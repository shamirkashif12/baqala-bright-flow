import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { getLockdownPinInfo, verifyLockdownPin } from "./api";
import { useSession } from "./session";
import { PinPadDialog } from "../components/PinPadDialog";

interface KioskLockdownContextValue {
  isFullscreen: boolean;
}

const KioskLockdownContext = createContext<KioskLockdownContextValue>({ isFullscreen: false });

// Deliberately not shown anywhere in the UI — a customer-facing kiosk shouldn't display an
// obvious "exit" affordance at all. Staff memorize this; see the OS/browser kiosk-lockdown
// setup guide alongside this app for the full write-up (including this combo).
function isLockdownShortcut(e: KeyboardEvent) {
  return e.ctrlKey && e.shiftKey && !e.altKey && e.key.toLowerCase() === "l";
}

export function KioskLockdownProvider({ children }: { children: ReactNode }) {
  const { paired } = useSession();
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));
  const [pinPadOpen, setPinPadOpen] = useState(false);
  const [pinLength, setPinLength] = useState(6);
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);

  // True only while we intend the kiosk to stay locked down — set right after an authorized
  // PIN entry, cleared right before an authorized PIN exit. Lets the fullscreenchange handler
  // below tell "customer/staff pressed Esc" apart from "we exited on purpose".
  const shouldStayLockedRef = useRef(false);

  // The browser (not this app) decides when fullscreen actually ends — e.g. Esc always exits
  // it and no page can intercept or block that directly. What we CAN do is notice it happened
  // and immediately try to re-enter, fighting back against an Esc-triggered exit. This is a
  // best-effort measure only: browsers deliberately throttle/refuse rapid repeated fullscreen
  // requests to stop pages abusing exactly this trick to trap visitors, so it can legitimately
  // fail. The only reliable fix is native browser kiosk mode — see KIOSK-LOCKDOWN-SETUP.md.
  useEffect(() => {
    function onChange() {
      const nowFullscreen = Boolean(document.fullscreenElement);
      setIsFullscreen(nowFullscreen);
      if (!nowFullscreen && shouldStayLockedRef.current) {
        document.documentElement.requestFullscreen().catch(() => {
          // Browser refused re-entry — likely its anti-abuse throttling on repeated
          // requests. Nothing further a page-level Fullscreen API call can do about that.
        });
      }
    }
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Capture phase + stopImmediatePropagation so this fires before (and suppresses, for this
  // one combo) Scan.tsx's own document-level keydown listener for the hardware barcode
  // scanner — otherwise the "L" here would land in that listener's scan buffer too.
  useEffect(() => {
    if (!paired) return;
    function handler(e: KeyboardEvent) {
      if (!isLockdownShortcut(e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setError(null);
      getLockdownPinInfo()
        .then((info) => {
          if (!info.configured) {
            toast.error("No lockdown PIN set for this terminal — set one in Terminals admin first.");
            return;
          }
          setPinLength(info.length ?? 6);
          setPinPadOpen(true);
        })
        .catch(() => toast.error("Couldn't reach the server to check the lockdown PIN setup."));
    }
    document.addEventListener("keydown", handler, true);
    return () => document.removeEventListener("keydown", handler, true);
  }, [paired]);

  // Best-effort deterrent only, not a real barrier — right-click is trivially available
  // again the instant fullscreen ends, same caveat as everywhere else in this file.
  useEffect(() => {
    if (!isFullscreen) return;
    function blockContextMenu(e: MouseEvent) {
      e.preventDefault();
    }
    document.addEventListener("contextmenu", blockContextMenu);
    return () => document.removeEventListener("contextmenu", blockContextMenu);
  }, [isFullscreen]);

  async function submitPin(pin: string) {
    setVerifying(true);
    setError(null);
    try {
      const res = await verifyLockdownPin(pin);
      if (!res.configured) {
        setError("No lockdown PIN set for this terminal — set one in Terminals admin first.");
        return;
      }
      if (!res.valid) {
        setError("Incorrect PIN.");
        return;
      }
      setPinPadOpen(false);
      if (document.fullscreenElement) {
        shouldStayLockedRef.current = false;
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        shouldStayLockedRef.current = true;
      }
    } catch {
      setError("Couldn't reach the server to check the PIN — try again.");
    } finally {
      setVerifying(false);
    }
  }

  return (
    <KioskLockdownContext.Provider value={{ isFullscreen }}>
      {children}
      <PinPadDialog
        open={pinPadOpen}
        title={isFullscreen ? "Exit fullscreen lockdown" : "Enter fullscreen lockdown"}
        pinLength={pinLength}
        error={error}
        verifying={verifying}
        onSubmit={submitPin}
        onCancel={() => setPinPadOpen(false)}
      />
    </KioskLockdownContext.Provider>
  );
}

export function useKioskLockdown() {
  return useContext(KioskLockdownContext);
}
