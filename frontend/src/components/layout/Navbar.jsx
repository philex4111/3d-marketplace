/**
 * components/layout/Navbar.jsx
 *
 * CHANGELOG:
 *   - Added admin earnings link — only visible to VITE_ADMIN_EMAIL
 */
import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Box } from 'lucide-react'
import { useUserStore } from '../../store/userStore'
import { supabase } from '../../services/supabaseClient'
import { AuthModal } from '../auth/AuthModal'

import { isAdminUser } from '../../utils/admin'

const NavItem = ({ to, children }) => (
  <NavLink
    to={to}
    className={({ isActive }) =>
      `font-mono text-[12px] tracking-widest uppercase transition-colors duration-150 ${
        isActive ? 'text-white' : 'text-white/35 hover:text-white/70'
      }`
    }
  >
    {children}
  </NavLink>
)

export default function Navbar() {
  const { user }  = useUserStore()
  const navigate  = useNavigate()
  const [authOpen, setAuthOpen] = useState(false)

  const isAdmin = isAdminUser(user)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <>
      <nav className="sticky top-0 z-50 border-b border-border bg-canvas/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-5 h-14 flex items-center justify-between gap-8">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <span className="w-6 h-6 rounded bg-emerald-500 flex items-center justify-center">
              <Box className="w-3.5 h-3.5 text-black" strokeWidth={2.5} />
            </span>
            <span className="font-display font-bold text-[15px] tracking-tight">MESH</span>
          </Link>

          {/* Centre nav */}
          <div className="hidden md:flex items-center gap-8">
            <NavItem to="/marketplace">Marketplace</NavItem>
            {user && <NavItem to="/dashboard">Dashboard</NavItem>}
            {/* Admin link — only visible to you */}
            {isAdmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `font-mono text-[12px] tracking-widest uppercase transition-colors duration-150 ${
                    isActive
                      ? 'text-emerald-400'
                      : 'text-emerald-400/40 hover:text-emerald-400'
                  }`
                }
              >
                ⬡ Admin
              </NavLink>
            )}
          </div>

          {/* Right actions */}
          <div className="flex items-center gap-3">
            {user ? (
              <>
                <span className="hidden md:block font-mono text-[11px] text-white/25 truncate max-w-[160px]">
                  {user.email}
                  {isAdmin && (
                    <span className="ml-1.5 text-emerald-400/60">admin</span>
                  )}
                </span>

                <Link
                  to="/dashboard"
                  className="w-7 h-7 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center hover:border-emerald-500/60 transition-colors"
                >
                  <span className="font-mono text-[10px] text-emerald-400">
                    {user.email?.charAt(0).toUpperCase()}
                  </span>
                </Link>

                <button
                  onClick={handleLogout}
                  className="btn-ghost text-xs py-1.5 px-3 text-red-400/70 hover:text-red-400 border-red-400/10 hover:border-red-400/30"
                >
                  Logout
                </button>
              </>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="btn-primary text-xs py-1.5 px-4"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      </nav>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  )
}