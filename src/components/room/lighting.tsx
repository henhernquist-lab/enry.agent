import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { PointLight, DirectionalLight } from 'three'
import { COLORS, ANIM } from './constants'
import type { RoomDefinition } from './types'

interface LightingProps {
  room: RoomDefinition
}

/**
 * Premium lighting rig — ambient base + warm directional key + green accent
 * point light + cool monitor light. Subtle intensity drift on the accent
 * and monitor lights keeps the room feeling alive without being distracting.
 */
export function Lighting({ room }: LightingProps) {
  const accentRef = useRef<PointLight>(null)
  const monitorRef = useRef<PointLight>(null)
  const keyRef = useRef<DirectionalLight>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    if (accentRef.current) {
      accentRef.current.intensity = 0.6 + Math.sin(t * 0.5) * 0.08
    }
    if (monitorRef.current) {
      monitorRef.current.intensity = 0.8 + Math.sin(t * ANIM.monitorPulseSpeed) * ANIM.monitorPulseAmplitude
    }
    // Very subtle key light drift — simulates time of day shift
    if (keyRef.current) {
      keyRef.current.position.x = 6 + Math.sin(t * 0.02) * 0.5
    }
  })

  return (
    <>
      {/* Ambient base — soft fill so no area is pitch black */}
      <ambientLight intensity={room.ambientIntensity} color={COLORS.ambientColor} />

      {/* Key directional light — warm, from upper right, casts primary shadows */}
      <directionalLight
        ref={keyRef}
        position={[6, 10, 4]}
        intensity={1.2}
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
        intensity={0.3}
        color={COLORS.monitorLightColor}
      />

      {/* Accent point light — Enry green, near the desk, subtle pulse */}
      <pointLight
        ref={accentRef}
        position={[0, 2.5, 0]}
        intensity={0.6}
        distance={8}
        color={COLORS.accentLightColor}
      />

      {/* Monitor glow light — cool blue, positioned at the screen */}
      <pointLight
        ref={monitorRef}
        position={[0, 1.8, -2.8]}
        intensity={0.8}
        distance={5}
        color={COLORS.monitorLightColor}
      />
    </>
  )
}
