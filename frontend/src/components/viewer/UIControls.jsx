/**
 * components/viewer/UIControls.jsx
 *
 * CHANGELOG:
 *   - AnimationSelector now receives enriched clip objects { name, duration, type }
 *   - Type badge shown per clip: POSE / MORPH / SKEL / ANIM
 *   - Duration shown in seconds so users can distinguish quick poses from long anims
 *   - Clips sorted: poses first, then animations by duration
 *   - "Bind Pose" option resets model to zero state (no animation)
 *   - Panel auto-scrolls, max 60% of viewer height
 */
import { useRef, useState, useCallback, useEffect } from 'react'

// ── Type badge ────────────────────────────────────────────────────────────────
const TYPE_LABEL = {
  pose:      { label: 'POSE',  color: 'text-blue-400  border-blue-400/30  bg-blue-400/8'  },
  morph:     { label: 'MORPH', color: 'text-purple-400 border-purple-400/30 bg-purple-400/8' },
  skeletal:  { label: 'SKEL',  color: 'text-yellow-400 border-yellow-400/30 bg-yellow-400/8' },
  transform: { label: 'ANIM',  color: 'text-emerald-400 border-emerald-400/30 bg-emerald-400/8' },
}

function TypeBadge({ type }) {
  const t = TYPE_LABEL[type] || TYPE_LABEL.transform
  return (
    <span className={`font-mono text-[8px] px-1 py-0.5 rounded border ${t.color} leading-none shrink-0`}>
      {t.label}
    </span>
  )
}

// ── Animation / Pose selector panel ──────────────────────────────────────────
function AnimationSelector({ animations, activeClip, onClipChange }) {
  if (!animations || animations.length === 0) return null

  const fmt = (name) => name.length > 20 ? name.slice(0, 18) + '…' : name
  const fmtDur = (d) => d < 0.05 ? 'pose' : `${d.toFixed(1)}s`

  // Sort: poses first, then by duration ascending
  const sorted = [...animations].sort((a, b) => {
    if (a.type === 'pose' && b.type !== 'pose') return -1
    if (a.type !== 'pose' && b.type === 'pose') return 1
    return a.duration - b.duration
  })

  const hasPoses = sorted.some((c) => c.type === 'pose')
  const hasAnims = sorted.some((c) => c.type !== 'pose')

  return (
    <div
      className="absolute top-10 right-3 w-52 flex flex-col gap-1 pointer-events-auto"
      style={{ maxHeight: '60%', overflowY: 'auto', scrollbarWidth: 'none' }}
    >
      {/* Header */}
      <div className="font-mono text-[9px] text-white/20 uppercase tracking-widest px-0.5 mb-0.5 flex items-center justify-between">
        <span>{animations.length} clip{animations.length !== 1 ? 's' : ''} detected</span>
      </div>

      {/* Bind pose button — stops all animations */}
      <button
        onClick={() => onClipChange(null)}
        className={`w-full font-mono text-[10px] px-2.5 py-1.5 rounded-lg border text-left transition-all duration-150 flex items-center gap-2 ${
          activeClip === null
            ? 'border-white/25 bg-white/8 text-white/80'
            : 'border-white/5 bg-black/40 text-white/25 hover:text-white/50 hover:border-white/15'
        }`}
      >
        <span className="text-white/40">◻</span>
        <span className="flex-1">Bind Pose</span>
        <span className="font-mono text-[8px] text-white/20">static</span>
      </button>

      {/* Poses section */}
      {hasPoses && (
        <p className="font-mono text-[8px] text-white/15 uppercase tracking-widest px-0.5 mt-1">
          Poses
        </p>
      )}
      {sorted.filter((c) => c.type === 'pose').map((clip) => (
        <ClipButton
          key={clip.name}
          clip={clip}
          active={activeClip === clip.name}
          onClick={() => onClipChange(clip.name)}
          fmt={fmt}
          fmtDur={fmtDur}
        />
      ))}

      {/* Animations section */}
      {hasAnims && (
        <p className="font-mono text-[8px] text-white/15 uppercase tracking-widest px-0.5 mt-1">
          Animations
        </p>
      )}
      {sorted.filter((c) => c.type !== 'pose').map((clip) => (
        <ClipButton
          key={clip.name}
          clip={clip}
          active={activeClip === clip.name}
          onClick={() => onClipChange(clip.name)}
          fmt={fmt}
          fmtDur={fmtDur}
        />
      ))}
    </div>
  )
}

