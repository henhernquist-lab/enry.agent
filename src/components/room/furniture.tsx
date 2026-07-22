import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { MeshStandardMaterial } from 'three'
import { COLORS, ROOM_DIMS, ANIM } from './constants'

// ───────────────────────────────────────────────────────────────────
// Furniture — all geometry is built from R3F primitives (boxes, planes).
// No external GLTF assets in this foundation; future versions can swap
// individual components for loaded models without touching the rest.
//
// New additions: Whiteboard, Coffee Machine, Window, Keyboard LED,
// Desk Lamp — all with subtle animations for environment life.
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
          emissiveIntensity={1.0}
          roughness={0.3}
        />
      </mesh>
      {/* Keyboard — small dark slab on desk */}
      <mesh position={[0, 1.05, 0.3]} castShadow>
        <boxGeometry args={[1.2, 0.03, 0.35]} />
        <meshStandardMaterial color={COLORS.desk} roughness={0.7} metalness={0.1} />
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

/** Computer monitor — glowing screen with a stand. The screen pulses + flickers. */
export function Monitor() {
  const matRef = useRef<MeshStandardMaterial>(null)
  const flickerRef = useRef<{ active: boolean; elapsed: number }>({ active: false, elapsed: 0 })

  useFrame((state, delta) => {
    if (!matRef.current) return
    const t = state.clock.elapsedTime

    // Random flicker
    if (flickerRef.current.active) {
      flickerRef.current.elapsed += delta
      if (flickerRef.current.elapsed >= ANIM.monitorFlickerDuration) {
        flickerRef.current.active = false
        flickerRef.current.elapsed = 0
      }
      matRef.current.emissiveIntensity = 0.5
    } else {
      // Normal pulse + random flicker chance
      if (Math.random() < ANIM.monitorFlickerChance) {
        flickerRef.current.active = true
      }
      matRef.current.emissiveIntensity =
        1.4 + Math.sin(t * ANIM.monitorPulseSpeed) * ANIM.monitorPulseAmplitude * 2
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
      <mesh position={[0, 0.7, 0]} castShadow>
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
          emissiveIntensity={1.4}
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

/** Keyboard LED — small green LED on the desk that pulses. */
export function KeyboardLed() {
  const matRef = useRef<MeshStandardMaterial>(null)

  useFrame((state) => {
    if (!matRef.current) return
    const t = state.clock.elapsedTime
    matRef.current.emissiveIntensity =
      1.2 + Math.sin(t * ANIM.keyboardLedPulseSpeed) * ANIM.keyboardLedPulseAmplitude
  })

  return (
    <mesh position={[0.5, 1.075, 0.3]}>
      <sphereGeometry args={[0.015, 8, 8]} />
      <meshStandardMaterial
        ref={matRef}
        color={COLORS.keyboardLed}
        emissive={COLORS.keyboardLed}
        emissiveIntensity={0.3}
        roughness={0.2}
      />
    </mesh>
  )
}

/** Desk lamp — a small adjustable lamp with a glowing head. */
export function DeskLamp() {
  const matRef = useRef<MeshStandardMaterial>(null)
  const lightRef = useRef<import('three').PointLight>(null)

  useFrame((state) => {
    const t = state.clock.elapsedTime
    const glow = 1.1 + Math.sin(t * ANIM.lampGlowSpeed) * ANIM.lampGlowAmplitude * 4
    if (matRef.current) {
      matRef.current.emissiveIntensity = glow
    }
    // Physical units — the lamp is a real local light source now
    if (lightRef.current) {
      lightRef.current.intensity = glow * 6
    }
  })

  return (
    <group position={[-1.2, 1.04, -0.8]}>
      {/* Base */}
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.12, 0.14, 0.04, 12]} />
        <meshStandardMaterial color={COLORS.deskLamp} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Arm — angled pole */}
      <mesh position={[0, 0.25, 0.05]} rotation={[0.3, 0, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, 0.5, 8]} />
        <meshStandardMaterial color={COLORS.deskLamp} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Lamp head — cone pointing down */}
      <mesh position={[0, 0.45, 0.15]} rotation={[Math.PI * 0.7, 0, 0]} castShadow>
        <coneGeometry args={[0.12, 0.15, 12]} />
        <meshStandardMaterial color={COLORS.deskLampHead} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Glow bulb — emissive sphere inside the cone */}
      <mesh position={[0, 0.42, 0.18]}>
        <sphereGeometry args={[0.05, 8, 8]} />
        <meshStandardMaterial
          ref={matRef}
          color={COLORS.lampLightColor}
          emissive={COLORS.lampLightColor}
          emissiveIntensity={1.1}
          roughness={0.1}
        />
      </mesh>
      {/* Point light from the lamp */}
      <pointLight
        ref={lightRef}
        position={[0, 0.42, 0.18]}
        intensity={6}
        distance={3.5}
        color={COLORS.lampLightColor}
      />
    </group>
  )
}

