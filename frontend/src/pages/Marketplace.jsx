/**
 * pages/Marketplace.jsx
 *
 * PERFORMANCE OVERHAUL:
 *   - Primary: uses assets.thumbnail_url (plain JPEG in R2) — loads instantly
 *   - Fallback: if no thumbnail_url, generates one client-side via glbThumbnail
 *     and caches it in IndexedDB (ThumbnailCache) so next visit is instant
 *   - IntersectionObserver: GLB fallback only fires when card enters viewport
 *   - No Three.js rendered on the marketplace page for assets that have thumbnails
 */
import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { generateGlbThumbnail } from '../utils/glbThumbnail'
import { ThumbnailCache } from '../utils/thumbnailCache'

const CATEGORIES = ['All', 'character', 'vehicle', 'environment', 'weapon', 'prop', 'animal', 'vfx']
const SORT_OPTIONS = [
  { label: 'Newest',      value: 'created_at:desc' },
  { label: 'Price: Low',  value: 'price_usd:asc'   },
  { label: 'Price: High', value: 'price_usd:desc'  },
  { label: 'Most Sold',   value: 'sale_count:desc'  },
]

// ── Smart thumbnail — uses stored JPEG first, falls back to GLB render ────────
function AssetThumbnail({ thumbnailUrl, glbUrl, title }) {
  const [src, setSrc]         = useState(thumbnailUrl || null)
  const [loading, setLoading] = useState(!thumbnailUrl)
  const containerRef          = useRef(null)
  const tried                 = useRef(false)

  useEffect(() => {
    // If we already have a stored thumbnail, show it immediately
    if (thumbnailUrl) { setSrc(thumbnailUrl); setLoading(false); return }
    if (!glbUrl || tried.current) return

    // No stored thumbnail — check IndexedDB cache before rendering
    const tryCache = async () => {
      const cached = await ThumbnailCache.get(glbUrl)
      if (cached) { setSrc(cached); setLoading(false); return }

      // Not cached — use IntersectionObserver to defer render until visible
      const observer = new IntersectionObserver(async (entries) => {
        if (entries[0].isIntersecting && !tried.current) {
          tried.current = true
          observer.disconnect()
          const dataUrl = await generateGlbThumbnail(glbUrl, 480, 360)
          setSrc(dataUrl)
          setLoading(false)
        }
      }, { threshold: 0.05, rootMargin: '200px' })  // 200px ahead of scroll

      if (containerRef.current) observer.observe(containerRef.current)
      return () => observer.disconnect()
    }
    tryCache()
  }, [thumbnailUrl, glbUrl])

  return (
    <div ref={containerRef} className="w-full h-full relative bg-[#0a0c14]">
      {src ? (
        <img
          src={src}
          alt={title}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : loading ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <div className="w-7 h-7 rounded-full border border-emerald-400/20 border-t-emerald-400/60 animate-spin" />
          <span className="font-mono text-[9px] text-white/15 tracking-widest">RENDERING…</span>
        </div>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="1">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
        </div>
      )}
    </div>
  )
}

