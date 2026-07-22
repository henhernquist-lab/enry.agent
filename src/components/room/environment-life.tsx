'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { ANIM, COLORS, ROOM_DIMS } from './constants'

// ───────────────────────────────────────────────────────────────────
// EnvironmentLife — subtle environmental animations that make the
// room feel alive without being distracting.
//
// Includes:
//   - Floating dust particles (instanced for performance)
//   - Subtle ambient drift on the particles
//
// Monitor flicker, keyboard LED pulse, desk lamp glow, and window
// light drift are handled in furniture.tsx (on the objects themselves).
// ───────────────────────────────────────────────────────────────────

/** Dust particles — tiny floating motes that drift slowly. */
export function DustParticles() {
  const meshRef = useRef<THREE.InstancedMesh>(null)
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const particles = useMemo(() => {
    const count = ANIM.dustParticleCount
    return Array.from({ length: count }, () => ({
      x: (Math.random() - 0.5) * ROOM_DIMS.width * 0.8,
      y: Math.random() * ANIM.dustMaxHeight,
      z: (Math.random() - 0.5) * ROOM_DIMS.depth * 0.8,
      phase: Math.random() * Math.PI * 2,
      driftX: (Math.random() - 0.5) * ANIM.dustDriftAmplitude,
      driftZ: (Math.random() - 0.5) * ANIM.dustDriftAmplitude,
    }))
  }, [])

  useFrame((state) => {
    if (!meshRef.current) return
    const t = state.clock.elapsedTime

    particles.forEach((p, i) => {
      // Drift in a slow figure-8 pattern
      const drift = t * ANIM.dustDriftSpeed
      const x = p.x + Math.sin(drift + p.phase) * p.driftX
      const z = p.z + Math.cos(drift * 0.7 + p.phase) * p.driftZ
      // Slow vertical bob — stays within room bounds
      const y = p.y + Math.sin(t * 0.2 + p.phase) * 0.3

      dummy.position.set(x, y, z)
      dummy.scale.setScalar(0.015)
      dummy.updateMatrix()
      if (meshRef.current) meshRef.current.setMatrixAt(i, dummy.matrix)
    })
    meshRef.current.instanceMatrix.needsUpdate = true
  })

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, ANIM.dustParticleCount]}
    >
      <sphereGeometry args={[1, 4, 4]} />
      <meshStandardMaterial
        color={COLORS.primaryGlow}
        emissive={COLORS.primaryGlow}
        emissiveIntensity={0.08}
        transparent
        opacity={0.35}
        roughness={1}
        metalness={0}
      />
    </instancedMesh>
  )
}

/** EnvironmentLife — assembles all ambient environment effects. */
export function EnvironmentLife() {
  return (
    <group>
      <DustParticles />
    </group>
  )
}
