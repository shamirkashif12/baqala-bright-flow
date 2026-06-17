import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { I18nProvider } from "@/lib/i18n";

export const Route = createFileRoute("/_app")({
  ssr: false,
  beforeLoad: ({ location }) => {
    if (typeof window === "undefined") return;
    const token  = localStorage.getItem("baqala_token");
    const expiry = localStorage.getItem("baqala_session_expires");
    const expired = expiry ? Date.now() > parseInt(expiry, 10) : false;
    if (!token || expired) {
      throw redirect({ to: "/login", search: { redirect: location.href } });
    }
  },
  component: AppLayout,
});

function AppLayout() {
  return (
    <I18nProvider>
      <SidebarProvider>
        <div className="min-h-screen flex w-full bg-background">
          <AppSidebar />
          <div className="flex-1 flex flex-col min-w-0">
            <Outlet />
          </div>
        </div>
      </SidebarProvider>
    </I18nProvider>
  );
}
