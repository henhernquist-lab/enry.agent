import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Mesh, MeshStandardMaterial } from 'three'
import { COLORS, ROOM_DIMS, ANIM } from './constants'

// ───────────────────────────────────────────────────────────────────
// Furniture — all geometry is built from R3F primitives (boxes, planes).
// No external GLTF assets in this foundation; future versions can swap
// individual components for loaded models without touching the rest.
// ───────────────────────────────────────────────────────────────────

/** Floor — large plane with subtle grid-like material. */
export function Floor() {
  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[ROOM_DIMS.width, ROOM_DIMS.depth]} />
      <meshStandardMaterial
        color={COLORS.floor}
        roughness={0.85}
        metalness={0.1}
      />
    </mesh>
  )
}

/** Back wall — the wall behind the desk. */
export function WallBack() {
  return (
    <mesh position={[0, ROOM_DIMS.height / 2, -ROOM_DIMS.depth / 2]} receiveShadow>
      <boxGeometry args={[ROOM_DIMS.width, ROOM_DIMS.height, ROOM_DIMS.wallThickness]} />
      <meshStandardMaterial color={COLORS.wallBack} roughness={0.9} metalness={0.05} />
    </mesh>
  )
}

/** Left wall. */
export function WallLeft() {
  return (
    <mesh
      position={[-ROOM_DIMS.width / 2, ROOM_DIMS.height / 2, 0]}
      rotation={[0, Math.PI / 2, 0]}
      receiveShadow
    >
      <boxGeometry args={[ROOM_DIMS.depth, ROOM_DIMS.height, ROOM_DIMS.wallThickness]} />
      <meshStandardMaterial color={COLORS.wallLeft} roughness={0.9} metalness={0.05} />
    </mesh>
  )
}

/** Ceiling — dark plane above, absorbs light. */
export function Ceiling() {
  return (
    <mesh
      rotation={[Math.PI / 2, 0, 0]}
      position={[0, ROOM_DIMS.height, 0]}
    >
      <planeGeometry args={[ROOM_DIMS.width, ROOM_DIMS.depth]} />
      <meshStandardMaterial color={COLORS.ceiling} roughness={1} metalness={0} />
    </mesh>
  )
}

/** Desk — a modern flat-top desk with a subtle accent edge. */
export function Desk() {
  return (
    <group position={[0, 0, -1.5]}>
      {/* Desktop surface */}
      <mesh position={[0, 1.0, 0]} castShadow receiveShadow>
        <boxGeometry args={[3.5, 0.08, 1.8]} />
        <meshStandardMaterial color={COLORS.deskTop} roughness={0.5} metalness={0.15} />
      </mesh>
      {/* Desk legs — 4 thin columns */}
      {[
        [-1.6, 0.5, -0.8],
        [1.6, 0.5, -0.8],
        [-1.6, 0.5, 0.8],
        [1.6, 0.5, 0.8],
      ].map((pos, i) => (
        <mesh key={i} position={pos as [number, number, number]} castShadow>
          <boxGeometry args={[0.08, 1.0, 0.08]} />
          <meshStandardMaterial color={COLORS.desk} roughness={0.6} metalness={0.2} />
        </mesh>
      ))}
      {/* Accent strip — thin green line along the front edge */}
      <mesh position={[0, 1.04, 0.9]}>
        <boxGeometry args={[3.4, 0.01, 0.02]} />
        <meshStandardMaterial
          color={COLORS.primary}
          emissive={COLORS.primary}
          emissiveIntensity={0.3}
          roughness={0.3}
        />
      </mesh>
    </group>
  )
}

/** Chair — stylized office chair with seat, back, and base. */
export function Chair() {
  return (
    <group position={[0, 0, -0.2]}>
      {/* Seat */}
      <mesh position={[0, 0.65, 0]} castShadow>
        <boxGeometry args={[0.8, 0.1, 0.8]} />
        <meshStandardMaterial color={COLORS.chairSeat} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Backrest */}
      <mesh position={[0, 1.15, -0.35]} castShadow>
        <boxGeometry args={[0.8, 1.0, 0.08]} />
        <meshStandardMaterial color={COLORS.chair} roughness={0.6} metalness={0.1} />
      </mesh>
      {/* Center column */}
      <mesh position={[0, 0.35, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.5, 12]} />
        <meshStandardMaterial color={COLORS.chair} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Base — 5-point star (simplified as a flat disc) */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.45, 0.06, 5]} />
        <meshStandardMaterial color={COLORS.chair} roughness={0.5} metalness={0.2} />
      </mesh>
    </group>
  )
}

/** Computer monitor — glowing screen with a stand. The screen pulses. */
export function Monitor() {
  const screenRef = useRef<Mesh>(null)
  const matRef = useRef<MeshStandardMaterial>(null)

  useFrame((state) => {
    if (matRef.current) {
      const t = state.clock.elapsedTime
      matRef.current.emissiveIntensity =
        0.4 + Math.sin(t * ANIM.monitorPulseSpeed) * ANIM.monitorPulseAmplitude
    }
  })

  return (
    <group position={[0, 1.1, -2.3]}>
      {/* Monitor stand neck */}
      <mesh position={[0, 0.15, 0]} castShadow>
        <boxGeometry args={[0.08, 0.3, 0.08]} />
        <meshStandardMaterial color={COLORS.monitorFrame} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Monitor stand base */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.3, 0.04, 16]} />
        <meshStandardMaterial color={COLORS.monitorFrame} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Monitor body / frame */}
      <mesh ref={screenRef} position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[2.2, 1.3, 0.08]} />
        <meshStandardMaterial color={COLORS.monitorFrame} roughness={0.4} metalness={0.3} />
      </mesh>
      {/* Screen — emissive plane on the front of the monitor */}
      <mesh position={[0, 0.7, 0.045]}>
        <planeGeometry args={[2.05, 1.15]} />
        <meshStandardMaterial
          ref={matRef}
          color={COLORS.monitorScreen}
          emissive={COLORS.monitorGlow}
          emissiveIntensity={0.4}
          roughness={0.2}
          metalness={0.1}
        />
      </mesh>
      {/* Green accent LED on bottom bezel */}
      <mesh position={[0.9, 0.12, 0.05]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial
          color={COLORS.primaryGlow}
          emissive={COLORS.primaryGlow}
          emissiveIntensity={1.0}
        />
      </mesh>
    </group>
  )
}

/** All furniture assembled as a single group for easy composition. */
export function Furniture() {
  return (
    <group>
      <Floor />
      <WallBack />
      <WallLeft />
      <Ceiling />
      <Desk />
      <Chair />
      <Monitor />
    </group>
  )
}
