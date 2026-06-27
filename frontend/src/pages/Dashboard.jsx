/**
 * pages/Dashboard.jsx
 * Authenticated seller dashboard.
 * - Upload new asset (dual-file form)
 * - View listed assets
 * - View sales / transactions
 * - AI credit balance
 */
import { useState, useEffect, useRef } from 'react'
import { TabErrorBoundary } from '../components/TabErrorBoundary'
import { Link } from 'react-router-dom'
import { supabase } from '../services/supabaseClient'
import { uploadAsset } from '../services/uploadApi'
import { useUserStore } from '../store/userStore'
import { generateAndUploadThumbnail } from '../utils/generateAndUploadThumbnail'
import { Monetize } from '../components/dashboard/Monetize'

const TABS = ['My Assets', 'Upload', 'Sales', 'Account', 'Monetize']
const CATEGORIES = ['character', 'vehicle', 'environment', 'weapon', 'prop', 'animal', 'vfx']

// ── Extracted Sub-components (Fixes the disappearing cursor bug!) ───────────
const FileZone = ({ label, accept, file, onFile, hint, inputRef }) => (
  <div
    onClick={() => inputRef.current?.click()}
    className={`border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors text-center ${
      file ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-border hover:border-white/20'
    }`}
  >
    <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={(e) => onFile(e.target.files[0])} />
    {file ? (
      <div>
        <p className="font-mono text-xs text-emerald-400">✓ {file.name}</p>
        <p className="font-mono text-[10px] text-white/25 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
      </div>
    ) : (
      <div>
        <p className="font-mono text-xs text-white/40">{label}</p>
        <p className="font-mono text-[10px] text-white/20 mt-1">{hint}</p>
      </div>
    )}
  </div>
)

const Field = ({ label, value, onChange, placeholder, type = 'text', as = 'input', rows }) => (
  <div>
    <label className="block font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">{label}</label>
    {as === 'textarea' ? (
      <textarea rows={rows || 3} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-sm text-white/80 placeholder-white/15 focus:outline-none focus:border-white/25 resize-none" />
    ) : (
      <input type={type} value={value} onChange={onChange} placeholder={placeholder}
        className="w-full bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-sm text-white/80 placeholder-white/15 focus:outline-none focus:border-white/25" />
    )}
  </div>
)

