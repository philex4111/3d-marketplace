/**
 * components/viewer/SceneModel.jsx
 *
 * ANIMATION SYSTEM REWRITE:
 *   - Dropped useAnimations (Drei) — it misses clips targeting deep bone hierarchies
 *   - Now uses THREE.AnimationMixer directly, attached to the scene root
 *   - AnimationMixer.clipAction() resolves bone targets by name across the full hierarchy
 *   - Detects ALL clip types: skeletal, morph target, object transform, single-frame poses
 *   - Emits enriched clip metadata: { name, duration, type } so UI can show pose vs animation
 *   - Smooth 0.4s crossfade between clips via fadeOut/fadeIn
 *   - "Pose" mode (activeClip === null) stops all actions and resets to bind pose
 */
import { useEffect, useRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

useGLTF.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNum(n) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(Math.round(n))
}

function computeStats(obj) {
  let tris = 0, verts = 0
  const mats = new Set()
  obj.traverse((o) => {
    if (!o.isMesh) return
    const g = o.geometry
    tris  += g.index ? g.index.count / 3 : (g.attributes.position?.count ?? 0) / 3
    verts += g.attributes.position?.count ?? 0
    const m = o.material
    ;(Array.isArray(m) ? m : [m]).forEach((mat) => mat && mats.add(mat.uuid))
  })
  return { tris: fmtNum(tris), verts: fmtNum(verts), mats: mats.size }
}

/**
 * Detect clip type from its tracks — helps the UI label poses vs animations.
 * Returns: 'pose' | 'morph' | 'skeletal' | 'transform'
 */
function detectClipType(clip) {
  // Single-frame clip = pose
  if (clip.duration < 0.05) return 'pose'

  const hasMorph    = clip.tracks.some((t) => t.name.includes('morphTargetInfluences'))
  const hasSkeletal = clip.tracks.some((t) => t.name.includes('.quaternion') || t.name.includes('.bones'))

  if (hasMorph)    return 'morph'
  if (hasSkeletal) return 'skeletal'
  return 'transform'
}

// ── Default mesh shown before any model is loaded ─────────────────────────────
function DefaultMesh() {
  const ref = useRef()
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.22 })
  return (
    <group ref={ref}>
      <mesh castShadow>
        <icosahedronGeometry args={[0.85, 4]} />
        <meshStandardMaterial color="#1a2a4a" metalness={0.85} roughness={0.15} envMapIntensity={2.5} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.88, 1]} />
        <meshBasicMaterial color="#2a4a7a" wireframe transparent opacity={0.22} />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[0.5, 0]} />
        <meshStandardMaterial color="#0a3060" metalness={1} roughness={0.05} envMapIntensity={3} />
      </mesh>
    </group>
  )
}

// ── Loaded GLTF model with full animation detection ───────────────────────────
function GltfModel({ url, onStats, onAnimations, activeClip }) {
  const { scene, animations } = useGLTF(url)
  const { camera, controls }  = useThree()

  // Mixer lives in a ref — persists across renders without triggering re-renders
  const mixerRef   = useRef(null)
  const actionsRef = useRef({})  // { clipName: THREE.AnimationAction }
  const prevClip   = useRef(null)

  // ── Step 1: Camera fit + stats emission ──────────────────────────────────

 useEffect(() => {
  const box     = new THREE.Box3().setFromObject(scene)
  const size    = box.getSize(new THREE.Vector3())
  const center  = box.getCenter(new THREE.Vector3())
  const maxDim  = Math.max(size.x, size.y, size.z)
  const dist    = Math.abs(maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360))) * 2.2  // was 1.6 — pulls camera back more on load

  camera.position.set(center.x, center.y + maxDim * 0.2, center.z + dist)
  camera.near = maxDim * 0.001   // dynamic near plane — prevents z-fighting on close zoom
  camera.far  = maxDim * 500     // dynamic far plane — prevents clipping on far zoom
  camera.updateProjectionMatrix()

  if (controls) { controls.target.copy(center); controls.update() }

  onStats?.(computeStats(scene))
}, [scene, camera, controls, onStats])

  // ── Step 2: Build mixer + register ALL clips ──────────────────────────────
  useEffect(() => {
    if (!animations || animations.length === 0) {
      onAnimations?.([])
      return
    }

    // Create mixer attached to scene root — resolves bone targets across full hierarchy
    const mixer = new THREE.AnimationMixer(scene)
    mixerRef.current = mixer
    actionsRef.current = {}

    const clipMeta = animations.map((clip) => {
      // clipAction() does a deep search through the scene graph for bone/target names
      const action = mixer.clipAction(clip)
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = false
      actionsRef.current[clip.name] = action

      return {
        name:     clip.name,
        duration: parseFloat(clip.duration.toFixed(2)),
        type:     detectClipType(clip),
        tracks:   clip.tracks.length,
      }
    })

    // Emit enriched metadata to parent
    onAnimations?.(clipMeta)

    return () => {
      // Cleanup: stop all actions and destroy mixer on unmount / url change
      mixer.stopAllAction()
      mixer.uncacheRoot(scene)
      mixerRef.current = null
      actionsRef.current = {}
    }
  }, [scene, animations, onAnimations])

  // ── Step 3: Crossfade when activeClip changes ─────────────────────────────
  useEffect(() => {
    const mixer   = mixerRef.current
    const actions = actionsRef.current
    if (!mixer) return

    // Fade out current clip
    if (prevClip.current && actions[prevClip.current]) {
      actions[prevClip.current].fadeOut(0.35)
    }

    if (activeClip === null) {
      // Pose mode — stop everything, freeze in current pose
      mixer.stopAllAction()
      prevClip.current = null
      return
    }

    if (actions[activeClip]) {
      actions[activeClip].reset().fadeIn(0.35).play()
      prevClip.current = activeClip
    }
  }, [activeClip])

  // ── Step 4: Tick the mixer every frame ───────────────────────────────────
  useFrame((_, delta) => {
    mixerRef.current?.update(delta)
  })

  return <primitive object={scene} />
}

// ── FPS sampler ───────────────────────────────────────────────────────────────
function FpsSampler({ onFps }) {
  const frames = useRef(0)
  const bucket = useRef(0)
  const last   = useRef(performance.now())

  useFrame(() => {
    const now = performance.now()
    bucket.current += now - last.current
    last.current = now
    if (++frames.current >= 30) {
      onFps(Math.round(1000 / (bucket.current / frames.current)))
      frames.current = 0
      bucket.current = 0
    }
  })
  return null
}

// ── Export ────────────────────────────────────────────────────────────────────
export function SceneModel({ url, onStats, onFps, onAnimations, activeClip }) {
  return (
    <>
      <FpsSampler onFps={onFps} />
      {url
        ? <GltfModel
            url={url}
            onStats={onStats}
            onAnimations={onAnimations}
            activeClip={activeClip}
          />
        : <DefaultMesh />
      }
    </>
  )
}
