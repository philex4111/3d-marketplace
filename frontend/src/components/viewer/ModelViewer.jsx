/**
 * components/viewer/ModelViewer.jsx
 *
 * CHANGELOG:
 *   - animations state now holds enriched clip objects: { name, duration, type, tracks }
 *   - Auto-selects first clip by name on model load
 *   - Passes activeClip name (string | null) down to SceneModel
 */
import { Suspense, useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { Html, useProgress } from '@react-three/drei'
import { OrbitCamera }  from './OrbitCamera'
import { Lighting }     from './Lighting'
import { SceneModel }   from './SceneModel'
import { UIControls }   from './UIControls'

function ModelLoader() {
  const { progress } = useProgress()
  return (
    <Html center>
      <div className="font-mono text-xs text-emerald-400 tracking-widest whitespace-nowrap bg-[#07080e]/90 px-4 py-2.5 rounded-lg border border-[#1a1f2e] backdrop-blur-sm flex items-center gap-3">
        <span className="w-3 h-3 rounded-full border border-emerald-400/40 border-t-emerald-400 animate-spin inline-block" />
        LOADING ASSET… {progress.toFixed(0)}%
      </div>
    </Html>
  )
}

export function ModelViewer({ src = null, file = null, className = '' }) {
  const [modelUrl, setModelUrl]     = useState(() => {
    if (src)  return src
    if (file) return URL.createObjectURL(file)
    return null
  })
  const [stats, setStats]           = useState({ tris: '—', verts: '—', mats: '—' })
  const [fps, setFps]               = useState(0)
  const [animations, setAnimations] = useState([])  // [{ name, duration, type, tracks }]
  const [activeClip, setActiveClip] = useState(null) // clip name string | null

  const handleFileLoaded = useCallback((url) => {
    setModelUrl(url)
    setAnimations([])
    setActiveClip(null)
  }, [])

  const handleAnimations = useCallback((clips) => {
    setAnimations(clips)
    // Auto-play the first clip if available
    setActiveClip(clips.length > 0 ? clips[0].name : null)
  }, [])

  return (
    <div
      className={`relative w-full rounded-xl overflow-hidden bg-[#07080e] border border-[#1a1f2e] ${className}`}
      style={{ isolation: 'isolate', minHeight: '420px' }}
    >
      <Canvas
        dpr={[1, 2]}
        camera={{ fov: 45, near: 0.01, far: 1000, position: [0, 0.8, 3] }}
        shadows
        gl={{ antialias: true, toneMapping: 4 }}
        onCreated={({ gl }) => { gl.toneMappingExposure = 1.2 }}
      >
        <Suspense fallback={<ModelLoader />}>
          <Lighting />
          <OrbitCamera />
          <SceneModel
            url={modelUrl}
            onStats={setStats}
            onFps={setFps}
            onAnimations={handleAnimations}
            activeClip={activeClip}
          />
        </Suspense>
      </Canvas>

      <UIControls
        fps={fps}
        stats={stats}
        hasModel={!!modelUrl}
        onFileLoaded={handleFileLoaded}
        animations={animations}
        activeClip={activeClip}
        onClipChange={setActiveClip}
      />
    </div>
  )
}
