/**
 * components/viewer/OrbitCamera.jsx
 *
 * CHANGELOG:
 *   - minDistance reduced 0.1 → 0.01  (can zoom very close)
 *   - maxDistance increased 50 → 200   (can zoom very far out)
 *   - Added enableZoom explicit true
 *   - Added zoomSpeed 1.5 for snappier scroll response
 */
import { OrbitControls } from '@react-three/drei'

export function OrbitCamera({
  autoRotate = true,
  autoRotateSpeed = 0.6,
  dampingFactor = 0.06,
  minDistance = 0.01,
  maxDistance = 200,
}) {
  return (
    <OrbitControls
      makeDefault
      autoRotate={autoRotate}
      autoRotateSpeed={autoRotateSpeed}
      enableDamping
      dampingFactor={dampingFactor}
      enableZoom
      zoomSpeed={1.5}
      minDistance={minDistance}
      maxDistance={maxDistance}
      enablePan
    />
  )
}