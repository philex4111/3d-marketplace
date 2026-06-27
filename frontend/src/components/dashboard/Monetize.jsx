/**
 * components/dashboard/Monetize.jsx
 * Seller monetization panel inside Dashboard.
 * - Feature a listing (pay to pin to homepage/marketplace)
 * - Upgrade to Pro ($9/month)
 * - Buy AI credits
 */
import { useState, useEffect } from 'react'
import { supabase } from '../../services/supabaseClient'
import { api } from '../../services/api'

function asArray(value) {
  return Array.isArray(value) ? value : []
}

// ── Feature a listing ─────────────────────────────────────────────────────────
function FeatureListingPanel({ userId }) {
  const [assets, setAssets]       = useState([])
  const [pricing, setPricing]     = useState([])
  const [loading, setLoading]     = useState(true)
  const [selected, setSelected]   = useState({ asset: '', slot: '' })
  const [paying, setPaying]       = useState(false)
  const [done, setDone]           = useState(false)
  const [error, setError]         = useState('')

  useEffect(() => {
    if (!userId) return

    let cancelled = false
    setLoading(true)
    setError('')

    Promise.all([
      supabase
        .from('assets')
        .select('id, title, slug')
        .eq('seller_id', userId)
        .eq('status', 'published'),
      api.get('/api/monetization/featured/pricing'),
    ])
      .then(([assetsRes, pricingRes]) => {
        if (cancelled) return
        if (assetsRes.error) {
          setError(assetsRes.error.message || 'Could not load your assets.')
        } else {
          setAssets(asArray(assetsRes.data))
        }
        setPricing(asArray(pricingRes.data))
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.response?.data?.detail || e.message || 'Could not load featured pricing.')
          setPricing([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId])

  const selectedPricing = pricing.find((p) => p.slot === selected.slot)

  const handlePay = async () => {
    if (!selected.asset || !selected.slot) { setError('Select an asset and slot.'); return }
    setPaying(true); setError('')
    try {
      // For now using direct PayPal flow — in production wire through PaymentModal
      // This is a simplified direct call for the dashboard context
      await api.post('/api/monetization/featured/purchase', {
        asset_id:       selected.asset,
        slot:           selected.slot,
        payment_method: 'paypal',
        payment_ref:    `featured-${Date.now()}`,
      })
      setDone(true)
    } catch (e) {
      setError(e.response?.data?.detail || 'Payment failed.')
    } finally {
      setPaying(false)
    }
  }

  if (done) return (
    <div className="text-center py-10">
      <p className="text-3xl mb-3">🎯</p>
      <p className="font-display font-semibold text-white">Your listing is now featured!</p>
      <p className="font-mono text-xs text-white/30 mt-1">It will appear in the selected slot immediately.</p>
    </div>
  )

  const SLOT_ICONS = { hero: '🏆', top_row: '⭐', category_pin: '📌' }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="font-display font-semibold text-base mb-1">Feature a Listing</h3>
        <p className="font-mono text-xs text-white/35">
          Pay to pin your model to a prominent spot — more views, more sales.
        </p>
      </div>

      {/* Asset selector */}
      <div>
        <label className="block font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">
          Select Asset
        </label>
        <select
          value={selected.asset}
          onChange={(e) => setSelected((s) => ({ ...s, asset: e.target.value }))}
          className="w-full bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-sm text-white/80 focus:outline-none focus:border-white/25"
        >
          <option value="">Choose an asset…</option>
          {assets.map((a) => (
            <option key={a.id} value={a.id} className="bg-surface">{a.title}</option>
          ))}
        </select>
      </div>

      {loading && (
        <p className="font-mono text-xs text-white/25 animate-pulse">Loading pricing…</p>
      )}

      {/* Slot selector */}
      <div className="grid grid-cols-1 gap-3">
        {pricing.map((p) => (
          <button
            key={p.slot}
            onClick={() => setSelected((s) => ({ ...s, slot: p.slot }))}
            className={`flex items-center gap-4 p-4 rounded-xl border text-left transition-all ${
              selected.slot === p.slot
                ? 'border-emerald-500/40 bg-emerald-500/8'
                : 'border-border hover:border-white/15 bg-white/2'
            }`}
          >
            <span className="text-2xl">{SLOT_ICONS[p.slot] || '📍'}</span>
            <div className="flex-1">
              <p className="font-mono text-sm text-white capitalize">
                {(p.slot || 'slot').replace(/_/g, ' ')}
              </p>
              <p className="font-mono text-[10px] text-white/30 mt-0.5">{p.description} · {p.duration_days} days</p>
            </div>
            <span className="font-display font-bold text-emerald-400">${p.price_usd}</span>
          </button>
        ))}
      </div>

      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      <button
        onClick={handlePay}
        disabled={paying || !selected.asset || !selected.slot}
        className="btn-primary w-full"
      >
        {paying ? 'Processing…' : selectedPricing ? `Pay $${selectedPricing.price_usd} — Feature Now` : 'Feature Listing'}
      </button>
    </div>
  )
}

// ── Pro subscription ──────────────────────────────────────────────────────────
function ProPanel({ userId }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying]   = useState(false)
  const [done, setDone]       = useState(false)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
      .then(({ data, error: profileError }) => {
        if (cancelled) return
        if (profileError) {
          setError(profileError.message || 'Could not load profile.')
        } else {
          setProfile(data)
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [userId])

  const handleUpgrade = async () => {
    setPaying(true); setError('')
    try {
      await api.post('/api/monetization/pro/activate', {
        payment_method: 'paypal',
        payment_ref:    `pro-${Date.now()}`,
      })
      setDone(true)
    } catch (e) {
      setError(e.response?.data?.detail || 'Upgrade failed.')
    } finally {
      setPaying(false)
    }
  }

  const PRO_PERKS = [
    '★ Pro badge on your profile and listings',
    '⬇ Commission reduced from 15% → 10%',
    '⚡ Automated .blend → .glb conversion queue',
    '🤖 50 AI credits included per month',
    '📌 1 free featured listing per month',
  ]

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="font-display font-semibold text-base mb-1">Pro Seller — $9/month</h3>
        <p className="font-mono text-xs text-white/35">
          Serious sellers save money and get more tools.
        </p>
      </div>

      {loading && (
        <p className="font-mono text-xs text-white/25 animate-pulse">Loading…</p>
      )}

      {profile?.is_pro ? (
        <div className="mesh-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-2xl">★</span>
            <div>
              <p className="font-display font-semibold text-emerald-400">You're a Pro seller</p>
              {profile.pro_expires_at && (
                <p className="font-mono text-[11px] text-white/30">
                  Renews {new Date(profile.pro_expires_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          <p className="font-mono text-xs text-white/40">AI Credits remaining: {profile.ai_credits}</p>
        </div>
      ) : (
        <>
          <div className="mesh-card p-5 space-y-3">
            {PRO_PERKS.map((perk) => (
              <div key={perk} className="flex items-start gap-3">
                <span className="font-mono text-[11px] text-emerald-400 shrink-0 mt-0.5">✓</span>
                <span className="font-mono text-xs text-white/60">{perk}</span>
              </div>
            ))}
          </div>

          {done ? (
            <p className="font-mono text-sm text-emerald-400 text-center">✓ Pro activated! Refresh to see your badge.</p>
          ) : (
            <>
              {error && <p className="font-mono text-xs text-red-400">{error}</p>}
              <button onClick={handleUpgrade} disabled={paying} className="btn-primary w-full">
                {paying ? 'Processing…' : 'Upgrade to Pro — $9/month'}
              </button>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── AI credits ────────────────────────────────────────────────────────────────
function CreditsPanel({ userId }) {
  const [packs, setPacks]     = useState([])
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [buying, setBuying]   = useState(null)
  const [done, setDone]       = useState(null)
  const [error, setError]     = useState('')

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setLoading(true)
    setError('')

    Promise.all([
      api.get('/api/monetization/credits/packs'),
      supabase.from('profiles').select('ai_credits').eq('id', userId).single(),
    ])
      .then(([packsRes, profileRes]) => {
        if (cancelled) return
        setPacks(asArray(packsRes.data))
        if (profileRes.error) {
          setError(profileRes.error.message || 'Could not load credit balance.')
        } else {
          setProfile(profileRes.data)
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e.response?.data?.detail || e.message || 'Could not load credit packs.')
          setPacks([])
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [userId])

  const handleBuy = async (pack) => {
    setBuying(pack.id); setError('')
    try {
      const { data } = await api.post('/api/monetization/credits/purchase', {
        pack_id:        pack.id,
        payment_method: 'paypal',
        payment_ref:    `credits-${Date.now()}`,
      })
      setDone({ pack, new_balance: data.new_balance })
      setProfile((p) => ({ ...(p || {}), ai_credits: data.new_balance }))
    } catch (e) {
      setError(e.response?.data?.detail || 'Purchase failed.')
    } finally {
      setBuying(null)
    }
  }

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="font-display font-semibold text-base mb-1">AI Credits</h3>
        <p className="font-mono text-xs text-white/35">
          Use credits for AI-powered texture generation and auto-tagging.
        </p>
      </div>

      {loading && (
        <p className="font-mono text-xs text-white/25 animate-pulse">Loading…</p>
      )}

      {profile && (
        <div className="mesh-card p-4 flex items-center gap-4">
          <span className="text-2xl">🤖</span>
          <div>
            <p className="font-mono text-[11px] text-white/30 uppercase tracking-wider">Current Balance</p>
            <p className="font-display text-2xl font-bold text-white">{profile.ai_credits} credits</p>
          </div>
        </div>
      )}

      {done && (
        <p className="font-mono text-xs text-emerald-400">
          ✓ {done.pack.credits} credits added. New balance: {done.new_balance}
        </p>
      )}

      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      <div className="grid grid-cols-1 gap-3">
        {packs.map((pack) => (
          <div key={pack.id} className="mesh-card p-4 flex items-center gap-4">
            <div className="flex-1">
              <p className="font-display font-semibold text-sm text-white">{pack.label}</p>
              <p className="font-mono text-[11px] text-white/30 mt-0.5">
                {pack.credits} credits
                {pack.credits > 0 && (
                  <> · ${(pack.price_usd / pack.credits).toFixed(2)} per credit</>
                )}
              </p>
            </div>
            <span className="font-display font-bold text-white">${pack.price_usd}</span>
            <button
              onClick={() => handleBuy(pack)}
              disabled={buying === pack.id}
              className="btn-primary text-xs py-1.5 px-4 shrink-0"
            >
              {buying === pack.id ? '…' : 'Buy'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Main Monetize tab ─────────────────────────────────────────────────────────
export function Monetize({ userId }) {
  const [section, setSection] = useState('feature')

  if (!userId) {
    return (
      <p className="font-mono text-xs text-white/25 animate-pulse py-10">
        Loading account…
      </p>
    )
  }

  const SECTIONS = [
    { id: 'feature', label: '🎯 Feature Listing' },
    { id: 'pro',     label: '★ Go Pro'           },
    { id: 'credits', label: '🤖 AI Credits'       },
  ]

  return (
    <div>
      <div className="flex gap-2 mb-8 flex-wrap">
        {SECTIONS.map((s) => (
          <button
            key={s.id}
            onClick={() => setSection(s.id)}
            className={`font-mono text-xs px-4 py-2 rounded-lg border transition-all ${
              section === s.id
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400'
                : 'border-border text-white/35 hover:border-white/20'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {section === 'feature'  && <FeatureListingPanel userId={userId} />}
      {section === 'pro'      && <ProPanel userId={userId} />}
      {section === 'credits'  && <CreditsPanel userId={userId} />}
    </div>
  )
}