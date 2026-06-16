import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import type { AuthState } from "./lib/auth";

// Placeholder auth context for the router; real auth state lives in AuthProvider via useAuth().
const authStore: AuthState = {
  isAuthenticated: false,
  user: null,
  loading: true,
  login: async () => {},
  signup: async () => ({ needsVerification: false }),
  logout: () => {},
  hasRole: () => false,
};

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient, auth: authStore },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