// ── Upload Form ─────────────────────────────────────────────────────────────
function UploadForm({ onDone }) {
  const { user } = useUserStore()
  const glbRef = useRef()
  const zipRef = useRef()

  const [glbFile, setGlbFile]       = useState(null)
  const [zipFile, setZipFile]       = useState(null)
  const [progress, setProgress]     = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]           = useState('')
  const [form, setForm] = useState({
    title: '', description: '', category: 'character',
    price_usd: '', tags: '', poly_count: '',
    formats_included: '', software_used: '',
  })

  const prettySpeed = (bps) => {
    if (!bps || bps <= 0) return '0 KB/s'
    const kb = bps / 1024
    if (kb < 1024) return `${kb.toFixed(1)} KB/s`
    return `${(kb / 1024).toFixed(2)} MB/s`
  }

  const prettyPhase = (phase) => {
    switch (phase) {
      case 'starting':             return 'Preparing upload...'
      case 'uploading_display':    return 'Uploading display file...'
      case 'uploading_source':     return 'Uploading source file...'
      case 'uploading_via_server': return 'Uploading via server relay...'
      case 'finalizing_asset':     return 'Finalizing asset record...'
      case 'generating_thumbnail': return 'Generating thumbnail...'
      case 'done':                 return 'Upload complete.'
      default:                     return 'Uploading...'
    }
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    if (!glbFile || !zipFile) { setError('Both .glb display file and .zip source file are required.'); return }
    if (!form.title || !form.price_usd) { setError('Title and price are required.'); return }
    setError(''); setSubmitting(true)

    try {
      // Step 1 — Upload files and create asset record
      const asset = await uploadAsset({
        glbFile,
        zipFile,
        metadata: {
          ...form,
          price_usd: parseFloat(form.price_usd),
          poly_count: form.poly_count ? parseInt(form.poly_count) : null,
          tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
          formats_included: form.formats_included.split(',').map((t) => t.trim()).filter(Boolean),
          software_used: form.software_used.split(',').map((t) => t.trim()).filter(Boolean),
          is_free: parseFloat(form.price_usd) === 0,
        },
        onProgress: setProgress,
      })

      // Step 2 — Render thumbnail from the uploaded GLB and store in R2
      // Non-fatal: if this fails the asset is still published, just no thumbnail
      if (asset?.display_glb_url && asset?.slug) {
        setProgress((p) => ({ ...p, phase: 'generating_thumbnail' }))
        const thumbUrl = await generateAndUploadThumbnail(asset.display_glb_url, asset.slug)
        if (thumbUrl) {
          await supabase
            .from('assets')
            .update({ thumbnail_url: thumbUrl })
            .eq('id', asset.id)
        }
      }

      onDone()
    } catch (e) {
      setError(e.message || 'Upload failed.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="font-display text-xl font-600">Upload New Asset</h2>

      {/* Files */}
      <div className="grid grid-cols-2 gap-4">
        <FileZone label="⊕ Display File (.glb)" accept=".glb,.gltf" file={glbFile} onFile={setGlbFile} hint="Draco-compressed · max 15 MB" inputRef={glbRef} />
        <FileZone label="⊕ Source File (.zip)" accept=".zip" file={zipFile} onFile={setZipFile} hint="Raw files + textures" inputRef={zipRef} />
      </div>

      <Field label="Title *" value={form.title} onChange={set('title')} placeholder="Dragon Character Rig" />
      <Field label="Description" value={form.description} onChange={set('description')} placeholder="Describe your model…" as="textarea" />

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">Category *</label>
          <select value={form.category} onChange={set('category')} className="w-full bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-sm text-white/80 focus:outline-none focus:border-white/25">
            {CATEGORIES.map((c) => <option key={c} value={c} className="bg-surface capitalize">{c}</option>)}
          </select>
        </div>
        <Field label="Price (USD) *" value={form.price_usd} onChange={set('price_usd')} placeholder="12.00" type="number" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Poly Count" value={form.poly_count} onChange={set('poly_count')} placeholder="15000" type="number" />
        <Field label="Tags (comma-separated)" value={form.tags} onChange={set('tags')} placeholder="lowpoly, pbr, fantasy" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Formats included" value={form.formats_included} onChange={set('formats_included')} placeholder="FBX, OBJ, BLEND" />
        <Field label="Software used" value={form.software_used} onChange={set('software_used')} placeholder="Blender, Substance" />
      </div>

      {error && <p className="font-mono text-xs text-red-400">{error}</p>}

      {/* Progress */}
      {progress && (
        <div className="space-y-2">
          <div className="flex items-center justify-between font-mono text-[10px] text-white/35">
            <span>{prettyPhase(progress.phase)}</span>
            <span>{prettySpeed(progress.speedBps)}</span>
          </div>
          <div>
            <div className="flex justify-between font-mono text-[10px] text-white/35 mb-1">
              <span>Overall upload</span>
              <span>{Math.round((progress.glb + progress.zip) / 2)}%</span>
            </div>
            <div className="h-1.5 bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-400 transition-all duration-300 rounded-full"
                style={{ width: `${Math.round((progress.glb + progress.zip) / 2)}%` }}
              />
            </div>
          </div>
          {[['Display .glb', progress.glb], ['Source .zip', progress.zip]].map(([label, pct]) => (
            <div key={label}>
              <div className="flex justify-between font-mono text-[10px] text-white/30 mb-1">
                <span>{label}</span><span>{pct}%</span>
              </div>
              <div className="h-1 bg-border rounded-full overflow-hidden">
                <div className="h-full bg-emerald-400 transition-all duration-300 rounded-full" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <button onClick={handleSubmit} disabled={submitting} className="btn-primary w-full py-3 disabled:cursor-wait">
        {submitting ? 'Uploading…' : 'Publish Asset'}
      </button>
    </div>
  )
}

// ── My Assets ───────────────────────────────────────────────────────────────
function MyAssets({ userId }) {
  const [assets, setAssets] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('assets').select('id, title, slug, status, sale_count, price_usd, created_at')
      .eq('seller_id', userId).order('created_at', { ascending: false })
      .then(({ data }) => { setAssets(data || []); setLoading(false) })
  }, [userId])

  const STATUS_COLOR = { published: 'text-emerald-400', draft: 'text-white/30', pending_review: 'text-yellow-400', rejected: 'text-red-400', archived: 'text-white/20' }

  if (loading) return <div className="font-mono text-xs text-white/20 animate-pulse py-10">Loading…</div>
  if (!assets.length) return (
    <div className="text-center py-20">
      <span className="text-4xl text-white/10 block mb-4">⬡</span>
      <p className="font-mono text-sm text-white/25">No assets yet. Upload your first model.</p>
    </div>
  )

  return (
    <div className="space-y-2">
      {assets.map((a) => (
        <div key={a.id} className="mesh-card px-5 py-4 flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Link to={`/asset/${a.slug}`} className="font-display font-600 text-sm hover:text-emerald-400 transition-colors truncate block">{a.title}</Link>
            <p className="font-mono text-[10px] text-white/25 mt-0.5">{new Date(a.created_at).toLocaleDateString()}</p>
          </div>
          <span className={`font-mono text-[11px] capitalize ${STATUS_COLOR[a.status] || 'text-white/30'}`}>{a.status}</span>
          <span className="font-mono text-xs text-white/50">{a.sale_count} sales</span>
          <span className="font-mono text-xs text-emerald-400">${a.price_usd}</span>
        </div>
      ))}
    </div>
  )
}

// ── Sales ───────────────────────────────────────────────────────────────────
function Sales({ userId }) {
  const [txns, setTxns] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('transactions').select('id, created_at, amount_usd, seller_payout_usd, payment_method, status, assets(title)')
      .eq('seller_id', userId).eq('status', 'completed').order('created_at', { ascending: false }).limit(50)
      .then(({ data }) => { setTxns(data || []); setLoading(false) })
  }, [userId])

  const total = txns.reduce((s, t) => s + parseFloat(t.seller_payout_usd), 0)

  if (loading) return <div className="font-mono text-xs text-white/20 animate-pulse py-10">Loading…</div>

  return (
    <div>
      <div className="mesh-card p-6 mb-6 inline-block">
        <p className="font-mono text-[11px] text-white/30 uppercase tracking-wider mb-1">Total Earnings</p>
        <p className="font-display text-3xl font-700 text-emerald-400">${total.toFixed(2)}</p>
      </div>

      {!txns.length ? (
        <p className="font-mono text-sm text-white/25">No sales yet.</p>
      ) : (
        <div className="space-y-2">
          {txns.map((t) => (
            <div key={t.id} className="mesh-card px-5 py-3.5 flex items-center justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="font-mono text-xs text-white/60 truncate">{t.assets?.title}</p>
                <p className="font-mono text-[10px] text-white/25 mt-0.5">{new Date(t.created_at).toLocaleString()}</p>
              </div>
              <span className="tag capitalize">{t.payment_method}</span>
              <span className="font-mono text-xs text-emerald-400">+${parseFloat(t.seller_payout_usd).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Account ─────────────────────────────────────────────────────────────────
function Account({ user }) {
  const [profile, setProfile] = useState(null)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [form, setForm]       = useState({ display_name: '', bio: '', mpesa_number: '', payout_wallet: '' })

  useEffect(() => {
    supabase.from('profiles').select('*').eq('id', user.id).single().then(({ data }) => {
      setProfile(data)
      if (data) setForm({ display_name: data.display_name || '', bio: data.bio || '', mpesa_number: data.mpesa_number || '', payout_wallet: data.payout_wallet || '' })
    })
  }, [user.id])

  const save = async () => {
    setSaving(true)
    await supabase.from('profiles').update(form).eq('id', user.id)
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (!profile) return <div className="font-mono text-xs text-white/20 animate-pulse py-10">Loading…</div>

  return (
    <div className="max-w-md space-y-5">
      <div className="mesh-card p-4 flex items-center gap-4">
        <div className="w-12 h-12 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center font-display text-lg font-700 text-emerald-400">
          {user.email?.charAt(0).toUpperCase()}
        </div>
        <div>
          <p className="font-display font-600 text-sm">{profile.username}</p>
          <p className="font-mono text-[11px] text-white/30">{user.email}</p>
          <div className="flex items-center gap-2 mt-1">
            <span className={`font-mono text-[10px] ${profile.is_pro ? 'text-emerald-400' : 'text-white/20'}`}>
              {profile.is_pro ? '★ Pro' : 'Free tier'}
            </span>
            <span className="font-mono text-[10px] text-white/20">· {profile.ai_credits} AI credits</span>
          </div>
        </div>
      </div>

      {[
        ['Display Name', 'display_name', 'Your public name'],
        ['Bio', 'bio', 'About you…'],
        ['M-Pesa Number', 'mpesa_number', '2547XXXXXXXX'],
        ['USDT Wallet (TRC-20)', 'payout_wallet', 'TYour...Address'],
      ].map(([label, k, placeholder]) => (
        <div key={k}>
          <label className="block font-mono text-[11px] text-white/35 mb-1.5 uppercase tracking-wider">{label}</label>
          <input
            value={form[k]}
            onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))}
            placeholder={placeholder}
            className="w-full bg-canvas border border-border rounded-lg px-3 py-2 font-mono text-sm text-white/80 placeholder-white/15 focus:outline-none focus:border-white/25"
          />
        </div>
      ))}

      <button onClick={save} disabled={saving} className="btn-primary w-full">
        {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Changes'}
      </button>
    </div>
  )
}

// ── Dashboard page ──────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, session } = useUserStore()
  const userId = user?.id ?? session?.user?.id
  const [tab, setTab] = useState(0)

  return (
    <div className="max-w-7xl mx-auto px-5 py-10">
      <div className="mb-8 flex items-center justify-between">
        <h1 className="font-display text-2xl font-700">Dashboard</h1>
        <p className="font-mono text-xs text-white/25">{user?.email}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-8 border-b border-border pb-0">
        {TABS.map((t, i) => (
          <button
            key={t}
            onClick={() => setTab(i)}
            className={`font-mono text-xs px-4 py-2.5 border-b-2 transition-colors -mb-px ${
              tab === i
                ? 'border-emerald-400 text-white'
                : 'border-transparent text-white/30 hover:text-white/60'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      {tab === 0 && <MyAssets userId={userId} />}
      {tab === 1 && <UploadForm onDone={() => setTab(0)} />}
      {tab === 2 && <Sales userId={userId} />}
      {tab === 3 && user && <Account user={user} />}
      {tab === 4 && (
        <TabErrorBoundary resetKey={userId}>
          <Monetize userId={userId} />
        </TabErrorBoundary>
      )}
    </div>
  )
}