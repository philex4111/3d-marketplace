/**
 * pages/ProductView.jsx
 *
 * CHANGELOG:
 *   - Replaced inline MpesaModal with PaymentModal (M-Pesa + PayPal + Crypto)
 *   - Download section now offers TWO options:
 *       1. Preview file (.glb) — the optimized display file, free to grab
 *       2. Source files (.zip) — the purchased raw package, 15-min presigned URL
 *   - requestDownload returns both urls when asset is free or purchased
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { ModelViewer } from '../components/viewer/ModelViewer'
import { requestDownload } from '../services/uploadApi'
import { useUserStore } from '../store/userStore'
import { PaymentModal } from '../components/payment/PaymentModal'

// ── Sub-components ─────────────────────────────────────────────────────────
function SpecRow({ label, value }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-start py-2.5 border-b border-border last:border-0">
      <span className="font-mono text-[11px] text-white/30 uppercase tracking-wider">{label}</span>
      <span className="font-mono text-[12px] text-white/70 text-right max-w-[60%]">{value}</span>
    </div>
  )
}

// ── Download section — shown after purchase ────────────────────────────────
function DownloadSection({ asset, download, onRequestDownload }) {
  const [requesting, setRequesting] = useState(false)

  const handleRequest = async () => {
    setRequesting(true)
    await onRequestDownload()
    setRequesting(false)
  }

  if (!download) {
    return (
      <button
        onClick={handleRequest}
        disabled={requesting}
        className="btn-primary w-full"
      >
        {requesting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-3 h-3 rounded-full border border-black/30 border-t-black animate-spin" />
            Generating links…
          </span>
        ) : 'Get Download Links'}
      </button>
    )
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-[10px] text-white/30 uppercase tracking-wider">Your files</p>

      {/* Source ZIP */}
      <a
        href={download.source_url}
        download={download.source_filename}
        className="flex items-center gap-3 p-3.5 rounded-xl border border-emerald-500/30 bg-emerald-500/8 hover:bg-emerald-500/12 transition-colors group"
      >
        <div className="w-9 h-9 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-mono text-xs text-emerald-400 font-medium truncate">{download.source_filename}</p>
          <p className="font-mono text-[10px] text-white/30 mt-0.5">
            Source files · textures · rigs{asset.source_zip_size_mb ? ` · ${asset.source_zip_size_mb} MB` : ''}
          </p>
        </div>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(52,211,153,0.5)" strokeWidth="2" className="shrink-0 group-hover:stroke-emerald-400 transition-colors">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </a>

      {/* Display GLB */}
      {asset.display_glb_url && (
        <a
          href={asset.display_glb_url}
          download={`${asset.slug}-display.glb`}
          className="flex items-center gap-3 p-3.5 rounded-xl border border-border bg-white/2 hover:border-white/20 hover:bg-white/4 transition-colors group"
        >
          <div className="w-9 h-9 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round">
              <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-mono text-xs text-white/60 truncate">{asset.slug}-display.glb</p>
            <p className="font-mono text-[10px] text-white/25 mt-0.5">
              Optimised display file · Draco compressed{asset.display_glb_size_kb ? ` · ${(asset.display_glb_size_kb / 1024).toFixed(1)} MB` : ''}
            </p>
          </div>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" className="shrink-0 group-hover:stroke-white/40 transition-colors">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </a>
      )}

      {/* Expiry */}
      {download.expires_at && (
        <p className="font-mono text-[10px] text-white/20 text-center">
          Source link expires {new Date(download.expires_at).toLocaleTimeString()} ·{' '}
          <button onClick={onRequestDownload} className="text-emerald-400/60 hover:text-emerald-400 underline underline-offset-2">
            refresh
          </button>
        </p>
      )}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function ProductView() {
  const { slug }    = useParams()
  const { user }    = useUserStore()
  const [asset, setAsset]             = useState(null)
  const [loading, setLoading]         = useState(true)
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [download, setDownload]       = useState(null)
  const [hasPurchased, setHasPurchased] = useState(false)

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from('assets')
        .select('*, profiles(username, display_name, avatar_r2_url)')
        .eq('slug', slug)
        .single()
      setAsset(data)
      setLoading(false)
    }
    load()
  }, [slug])

  useEffect(() => {
    if (!user || !asset) return
    supabase
      .from('transactions')
      .select('id')
      .eq('buyer_id', user.id)
      .eq('asset_id', asset.id)
      .eq('status', 'completed')
      .limit(1)
      .then(({ data }) => setHasPurchased(data?.length > 0))
  }, [user, asset])

  const handleDownload = async () => {
    try {
      const result = await requestDownload(asset.id)
      setDownload({
        source_url:      result.download_url,
        source_filename: result.filename,
        expires_at:      result.expires_at,
      })
    } catch (e) {
      console.error('Download request failed:', e)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center h-[60vh]">
      <span className="font-mono text-xs text-white/20 animate-pulse tracking-widest">
        LOADING ASSET…
      </span>
    </div>
  )

  if (!asset) return (
    <div className="flex flex-col items-center justify-center h-[60vh] gap-3">
      <span className="text-4xl text-white/10">⬡</span>
      <p className="font-mono text-sm text-white/30">Asset not found</p>
      <Link to="/marketplace" className="btn-ghost text-xs">← Back to Marketplace</Link>
    </div>
  )

  return (
    <>
      <PaymentModal
        open={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        asset={asset}
        onSuccess={() => {
          setHasPurchased(true)
          setPaymentOpen(false)
        }}
      />

      <div className="max-w-7xl mx-auto px-5 py-10">

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-8 font-mono text-[11px] text-white/25">
          <Link to="/marketplace" className="hover:text-white/50 transition-colors">
            Marketplace
          </Link>
          <span>/</span>
          <span className="text-white/50 capitalize">{asset.category}</span>
          <span>/</span>
          <span className="text-white/70">{asset.title}</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">

          {/* ── Left: 3D viewer (3 cols) ── */}
          <div className="lg:col-span-3">
            <ModelViewer src={asset.display_glb_url} className="h-[500px] lg:h-[560px]" />
            <p className="text-center font-mono text-[10px] text-white/15 mt-2 tracking-widest">
              INTERACTIVE PREVIEW · DRAG TO ORBIT
            </p>
          </div>

          {/* ── Right: Info panel (2 cols) ── */}
          <div className="lg:col-span-2 flex flex-col gap-6">

            {/* Title */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="tag capitalize">{asset.category}</span>
                {asset.is_pro_upload && (
                  <span className="tag text-emerald-400/60 border-emerald-500/20">Pro</span>
                )}
              </div>
              <h1 className="font-display text-3xl font-700 leading-tight">{asset.title}</h1>
              <p className="mt-2 text-sm text-white/35">
                by{' '}
                <span className="text-emerald-400">
                  {asset.profiles?.display_name || asset.profiles?.username}
                </span>
              </p>
            </div>

            {/* Tags */}
            {asset.tags?.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {asset.tags.map((t) => <span key={t} className="tag">{t}</span>)}
              </div>
            )}

            {/* Description */}
            {asset.description && (
              <p className="text-sm text-white/50 leading-relaxed">{asset.description}</p>
            )}

            {/* Specs */}
            <div className="mesh-card divide-y divide-border overflow-hidden">
              <SpecRow label="Category"    value={asset.category} />
              <SpecRow label="Polygons"    value={asset.poly_count ? `${asset.poly_count.toLocaleString()} tris` : null} />
              <SpecRow label="Formats"     value={asset.formats_included?.join(', ')} />
              <SpecRow label="Software"    value={asset.software_used?.join(', ')} />
              <SpecRow label="Source Size" value={asset.source_zip_size_mb ? `${asset.source_zip_size_mb} MB` : null} />
              <SpecRow label="Sales"       value={String(asset.sale_count || 0)} />
            </div>

            {/* Purchase card */}
            <div className="mesh-card p-5 mt-auto">
              <div className="flex items-baseline justify-between mb-5">
                <span className="font-display text-4xl font-700">
                  {asset.is_free ? 'Free' : `$${asset.price_usd}`}
                </span>
                {asset.price_kes && !asset.is_free && (
                  <span className="font-mono text-xs text-white/25">
                    ≈ KES {Number(asset.price_kes).toLocaleString()}
                  </span>
                )}
              </div>

              {hasPurchased || asset.is_free ? (
                <DownloadSection
                  asset={asset}
                  download={download}
                  onRequestDownload={handleDownload}
                />
              ) : (
                <>
                  <button
                    onClick={() => user ? setPaymentOpen(true) : null}
                    className="btn-primary w-full mb-2"
                  >
                    {user ? 'Buy Now' : 'Sign in to Purchase'}
                  </button>
                  <p className="font-mono text-[10px] text-white/20 text-center">
                    M-Pesa · PayPal · USDT · 15-min secure download
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}