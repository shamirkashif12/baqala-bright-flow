import { createMiddleware } from '@tanstack/react-start'

// Attaches the custom JWT (stored in localStorage by AuthProvider) to every
// server-function RPC call so the backend can identify the caller.
export const attachSupabaseAuth = createMiddleware({ type: 'function' }).client(
  async ({ next }) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('baqala_token') : null
    return next({
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
  },
)