function ClipButton({ clip, active, onClick, fmt, fmtDur }) {
  return (
    <button
      onClick={onClick}
      title={clip.name}
      className={`w-full font-mono text-[10px] px-2.5 py-1.5 rounded-lg border text-left transition-all duration-150 flex items-center gap-2 ${
        active
          ? 'border-emerald-400/40 bg-emerald-400/10 text-emerald-400'
          : 'border-white/5 bg-black/40 text-white/30 hover:text-white/60 hover:border-white/15'
      }`}
    >
      <span className="shrink-0">{active ? '▶' : '○'}</span>
      <span className="flex-1 truncate">{fmt(clip.name)}</span>
      <TypeBadge type={clip.type} />
      <span className="font-mono text-[8px] text-white/20 shrink-0">{fmtDur(clip.duration)}</span>
    </button>
  )
}

// ── Main HUD overlay ──────────────────────────────────────────────────────────
export function UIControls({ fps, stats, hasModel, onFileLoaded, animations, activeClip, onClipChange }) {
  const wrapRef  = useRef(null)
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  const handleFile = useCallback((file) => {
    if (!file) return
    const name = file.name.toLowerCase()
    if (!name.endsWith('.glb') && !name.endsWith('.gltf')) return
    onFileLoaded(URL.createObjectURL(file))
  }, [onFileLoaded])

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const over  = (e) => { e.preventDefault(); setDragging(true) }
    const leave = (e) => { if (!el.contains(e.relatedTarget)) setDragging(false) }
    const drop  = (e) => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }
    el.addEventListener('dragover', over)
    el.addEventListener('dragleave', leave)
    el.addEventListener('drop', drop)
    return () => {
      el.removeEventListener('dragover', over)
      el.removeEventListener('dragleave', leave)
      el.removeEventListener('drop', drop)
    }
  }, [handleFile])

  return (
    <div ref={wrapRef} className="absolute inset-0 pointer-events-none select-none">

      {/* Drop overlay */}
      {dragging && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-[#07080e]/85 backdrop-blur-sm pointer-events-none">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          <span className="font-mono text-xs text-emerald-400 tracking-widest">DROP .GLB / .GLTF</span>
        </div>
      )}

      {/* Top bar */}
      <div className="absolute top-3 left-4 right-4 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[.15em] text-white/20 uppercase">MESH Viewer</span>
        <div className="font-mono text-[10px] text-emerald-400/60 bg-emerald-400/6 border border-emerald-400/15 px-2 py-0.5 rounded">
          {fps > 0 ? `${fps} fps` : '-- fps'}
        </div>
      </div>

      {/* Animation / Pose selector */}
      <AnimationSelector
        animations={animations}
        activeClip={activeClip}
        onClipChange={onClipChange}
      />

      {/* Bottom bar */}
      <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between">
        <div className="flex gap-4">
          <span className="font-mono text-[10px] text-white/25">△ {stats.tris}</span>
          <span className="font-mono text-[10px] text-white/25">◎ {stats.verts}</span>
          <span className="font-mono text-[10px] text-white/25">◈ {stats.mats}</span>
        </div>
        <label className="font-mono text-[10px] text-emerald-400/50 hover:text-emerald-400 cursor-pointer pointer-events-auto transition-colors">
          <input
            ref={inputRef}
            type="file"
            accept=".glb,.gltf"
            className="hidden"
            onChange={(e) => handleFile(e.target.files[0])}
          />
          ⊕ load file
        </label>
      </div>

      {/* Centre hint */}
      {!hasModel && !dragging && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <p className="font-mono text-[11px] text-white/12">drag & drop a .glb file to preview</p>
        </div>
      )}

      {/* Controls hint */}
      <div className="absolute bottom-10 left-4 hidden md:flex gap-4">
        {['↖↗ orbit', '⊕⊖ zoom', '⇧ pan'].map((h) => (
          <span key={h} className="font-mono text-[10px] text-white/12">{h}</span>
        ))}
      </div>
    </div>
  )
}