// ── Asset card ────────────────────────────────────────────────────────────────
function AssetCard({ asset }) {
  const fmtPoly = (n) => n >= 1000 ? `${(n / 1000).toFixed(0)}k` : String(n)

  return (
    <Link
      to={`/asset/${asset.slug}`}
      className="group block rounded-xl overflow-hidden bg-[#0d0f18] border border-[#1a1f2e]
                 hover:border-emerald-500/30 hover:-translate-y-0.5 transition-all duration-200
                 hover:shadow-[0_8px_32px_rgba(52,211,153,0.08)]"
    >
      {/* Image */}
      <div className="relative aspect-[4/3] overflow-hidden">
        <AssetThumbnail
          thumbnailUrl={asset.thumbnail_url}
          glbUrl={asset.display_glb_url}
          title={asset.title}
        />

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors duration-200
                        flex items-center justify-center">
          <div className="w-11 h-11 rounded-full bg-white/0 group-hover:bg-white/10
                          border border-white/0 group-hover:border-white/20
                          flex items-center justify-center
                          scale-75 group-hover:scale-100 opacity-0 group-hover:opacity-100
                          transition-all duration-200">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>

        {asset.is_free && (
          <span className="absolute top-2.5 left-2.5 font-mono text-[9px] font-bold
                           bg-emerald-500 text-black px-2 py-0.5 rounded-full uppercase tracking-wider">
            Free
          </span>
        )}
        {asset.poly_count && (
          <span className="absolute bottom-2 right-2 font-mono text-[9px]
                           bg-black/60 text-white/45 px-2 py-0.5 rounded backdrop-blur-sm">
            {fmtPoly(asset.poly_count)} tris
          </span>
        )}
      </div>

      {/* Info */}
      <div className="p-3.5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-display font-semibold text-[13px] text-white leading-snug line-clamp-1 flex-1">
            {asset.title}
          </h3>
          <span className="font-mono text-[13px] text-emerald-400 shrink-0">
            {asset.is_free ? 'Free' : `$${parseFloat(asset.price_usd).toFixed(2)}`}
          </span>
        </div>

        <div className="flex items-center gap-2 mb-2.5">
          <div className="w-4 h-4 rounded-full bg-emerald-500/20 border border-emerald-500/30
                          flex items-center justify-center shrink-0">
            <span className="font-mono text-[7px] text-emerald-400">
              {(asset.profiles?.username || '?').charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="font-mono text-[10px] text-white/30 truncate">
            {asset.profiles?.username || 'Unknown artist'}
          </span>
        </div>

        {asset.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-2.5">
            {asset.tags.slice(0, 3).map((tag) => (
              <span key={tag}
                className="font-mono text-[9px] px-1.5 py-0.5 rounded-full
                           bg-white/4 text-white/25 border border-white/6 capitalize">
                {tag}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center gap-3 pt-2.5 border-t border-white/5">
          <span className="font-mono text-[9px] text-white/18 flex items-center gap-1">
            <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            {asset.sale_count || 0} sales
          </span>
          <span className="font-mono text-[9px] text-white/18 capitalize ml-auto">
            {asset.category}
          </span>
        </div>
      </div>
    </Link>
  )
}

// ── Skeleton ──────────────────────────────────────────────────────────────────
function AssetCardSkeleton() {
  return (
    <div className="rounded-xl overflow-hidden bg-[#0d0f18] border border-[#1a1f2e] animate-pulse">
      <div className="aspect-[4/3] bg-[#111420]" />
      <div className="p-3.5 space-y-2.5">
        <div className="flex justify-between gap-2">
          <div className="h-3.5 bg-white/5 rounded w-2/3" />
          <div className="h-3.5 bg-white/5 rounded w-10" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-white/5" />
          <div className="h-2.5 bg-white/5 rounded w-24" />
        </div>
        <div className="flex gap-1">
          <div className="h-4 bg-white/5 rounded-full w-12" />
          <div className="h-4 bg-white/5 rounded-full w-16" />
        </div>
      </div>
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────────────────────────
export default function Marketplace() {
  const [assets, setAssets]     = useState([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [category, setCategory] = useState('All')
  const [sort, setSort]         = useState('created_at:desc')
  const [freeOnly, setFreeOnly] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [col, dir] = sort.split(':')
      let query = supabase
        .from('assets')
        .select(
          'id, title, slug, price_usd, is_free, tags, poly_count, ' +
          'category, sale_count, thumbnail_url, display_glb_url, ' +
          'created_at, profiles(username)'
        )
        .eq('status', 'published')
        .order(col, { ascending: dir === 'asc' })
        .limit(48)

      if (category !== 'All') query = query.eq('category', category)
      if (freeOnly)           query = query.eq('is_free', true)
      if (search.trim())      query = query.ilike('title', `%${search.trim()}%`)

      const { data } = await query
      setAssets(data || [])
      setLoading(false)
    }
    load()
  }, [category, sort, freeOnly, search])

  return (
    <div className="max-w-7xl mx-auto px-5 py-10">
      <div className="mb-8">
        <h1 className="font-display text-3xl font-bold mb-1">Marketplace</h1>
        <p className="font-mono text-sm text-white/25">
          {loading ? '…' : `${assets.length} asset${assets.length !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input type="text" placeholder="Search models…" value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[#0d0f18] border border-[#1a1f2e] rounded-lg
                       text-sm text-white placeholder-white/20 focus:outline-none
                       focus:border-white/20 font-mono transition-colors" />
        </div>

        <select value={sort} onChange={(e) => setSort(e.target.value)}
          className="bg-[#0d0f18] border border-[#1a1f2e] rounded-lg px-3 py-2.5
                     text-sm text-white/60 font-mono focus:outline-none focus:border-white/20 cursor-pointer">
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value} className="bg-[#0d0f18]">{o.label}</option>
          ))}
        </select>

        <button onClick={() => setFreeOnly(!freeOnly)}
          className={`font-mono text-xs px-4 py-2.5 rounded-lg border transition-all duration-150 ${
            freeOnly ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                     : 'border-[#1a1f2e] text-white/35 hover:border-white/20 hover:text-white/60'}`}>
          Free only
        </button>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 flex-wrap mb-8">
        {CATEGORIES.map((cat) => (
          <button key={cat} onClick={() => setCategory(cat)}
            className={`font-mono text-[11px] px-3.5 py-1.5 rounded-full border capitalize
                        transition-all duration-150 ${
              category === cat
                ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-400'
                : 'border-[#1a1f2e] text-white/30 hover:border-white/20 hover:text-white/60'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 12 }).map((_, i) => <AssetCardSkeleton key={i} />)}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1" className="mb-4">
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
          </svg>
          <p className="font-display text-lg text-white/20">No assets found</p>
          <p className="font-mono text-xs text-white/15 mt-1">Try a different filter or search</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {assets.map((asset) => <AssetCard key={asset.id} asset={asset} />)}
        </div>
      )}
    </div>
  )
}
