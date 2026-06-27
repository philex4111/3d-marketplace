/**
 * pages/Home.jsx
 * Landing page — hero, feature highlights, recent assets preview.
 */
import { Link } from 'react-router-dom'
import { ModelViewer } from '../components/viewer/ModelViewer'

const FEATURES = [
  { icon: '⬡', title: 'Interactive 3D Preview', body: 'Buyers orbit, zoom, and inspect every model before purchasing. No screenshots — real WebGL.' },
  { icon: '⊕', title: 'Dual-File System', body: 'Optimized .glb for previews. Full source files — rigs, 4K textures, .blend — delivered securely.' },
  { icon: '◎', title: 'M-Pesa & Crypto', body: 'Pay via M-Pesa STK Push locally, or USDT on Tron/Ethereum globally. Zero platform friction.' },
  { icon: '◈', title: 'AI-Assisted Tagging', body: 'Auto-tag your uploads using a hybrid local parser. Advanced texture generation via AI credits.' },
]

const STATS = [
  ['$0', 'Egress fees on downloads'],
  ['15 min', 'Source file link expiry'],
  ['15%', 'Platform commission'],
]

export default function Home() {
  return (
    <div className="relative overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute inset-0 bg-grid-pattern bg-grid opacity-100 pointer-events-none"
        style={{ maskImage: 'radial-gradient(ellipse 80% 60% at 50% 0%, black 40%, transparent 100%)' }}
      />

      {/* ── Hero ── */}
      <section className="relative max-w-7xl mx-auto px-5 pt-24 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div>
          {/* Badge */}
          <div className="inline-flex items-center gap-2 border border-emerald-500/25 bg-emerald-500/8 rounded-full px-3 py-1 mb-8">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-mono text-[11px] text-emerald-400 tracking-widest">OPEN FOR ARTISTS</span>
          </div>

          <h1 className="font-display text-5xl md:text-6xl font-800 leading-[1.05] tracking-tight mb-6">
            The marketplace<br />
            built for<br />
            <span className="text-emerald-400">3D creators.</span>
          </h1>

          <p className="text-white/45 text-lg leading-relaxed mb-10 max-w-md">
            Sell your 3D models to game developers and digital artists worldwide.
            Interactive previews, instant payouts, zero egress fees.
          </p>

          <div className="flex items-center gap-4">
            <Link to="/marketplace" className="btn-primary px-7 py-3 text-sm">
              Browse Marketplace
            </Link>
            <Link to="/dashboard" className="btn-ghost px-7 py-3 text-sm">
              Start Selling
            </Link>
          </div>

          {/* Stats row */}
          <div className="flex gap-8 mt-14 pt-8 border-t border-border">
            {STATS.map(([value, label]) => (
              <div key={label}>
                <p className="font-display text-2xl font-700 text-white">{value}</p>
                <p className="font-mono text-[11px] text-white/30 mt-0.5 tracking-wide">{label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* 3D viewer hero */}
        <div className="relative">
          <div className="absolute -inset-8 bg-emerald-500/5 rounded-3xl blur-3xl pointer-events-none" />
          <ModelViewer className="h-[460px]" />
          <p className="text-center font-mono text-[10px] text-white/20 mt-3 tracking-widest">
            DRAG TO ORBIT · SCROLL TO ZOOM
          </p>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="max-w-7xl mx-auto px-5 py-20">
        <h2 className="font-display text-2xl font-700 mb-10">Built differently.</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {FEATURES.map(({ icon, title, body }) => (
            <div key={title} className="mesh-card p-6 group">
              <span className="text-2xl text-emerald-400/60 group-hover:text-emerald-400 transition-colors block mb-4">
                {icon}
              </span>
              <h3 className="font-display font-600 text-white mb-2 text-[15px]">{title}</h3>
              <p className="text-sm text-white/35 leading-relaxed">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="max-w-7xl mx-auto px-5 pb-24">
        <div className="border border-border rounded-2xl p-12 text-center bg-surface relative overflow-hidden">
          <div className="absolute inset-0 bg-grid-pattern bg-grid opacity-60 pointer-events-none" />
          <h2 className="font-display text-3xl font-700 mb-4 relative">Start selling today.</h2>
          <p className="text-white/40 mb-8 relative max-w-sm mx-auto">
            Upload your first model in minutes. Get paid via M-Pesa or USDT.
          </p>
          <Link to="/dashboard" className="btn-primary px-8 py-3 relative">
            Create your store
          </Link>
        </div>
      </section>
    </div>
  )
}
