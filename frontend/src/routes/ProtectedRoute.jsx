/**
 * routes/ProtectedRoute.jsx
 * Redirects unauthenticated users to the home page.
 * Wrap any route that requires login with this component.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useUserStore } from '../store/userStore'

export default function ProtectedRoute() {
  const { user, loading } = useUserStore()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <span className="font-mono text-xs text-white/20 animate-pulse tracking-widest">
          AUTHENTICATING…
        </span>
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/" state={{ from: location }} replace />
  }

  return <Outlet />
}
