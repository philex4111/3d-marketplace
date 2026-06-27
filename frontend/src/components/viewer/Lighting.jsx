/**
 * components/viewer/Lighting.jsx
 * PBR lighting: HDRI environment + key light + contact shadows + grid.
 */
import { Environment, ContactShadows, Grid } from '@react-three/drei'

export function Lighting({ preset = 'studio' }) {
  return (
    <>
      <Environment preset={preset} />

      <directionalLight
        castShadow
        position={[5, 8, 5]}
        intensity={1.2}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-far={50}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
      />
      <ambientLight intensity={0.3} />

      <ContactShadows position={[0, -0.01, 0]} opacity={0.4} scale={10} blur={2} far={4} />

      <Grid
        position={[0, -0.011, 0]}
        args={[10, 10]}
        cellColor="#1a1f2e"
        sectionColor="#0e1018"
        fadeDistance={12}
        fadeStrength={1}
      />
    </>
  )
}
