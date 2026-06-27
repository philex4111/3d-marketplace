/**
 * pages/AdminDashboard.jsx
 * Full admin dashboard — 5 pillars:
 * 1. Overview / Platform Health
 * 2. Content Moderation Queue
 * 3. User Management
 * 4. Escrow & Payouts
 * 5. Adverts
 */
import { useState, useEffect, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useUserStore } from '../store/userStore'
import { api } from '../services/api'
import { ModelViewer } from '../components/viewer/ModelViewer'
import { isAdminUser } from '../utils/admin'

const TABS = ['Overview', 'Review Queue', 'Users', 'Escrow', 'Adverts']

function asArray(value) {
  return Array.isArray(value) ? value : []
}

// ── Shared stat card ──────────────────────────────────────────────────────────
function Stat({ label, value, accent, sub }) {
  return (
    <div className="mesh-card p-5">
      <p className="font-mono text-[10px] text-white/30 uppercase tracking-wider mb-2">{label}</p>
      <p className={`font-display text-2xl font-bold ${accent ? 'text-emerald-400' : 'text-white'}`}>
        {value ?? '—'}
      </p>
      {sub && <p className="font-mono text-[10px] text-white/25 mt-1">{sub}</p>}
    </div>
  )
}

// ── 1. Overview ───────────────────────────────────────────────────────────────
function Overview() {
  const [data, setData]     = useState(null)
  const [loading, setLoading] = useState(true)
  const [running, setRunning] = useState(false)
  const [cronResult, setCronResult] = useState(null)

  useEffect(() => {
    api.get('/api/admin/health').then(({ data: d }) => {
      setData(d); setLoading(false)
    })
  }, [])

  const runCron = async () => {
    setRunning(true)
    const { data: r } = await api.post('/api/admin/payouts/run-cron')
    setCronResult(r)
    setRunning(false)
  }

  if (loading) return <p className="font-mono text-xs text-white/20 animate-pulse py-10">Loading…</p>

  return (
    <div className="space-y-8">
      {/* Health grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Stat label="Total Users"        value={data?.total_users}        />
        <Stat label="Published Assets"   value={data?.published_assets}   />
        <Stat label="Pending Review"     value={data?.pending_review}     accent={data?.pending_review > 0} />
        <Stat label="Total Sales"        value={data?.total_sales}        />
        <Stat label="Gross Volume"       value={`$${parseFloat(data?.gross_volume_usd || 0).toFixed(2)}`} accent />
        <Stat label="Platform Profit"    value={`$${parseFloat(data?.platform_profit_usd || 0).toFixed(2)}`} accent />
        <Stat label="In Escrow"          value={`$${parseFloat(data?.in_escrow_usd || 0).toFixed(2)}`} sub={`${data?.in_escrow_count} transactions`} />
        <Stat label="Active Bans"        value={data?.active_bans}        />
      </div>

      {/* Recent payouts */}
      {data?.recent_payouts?.length > 0 && (
        <div>
          <h3 className="font-display font-semibold mb-3">Recent Payouts</h3>
          <div className="mesh-card overflow-hidden">
            {data.recent_payouts.map((p) => (
              <div key={p.id} className="flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0">
                <span className="font-mono text-xs text-white/60">{p.profiles?.username}</span>
                <span className="font-mono text-xs text-white/40 capitalize">{p.payment_method}</span>
                <span className={`font-mono text-xs ${p.status === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
                  ${parseFloat(p.amount_usd).toFixed(2)} · {p.status}
                </span>
                <span className="font-mono text-[10px] text-white/20">
                  {new Date(p.created_at).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Manual cron trigger */}
      <div className="mesh-card p-5 flex items-center justify-between gap-4">
        <div>
          <p className="font-display font-semibold text-sm">Nightly Payout Cron</p>
          <p className="font-mono text-[11px] text-white/30 mt-0.5">
            Runs automatically at 23:59 · Pays out transactions older than 7 days
          </p>
          {cronResult && (
            <p className="font-mono text-xs text-emerald-400 mt-1">
              Last run: {cronResult.success} paid, {cronResult.failed} failed
            </p>
          )}
        </div>
        <button onClick={runCron} disabled={running} className="btn-primary text-xs px-4 py-2 shrink-0">
          {running ? 'Running…' : '▶ Run Now'}
        </button>
      </div>
    </div>
  )
}

// ── 2. Review Queue ───────────────────────────────────────────────────────────
function ReviewQueue() {
  const [queue, setQueue]     = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [reason, setReason]   = useState('')
  const [acting, setActing]   = useState(null)

  const load = useCallback(() => {
    setLoading(true)
    api.get('/api/admin/moderation/queue').then(({ data }) => {
      setQueue(asArray(data)); setLoading(false)
    }).catch(() => { setQueue([]); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const act = async (assetId, action) => {
    if (action === 'reject' && !reason.trim()) {
      alert('Enter a rejection reason.'); return
    }
    setActing(assetId)
    try {
      if (action === 'approve') {
        await api.post(`/api/admin/moderation/${assetId}/approve`)
      } else if (action === 'reject') {
        await api.post(`/api/admin/moderation/${assetId}/reject`, { reason })
        setReason('')
      } else if (action === 'suspend') {
        await api.post(`/api/admin/moderation/${assetId}/suspend`, { reason: reason || 'Admin suspension' })
      }
      setQueue((q) => q.filter((a) => a.id !== assetId))
      if (selected?.id === assetId) setSelected(null)
    } finally {
      setActing(null)
    }
  }

  if (loading) return <p className="font-mono text-xs text-white/20 animate-pulse py-10">Loading queue…</p>
  if (!queue.length) return (
    <div className="text-center py-20">
      <p className="text-4xl mb-3">✓</p>
      <p className="font-display font-semibold text-white/40">Queue is clear</p>
      <p className="font-mono text-xs text-white/20 mt-1">All assets have been reviewed</p>
    </div>
  )

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Asset list */}
      <div className="space-y-2">
        <p className="font-mono text-[11px] text-white/30 uppercase tracking-wider mb-4">
          {queue.length} asset{queue.length !== 1 ? 's' : ''} pending review
        </p>
        {queue.map((asset) => (
          <div
            key={asset.id}
            onClick={() => setSelected(asset)}
            className={`mesh-card p-4 cursor-pointer transition-all ${
              selected?.id === asset.id ? 'border-emerald-500/40 bg-emerald-500/5' : 'hover:border-white/15'
            }`}
          >
            <div className="flex items-center gap-3">
              {asset.thumbnail_url ? (
                <img src={asset.thumbnail_url} alt={asset.title}
                  className="w-14 h-14 rounded-lg object-cover bg-canvas" />
              ) : (
                <div className="w-14 h-14 rounded-lg bg-canvas border border-border flex items-center justify-center">
                  <span className="text-white/20 text-xl">⬡</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-sm text-white truncate">{asset.title}</p>
                <p className="font-mono text-[10px] text-white/30">
                  by {asset.profiles?.username} · {asset.category} · ${asset.price_usd}
                </p>
                <p className="font-mono text-[10px] text-white/20">
                  {new Date(asset.created_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Preview & actions */}
      {selected ? (
        <div className="space-y-4 sticky top-20">
          <ModelViewer src={selected.display_glb_url} className="h-64" />

          <div className="mesh-card p-4 space-y-3">
            <h3 className="font-display font-semibold">{selected.title}</h3>
            <p className="font-mono text-xs text-white/40">
              by {selected.profiles?.username} · {selected.category} · ${selected.price_usd}
            </p>

            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Rejection / suspension reason (required for reject/suspend)…"
              rows={2}
              className="w-full bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-xs text-white/70 placeholder-white/15 focus:outline-none focus:border-white/25 resize-none"
            />

            <div className="flex gap-2">
              <button
                onClick={() => act(selected.id, 'approve')}
                disabled={acting === selected.id}
                className="flex-1 bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs py-2 rounded-lg transition-colors disabled:opacity-50"
              >
                ✓ Approve
              </button>
              <button
                onClick={() => act(selected.id, 'reject')}
                disabled={acting === selected.id}
                className="flex-1 border border-yellow-500/40 text-yellow-400 hover:bg-yellow-500/10 text-xs py-2 rounded-lg transition-colors"
              >
                ✗ Reject
              </button>
              <button
                onClick={() => act(selected.id, 'suspend')}
                disabled={acting === selected.id}
                className="flex-1 border border-red-500/40 text-red-400 hover:bg-red-500/10 text-xs py-2 rounded-lg transition-colors"
              >
                ⊗ Suspend
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-center h-40 text-white/15 font-mono text-xs">
          Select an asset to preview it
        </div>
      )}
    </div>
  )
}

// ── 3. User Management ────────────────────────────────────────────────────────
function UserManagement() {
  const [users, setUsers]   = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(null)
  const [banReason, setBanReason] = useState('')

  const load = useCallback((q = '') => {
    setLoading(true)
    api.get(`/api/admin/users?search=${q}`).then(({ data }) => {
      setUsers(asArray(data)); setLoading(false)
    }).catch(() => { setUsers([]); setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  const handleBan = async (userId, isBanned) => {
    if (!isBanned && !banReason.trim()) { alert('Enter a ban reason.'); return }
    setActing(userId)
    try {
      if (isBanned) {
        await api.post(`/api/admin/users/${userId}/unban`)
        setUsers((u) => u.map((user) => user.id === userId ? { ...user, is_banned: false } : user))
      } else {
        await api.post(`/api/admin/users/${userId}/ban`, { reason: banReason })
        setUsers((u) => u.map((user) => user.id === userId ? { ...user, is_banned: true, ban_reason: banReason } : user))
        setBanReason('')
      }
    } finally {
      setActing(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load(search)}
          placeholder="Search by username…"
          className="flex-1 max-w-sm bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-sm text-white placeholder-white/20 focus:outline-none focus:border-white/25"
        />
        <button onClick={() => load(search)} className="btn-ghost text-xs px-4">Search</button>
      </div>

      <div className="flex gap-3 mb-2">
        <input
          type="text"
          value={banReason}
          onChange={(e) => setBanReason(e.target.value)}
          placeholder="Ban reason (fill before clicking Ban)"
          className="flex-1 max-w-sm bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-xs text-white/70 placeholder-white/20 focus:outline-none focus:border-white/25"
        />
      </div>

      {loading ? (
        <p className="font-mono text-xs text-white/20 animate-pulse">Loading…</p>
      ) : (
        <div className="mesh-card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                {['User', 'Pro', 'Sales', 'Credits', 'Joined', 'Status', 'Action'].map((h) => (
                  <th key={h} className="text-left font-mono text-[10px] text-white/30 uppercase px-4 py-3 tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={`border-b border-border/50 ${u.is_banned ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 font-mono text-xs text-white/70">{u.username}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/40">{u.is_pro ? '★' : '—'}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/40">{u.total_sales || 0}</td>
                  <td className="px-4 py-3 font-mono text-xs text-white/40">{u.ai_credits}</td>
                  <td className="px-4 py-3 font-mono text-[10px] text-white/25">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {u.is_banned ? (
                      <span className="font-mono text-[10px] text-red-400 border border-red-400/30 px-2 py-0.5 rounded-full">
                        Banned
                      </span>
                    ) : (
                      <span className="font-mono text-[10px] text-emerald-400/60">Active</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => handleBan(u.id, u.is_banned)}
                      disabled={acting === u.id}
                      className={`font-mono text-[10px] px-2 py-1 rounded border transition-colors ${
                        u.is_banned
                          ? 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                          : 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                      }`}
                    >
                      {u.is_banned ? 'Unban' : 'Ban'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── 4. Escrow ─────────────────────────────────────────────────────────────────
function EscrowPanel() {
  const [escrow, setEscrow] = useState([])
  const [loading, setLoading] = useState(true)
  const [acting, setActing]   = useState(null)

  useEffect(() => {
    api.get('/api/admin/escrow').then(({ data }) => {
      setEscrow(data); setLoading(false)
    })
  }, [])

  const manualPayout = async (txnId) => {
    setActing(txnId)
    await api.post(`/api/admin/escrow/${txnId}/payout`)
    setEscrow((e) => e.filter((t) => t.id !== txnId))
    setActing(null)
  }

  if (loading) return <p className="font-mono text-xs text-white/20 animate-pulse py-10">Loading…</p>
  if (!escrow.length) return (
    <div className="text-center py-20">
      <p className="font-mono text-sm text-white/25">No transactions in escrow</p>
    </div>
  )

  return (
    <div className="space-y-3">
      <p className="font-mono text-[11px] text-white/30 uppercase tracking-wider">
        {escrow.length} transaction{escrow.length !== 1 ? 's' : ''} in 7-day escrow hold
      </p>
      <div className="mesh-card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              {['Asset', 'Seller', 'Method', 'Payout', 'Clears In', 'Action'].map((h) => (
                <th key={h} className="text-left font-mono text-[10px] text-white/30 uppercase px-4 py-3 tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {escrow.map((txn) => (
              <tr key={txn.id} className="border-b border-border/50">
                <td className="px-4 py-3 font-mono text-xs text-white/60 max-w-[140px] truncate">
                  {txn.assets?.title}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-white/50">
                  {txn.profiles?.username}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-white/40 capitalize">
                  {txn.payment_method}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-emerald-400">
                  ${parseFloat(txn.seller_payout_usd).toFixed(2)}
                </td>
                <td className="px-4 py-3 font-mono text-xs">
                  {txn.days_until_payout === 0 ? (
                    <span className="text-emerald-400">Ready</span>
                  ) : (
                    <span className="text-white/30">{txn.days_until_payout}d</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => manualPayout(txn.id)}
                    disabled={acting === txn.id}
                    className="font-mono text-[10px] text-emerald-400 border border-emerald-500/30 px-2 py-1 rounded hover:bg-emerald-500/10 transition-colors disabled:opacity-40"
                  >
                    {acting === txn.id ? '…' : 'Pay Now'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 5. Adverts ────────────────────────────────────────────────────────────────
function AdvertsPanel() {
  const [adverts, setAdverts] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({
    title: '', image_url: '', target_url: '',
    slot: 'homepage_banner', expires_at: '', price_paid: ''
  })
  const [creating, setCreating] = useState(false)

  const load = () => {
    api.get('/api/admin/adverts').then(({ data }) => {
      setAdverts(data); setLoading(false)
    })
  }

  useEffect(() => { load() }, [])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleCreate = async () => {
    if (!form.title || !form.image_url || !form.target_url || !form.expires_at) {
      alert('Fill all required fields.'); return
    }
    setCreating(true)
    await api.post('/api/admin/adverts', { ...form, price_paid: parseFloat(form.price_paid) || 0 })
    setForm({ title: '', image_url: '', target_url: '', slot: 'homepage_banner', expires_at: '', price_paid: '' })
    load()
    setCreating(false)
  }

  const toggle = async (id, isActive) => {
    await api.patch(`/api/admin/adverts/${id}`, { is_active: !isActive })
    setAdverts((a) => a.map((ad) => ad.id === id ? { ...ad, is_active: !isActive } : ad))
  }

  const SLOTS = ['homepage_banner', 'sidebar', 'marketplace_top']

  return (
    <div className="space-y-8">
      {/* Create form */}
      <div className="mesh-card p-5 space-y-4">
        <h3 className="font-display font-semibold">Create Advert</h3>
        <div className="grid grid-cols-2 gap-4">
          {[
            ['Title *', 'title', 'Campaign name', 'text'],
            ['Image URL *', 'image_url', 'https://... R2 public URL', 'url'],
            ['Target URL *', 'target_url', 'https://...', 'url'],
            ['Price Paid ($)', 'price_paid', '200.00', 'number'],
          ].map(([label, key, placeholder, type]) => (
            <div key={key}>
              <label className="block font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">{label}</label>
              <input type={type} value={form[key]} onChange={set(key)} placeholder={placeholder}
                className="w-full bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-sm text-white/80 placeholder-white/20 focus:outline-none focus:border-white/25" />
            </div>
          ))}
          <div>
            <label className="block font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">Slot *</label>
            <select value={form.slot} onChange={set('slot')}
              className="w-full bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-sm text-white/80 focus:outline-none focus:border-white/25">
              {SLOTS.map((s) => <option key={s} value={s} className="bg-surface">{s.replace('_', ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="block font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">Expires *</label>
            <input type="datetime-local" value={form.expires_at} onChange={set('expires_at')}
              className="w-full bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-sm text-white/80 focus:outline-none focus:border-white/25" />
          </div>
        </div>
        <button onClick={handleCreate} disabled={creating} className="btn-primary">
          {creating ? 'Creating…' : '+ Create Advert'}
        </button>
      </div>

      {/* Advert list */}
      {loading ? (
        <p className="font-mono text-xs text-white/20 animate-pulse">Loading…</p>
      ) : (
        <div className="space-y-3">
          {adverts.map((ad) => (
            <div key={ad.id} className={`mesh-card p-4 flex items-center gap-4 ${!ad.is_active ? 'opacity-50' : ''}`}>
              <img src={ad.image_url} alt={ad.title} className="w-20 h-12 object-cover rounded-lg bg-canvas shrink-0"
                onError={(e) => { e.target.style.display = 'none' }} />
              <div className="flex-1 min-w-0">
                <p className="font-display font-semibold text-sm text-white">{ad.title}</p>
                <p className="font-mono text-[10px] text-white/30">
                  {ad.slot.replace('_', ' ')} · expires {new Date(ad.expires_at).toLocaleDateString()}
                  · {ad.impressions} views · {ad.clicks} clicks
                  {ad.price_paid > 0 && ` · $${ad.price_paid} paid`}
                </p>
              </div>
              <button
                onClick={() => toggle(ad.id, ad.is_active)}
                className={`font-mono text-[10px] px-3 py-1.5 rounded-lg border transition-colors shrink-0 ${
                  ad.is_active
                    ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                    : 'border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10'
                }`}
              >
                {ad.is_active ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main admin dashboard ──────────────────────────────────────────────────────
export default function AdminDashboard() {
  const { user, loading: authLoading } = useUserStore()
  const [tab, setTab] = useState(0)

  if (authLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <span className="font-mono text-xs text-white/20 animate-pulse">Loading…</span>
      </div>
    )
  }

  if (!user || !isAdminUser(user)) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="max-w-7xl mx-auto px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Admin Dashboard</h1>
          <p className="font-mono text-xs text-white/25 mt-0.5">Platform CEO view</p>
        </div>
        <span className="font-mono text-[11px] text-emerald-400/60 border border-emerald-500/20 px-3 py-1 rounded-full">
          ⬡ Admin — {user.email}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-border">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`font-mono text-xs px-4 py-2.5 border-b-2 transition-colors -mb-px ${
              tab === i ? 'border-emerald-400 text-white' : 'border-transparent text-white/30 hover:text-white/60'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 0 && <Overview />}
      {tab === 1 && <ReviewQueue />}
      {tab === 2 && <UserManagement />}
      {tab === 3 && <EscrowPanel />}
      {tab === 4 && <AdvertsPanel />}
    </div>
  )
}