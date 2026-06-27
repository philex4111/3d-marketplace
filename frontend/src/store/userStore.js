/**
 * store/userStore.js
 * Global auth state via Zustand.
 * Hydrated by AppProviders.jsx on mount — don't call supabase.auth here.
 *
 * Usage:
 *   const { user, session, loading } = useUserStore()
 */
import { create } from 'zustand'

export const useUserStore = create((set) => ({
  user: null,
  session: null,
  loading: true,   // true until AppProviders resolves the session

  setUser:    (user)    => set({ user }),
  setSession: (session) => set({ session }),
  setLoading: (loading) => set({ loading }),

  clear: () => set({ user: null, session: null, loading: false }),
}))