/** Whiteboard — a wall-mounted board the character stands at while thinking. */
export function Whiteboard() {
  return (
    <group position={[-3.5, 0, -4.8]}>
      {/* Frame */}
      <mesh position={[0, 2, 0]} castShadow>
        <boxGeometry args={[2.5, 1.5, 0.06]} />
        <meshStandardMaterial color={COLORS.whiteboard} roughness={0.5} metalness={0.1} />
      </mesh>
      {/* Surface — slightly lighter, matte */}
      <mesh position={[0, 2, 0.04]}>
        <planeGeometry args={[2.3, 1.3]} />
        <meshStandardMaterial color={COLORS.whiteboardSurface} roughness={0.9} metalness={0} />
      </mesh>
      {/* Subtle green line on the board — like a diagram */}
      <mesh position={[0, 2.1, 0.05]}>
        <boxGeometry args={[1.5, 0.015, 0.002]} />
        <meshStandardMaterial
          color={COLORS.primary}
          emissive={COLORS.primary}
          emissiveIntensity={0.5}
          roughness={0.4}
        />
      </mesh>
      {/* Another line */}
      <mesh position={[-0.3, 1.8, 0.05]}>
        <boxGeometry args={[0.015, 0.6, 0.002]} />
        <meshStandardMaterial
          color={COLORS.primaryDim}
          emissive={COLORS.primaryDim}
          emissiveIntensity={0.4}
          roughness={0.4}
        />
      </mesh>
      {/* Marker tray */}
      <mesh position={[0, 1.2, 0.08]} castShadow>
        <boxGeometry args={[2.4, 0.06, 0.08]} />
        <meshStandardMaterial color={COLORS.desk} roughness={0.6} metalness={0.2} />
      </mesh>
    </group>
  )
}

/** Coffee machine — a small appliance in the corner. */
export function CoffeeMachine() {
  const ledRef = useRef<MeshStandardMaterial>(null)

  useFrame((state) => {
    if (!ledRef.current) return
    const t = state.clock.elapsedTime
    ledRef.current.emissiveIntensity = 1.0 + Math.sin(t * 1.5) * 0.3
  })

  return (
    <group position={[4, 0, -3]} rotation={[0, -Math.PI / 3, 0]}>
      {/* Body */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[0.6, 1.2, 0.5]} />
        <meshStandardMaterial color={COLORS.coffeeMachine} roughness={0.5} metalness={0.15} />
      </mesh>
      {/* Top section — slightly wider */}
      <mesh position={[0, 1.25, 0]} castShadow>
        <boxGeometry args={[0.65, 0.15, 0.55]} />
        <meshStandardMaterial color={COLORS.coffeeMachineTop} roughness={0.4} metalness={0.2} />
      </mesh>
      {/* Spout */}
      <mesh position={[0, 0.95, 0.28]} castShadow>
        <boxGeometry args={[0.1, 0.15, 0.1]} />
        <meshStandardMaterial color={COLORS.desk} roughness={0.5} metalness={0.3} />
      </mesh>
      {/* Drip tray */}
      <mesh position={[0, 0.25, 0.15]} castShadow>
        <boxGeometry args={[0.5, 0.04, 0.2]} />
        <meshStandardMaterial color={COLORS.desk} roughness={0.5} metalness={0.2} />
      </mesh>
      {/* Power LED */}
      <mesh position={[0.2, 0.7, 0.26]}>
        <sphereGeometry args={[0.02, 8, 8]} />
        <meshStandardMaterial
          ref={ledRef}
          color={COLORS.primary}
          emissive={COLORS.primary}
          emissiveIntensity={1.0}
          roughness={0.2}
        />
      </mesh>
    </group>
  )
}

/** Window — a glowing panel on the right wall suggesting outside light. */
export function Window() {
  const matRef = useRef<MeshStandardMaterial>(null)

  useFrame((state) => {
    if (!matRef.current) return
    const t = state.clock.elapsedTime
    // Very subtle intensity drift — like clouds passing
    matRef.current.emissiveIntensity =
      ANIM.windowLightIntensity + Math.sin(t * 0.1) * 0.03
  })

  return (
    <group position={[5.9, 2.5, 0]} rotation={[0, -Math.PI / 2, 0]}>
      {/* Frame */}
      <mesh position={[0, 0, 0]} castShadow>
        <boxGeometry args={[3, 2.5, 0.08]} />
        <meshStandardMaterial color={COLORS.windowFrame} roughness={0.7} metalness={0.1} />
      </mesh>
      {/* Glass — emissive, suggesting daylight outside */}
      <mesh position={[0, 0, 0.05]}>
        <planeGeometry args={[2.7, 2.2]} />
        <meshStandardMaterial
          ref={matRef}
          color={COLORS.window}
          emissive={ANIM.windowLightColor}
          emissiveIntensity={ANIM.windowLightIntensity}
          roughness={0.1}
          metalness={0.05}
        />
      </mesh>
      {/* Cross frame — mullions */}
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[0.04, 2.2, 0.02]} />
        <meshStandardMaterial color={COLORS.windowFrame} roughness={0.7} metalness={0.1} />
      </mesh>
      <mesh position={[0, 0, 0.06]}>
        <boxGeometry args={[2.7, 0.04, 0.02]} />
        <meshStandardMaterial color={COLORS.windowFrame} roughness={0.7} metalness={0.1} />
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
      <KeyboardLed />
      <DeskLamp />
      <Whiteboard />
      <CoffeeMachine />
      <Window />
    </group>
  )
}
