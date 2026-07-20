import { Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "sonner";
import { SessionProvider, useSession } from "./lib/session";
import { CartProvider } from "./lib/cart";
import { KioskLockdownProvider } from "./lib/kiosk-lockdown";
import SetupScreen from "./screens/Setup";
import WelcomeScreen from "./screens/Welcome";
import ScanScreen from "./screens/Scan";

function RequirePairing({ children }: { children: React.ReactNode }) {
  const { paired } = useSession();
  if (!paired) return <Navigate to="/setup" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <SessionProvider>
      <KioskLockdownProvider>
        <CartProvider>
          <div className="h-screen w-screen font-sans">
            <Routes>
              <Route path="/setup" element={<SetupScreen />} />
              <Route
                path="/"
                element={
                  <RequirePairing>
                    <WelcomeScreen />
                  </RequirePairing>
                }
              />
              <Route
                path="/scan"
                element={
                  <RequirePairing>
                    <ScanScreen />
                  </RequirePairing>
                }
              />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster richColors position="top-right" />
          </div>
        </CartProvider>
      </KioskLockdownProvider>
    </SessionProvider>
  );
}
