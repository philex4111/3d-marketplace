/**
 * utils/glbThumbnail.js
 * Generates a rendered JPEG from a .glb URL using an offscreen Three.js canvas.
 *
 * CHANGELOG:
 *   - Checks IndexedDB (ThumbnailCache) first — persists across page refreshes
 *   - Falls back to in-memory map for same-session deduplication
 *   - 3/4 angle camera for cinematic look matching Sketchfab
 */
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment'
import { ThumbnailCache } from './thumbnailCache'

const dracoLoader = new DRACOLoader()
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/')

const loader = new GLTFLoader()
loader.setDRACOLoader(dracoLoader)

// Deduplicate concurrent calls for the same URL
const inFlight = new Map()

export async function generateGlbThumbnail(url, width = 480, height = 480) {
  if (!url) return null

  // 1. Check persistent IndexedDB cache first
  const cached = await ThumbnailCache.get(url)
  if (cached) return cached

  // 2. Deduplicate — if already rendering this URL, wait for that promise
  if (inFlight.has(url)) return inFlight.get(url)

  const promise = new Promise((resolve) => {
    const canvas    = document.createElement('canvas')
    canvas.width    = width
    canvas.height   = height

    const renderer  = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: true,
    })
    renderer.setSize(width, height)
    renderer.setPixelRatio(1)
    renderer.outputEncoding     = THREE.sRGBEncoding
    renderer.toneMapping        = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.35
    renderer.shadowMap.enabled  = true

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x0d0f18)

    const pmrem      = new THREE.PMREMGenerator(renderer)
    const envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    scene.environment = envTexture

    scene.add(new THREE.GridHelper(10, 20, 0x1a1f2e, 0x0e1018))

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.01, 1000)

    loader.load(url, (gltf) => {
      const model = gltf.scene
      scene.add(model)

      const box    = new THREE.Box3().setFromObject(model)
      const size   = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      const maxDim = Math.max(size.x, size.y, size.z)
      const fov    = camera.fov * (Math.PI / 180)
      const dist   = Math.abs(maxDim / (2 * Math.tan(fov / 2))) * 1.55

      // 3/4 elevated angle — cinematic, same as Sketchfab default
      camera.position.set(
        center.x + dist * 0.6,
        center.y + maxDim * 0.38,
        center.z + dist * 0.88
      )
      camera.lookAt(center)

      // Position grid at model base
      scene.children
        .find((c) => c.isGridHelper)
        ?.position.set(0, box.min.y, 0)

      renderer.render(scene, camera)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.88)

      // Persist to IndexedDB so next page load is instant
      ThumbnailCache.set(url, dataUrl)

      resolve(dataUrl)
      renderer.dispose()
      pmrem.dispose()
      inFlight.delete(url)
    },
    undefined,
    () => {
      resolve(null)
      renderer.dispose()
      inFlight.delete(url)
    })
  })

  inFlight.set(url, promise)
  return promise
}
