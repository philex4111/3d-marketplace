/**
 * components/layout/Footer.jsx
 */
import { Link } from 'react-router-dom'

export default function Footer() {
  return (
    <footer className="border-t border-border mt-20">
      <div className="max-w-7xl mx-auto px-5 py-10 flex flex-col md:flex-row items-center justify-between gap-6">

        <div className="flex items-center gap-2">
          <span className="w-5 h-5 rounded bg-emerald-500 flex items-center justify-center">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M6 1L11 4V8L6 11L1 8V4L6 1Z" fill="black" />
            </svg>
          </span>
          <span className="font-display text-sm font-600">MESH</span>
          <span className="font-mono text-[11px] text-white/20 ml-2">
            The 3D artist marketplace
          </span>
        </div>

        <div className="flex items-center gap-6">
          {[
            ['Marketplace', '/marketplace'],
            ['Dashboard', '/dashboard'],
          ].map(([label, href]) => (
            <Link
              key={label}
              to={href}
              className="font-mono text-[11px] text-white/30 hover:text-white/60 transition-colors tracking-wider uppercase"
            >
              {label}
            </Link>
          ))}
        </div>

        <p className="font-mono text-[11px] text-white/15">
          © {new Date().getFullYear()} MESH. Files delivered via 15-min secure link.
        </p>
      </div>
    </footer>
  )
}
