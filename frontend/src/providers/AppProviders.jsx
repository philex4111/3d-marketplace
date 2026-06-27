/**
 * providers/AppProviders.jsx
 *
 * CHANGELOG:
 *   - Auth listener wired directly into Zustand userStore (bypasses React Context)
 *   - useEffect hydrates store with getSession() on first load
 *   - Renders <PageLoader> while initial auth check resolves (prevents auth flash)
 *   - onAuthStateChange keeps store in sync for sign-in / sign-out events
 */
import { useEffect } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { useUserStore } from '../store/userStore'

function PageLoader() {
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-[#07080e]">
      <div className="flex flex-col items-center gap-4">
        <span className="w-8 h-8 rounded-full border-2 border-white/10 border-t-emerald-400 animate-spin" />
        <span className="font-mono text-[11px] text-white/20 tracking-widest uppercase animate-pulse">
          Authenticating…
        </span>
      </div>
    </div>
  )
}

function AuthHydrator({ children }) {
  const { setUser, setSession, setLoading, loading } = useUserStore()

  useEffect(() => {
    // Hydrate on mount — resolve existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Keep store in sync with Supabase auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [setUser, setSession, setLoading])

  // Block render until we know the auth state — prevents unauthenticated flash
  if (loading) return <PageLoader />

  return children
}

export default function AppProviders({ children }) {
  return (
    <BrowserRouter>
      <AuthHydrator>
        {children}
      </AuthHydrator>
    </BrowserRouter>
  )
}
