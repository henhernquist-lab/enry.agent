import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { PointLight, DirectionalLight } from 'three'
import { COLORS, ANIM } from './constants'
import type { RoomDefinition } from './types'

interface LightingProps {
  room: RoomDefinition
}

/**
 * Premium lighting rig — hemisphere + ambient base, warm directional key,
 * a dedicated spot on the worker (the focal point), green accent light,
 * monitor glow that actually illuminates the desk, and window daylight.
 *
 * Point/spot intensities are in physical units (three r155+ candela with
 * distance² decay) — single-digit values are candle-dim, which is why the
 * original rig read as near-black. Don't "tidy" these down.
 *
 * Subtle intensity drift on the accent and monitor lights keeps the
 * room feeling alive without being distracting.
 */
export function Lighting({ room }: LightingProps) {
  const accentRef = useRef<PointLight>(null)
  const monitorRef = useRef<PointLight>(null)
  const keyRef = useRef<DirectionalLight>(null)

  // Spotlight target — aimed at the worker's seat at the desk
  const spotTarget = useMemo(() => {
    const obj = new THREE.Object3D()
    obj.position.set(0, 1.0, -0.4)
    return obj
  }, [])

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (accentRef.current) {
      accentRef.current.intensity = 18 + Math.sin(t * 0.5) * 2
    }
    if (monitorRef.current) {
      monitorRef.current.intensity = 11 + Math.sin(t * ANIM.monitorPulseSpeed) * 2.0
    }
    // Very subtle key light drift — simulates time of day shift
    if (keyRef.current) {
      keyRef.current.position.x = 6 + Math.sin(t * 0.02) * 0.5
    }
  })

  return (
    <>
      {/* Hemisphere — sky/ground bounce so vertical surfaces never go black */}
      <hemisphereLight
        args={['#a8bccb', '#3d4a42']}
        intensity={0.65}
      />

      {/* Ambient base — soft fill so no area is pitch black */}
      <ambientLight intensity={room.ambientIntensity} color={COLORS.ambientColor} />

      {/* Key directional light — warm, from upper right, casts primary shadows */}
      <directionalLight
        ref={keyRef}
        position={[6, 10, 4]}
        intensity={2.2}
        color={COLORS.directionalColor}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-far={30}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={10}
        shadow-camera-bottom={-10}
        shadow-bias={-0.0005}
      />

      {/* Fill light — cool, from upper left, softer to fill shadow areas */}
      <directionalLight
        position={[-5, 6, -3]}
        intensity={0.45}
        color={COLORS.monitorLightColor}
      />

      {/* Character key spot — the worker is the focal point of the scene */}
      <primitive object={spotTarget} />
      <spotLight
        position={[2.2, 4.6, 2.4]}
        target={spotTarget}
        angle={0.55}
        penumbra={0.7}
        intensity={70}
        distance={12}
        color="#fdf3e3"
        castShadow
        shadow-bias={-0.0004}
      />

      {/* Accent point light — Enry green, near the desk, subtle pulse */}
      <pointLight
        ref={accentRef}
        position={[0, 2.8, 0.6]}
        intensity={18}
        distance={10}
        color={COLORS.accentLightColor}
      />

      {/* Green rim light — low behind the worker, silhouettes the character
          in Enry green and washes the floor around the desk */}
      <pointLight
        position={[-1.6, 0.7, 1.4]}
        intensity={7}
        distance={6}
        color={COLORS.accentLightColor}
      />

      {/* Monitor glow light — cool blue, illuminates the desk and worker */}
      <pointLight
        ref={monitorRef}
        position={[0, 1.8, -1.9]}
        intensity={11}
        distance={6}
        color={COLORS.monitorLightColor}
      />

      {/* Window light — cool daylight from the right wall */}
      <pointLight
        position={[5.2, 2.5, 0]}
        intensity={9}
        distance={9}
        color={ANIM.windowLightColor}
      />

      {/* Desk lamp light — warm glow from the desk area.
          The lamp itself also has a point light in furniture.tsx,
          but this one is a softer ambient fill. */}
      <pointLight
        position={[-1.2, 1.5, -0.8]}
        intensity={2.5}
        distance={3.5}
        color={COLORS.lampLightColor}
      />
    </>
  )
}
