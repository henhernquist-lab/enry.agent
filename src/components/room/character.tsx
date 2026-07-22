import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import type { Group } from 'three'
import { COLORS, ANIM } from './constants'
import { useIdleBehavior, getBreathingOffset, getTypingOffset, getLookOffset } from './animations'
import type { Position, IdleState } from './types'

interface CharacterProps {
  spawnPosition?: Position
}

/**
 * Stylized worker character — built entirely from R3F primitives.
 * No external GLTF; the character is a low-poly figure with:
 *   - Head (sphere) with subtle look-around rotation
 *   - Torso (capsule) with breathing oscillation
 *   - Two arms (capsules) that animate during typing
 *   - Two legs (capsules) — visible when standing, hidden when sitting
 *   - Green accent line on the chest (Enry brand)
 *
 * The idle behavior state machine cycles through:
 *   typing → looking → sitting → standing → (repeat)
 * Each state modifies the arm, head, and body position/rotation
 * to produce visibly different postures.
 */
export function Character({ spawnPosition = [0, 0, -0.5] }: CharacterProps) {
  const groupRef = useRef<Group>(null)
  const headRef = useRef<Group>(null)
  const leftArmRef = useRef<Group>(null)
  const rightArmRef = useRef<Group>(null)
  const leftLegRef = useRef<Group>(null)
  const rightLegRef = useRef<Group>(null)
  const bodyRef = useRef<Group>(null)

  const { tick } = useIdleBehavior()

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    const currentState = tick(state.clock.getDelta())
    const breathing = getBreathingOffset(t)

    // Body breathing — always active
    if (bodyRef.current) {
      bodyRef.current.position.y = breathing
    }

    // Head look-around — active during 'looking' state, subtle otherwise
    if (headRef.current) {
      if (currentState === 'looking') {
        headRef.current.rotation.y = getLookOffset(t) * 2
        headRef.current.rotation.x = Math.sin(t * 0.3) * 0.1
      } else {
        // Subtle idle head movement
        headRef.current.rotation.y = Math.sin(t * 0.2) * 0.05
        headRef.current.rotation.x = 0
      }
    }

    // Arms — typing oscillation during 'typing', relaxed otherwise
    const typingOffset = getTypingOffset(t)
    if (leftArmRef.current && rightArmRef.current) {
      if (currentState === 'typing') {
        leftArmRef.current.rotation.x = -0.6 + typingOffset
        rightArmRef.current.rotation.x = -0.6 - typingOffset
      } else if (currentState === 'sitting' || currentState === 'standing') {
        // Relaxed arms
        leftArmRef.current.rotation.x = THREE_LERP(leftArmRef.current.rotation.x, 0.05, 0.1)
        rightArmRef.current.rotation.x = THREE_LERP(rightArmRef.current.rotation.x, 0.05, 0.1)
      } else {
        // Looking — arms slightly forward
        leftArmRef.current.rotation.x = THREE_LERP(leftArmRef.current.rotation.x, -0.15, 0.05)
        rightArmRef.current.rotation.x = THREE_LERP(rightArmRef.current.rotation.x, -0.15, 0.05)
      }
    }

    // Posture — sitting vs standing changes the group Y and leg visibility
    const isSitting = currentState === ('sitting' as IdleState)
    const targetY = isSitting ? -0.15 : 0
    groupRef.current.position.y = THREE_LERP(groupRef.current.position.y, spawnPosition[1] + targetY, 0.08)

    // Legs — hide when sitting (chair occludes), show when standing
    if (leftLegRef.current && rightLegRef.current) {
      const legOpacity = isSitting ? 0 : 1
      leftLegRef.current.visible = !isSitting
      rightLegRef.current.visible = !isSitting
      // Subtle leg sway when standing
      if (!isSitting && currentState === 'standing') {
        leftLegRef.current.rotation.x = Math.sin(t * 0.8) * 0.03
        rightLegRef.current.rotation.x = -Math.sin(t * 0.8) * 0.03
      }
      void legOpacity
    }
  })

  return (
    <group ref={groupRef} position={spawnPosition}>
      {/* Body group — breathing moves this, not the root */}
      <group ref={bodyRef}>
        {/* Torso — capsule */}
        <mesh position={[0, 1.1, 0]} castShadow>
          <capsuleGeometry args={[0.35, 0.6, 8, 16]} />
          <meshStandardMaterial color={COLORS.characterBody} roughness={0.7} metalness={0.05} />
        </mesh>

        {/* Green accent stripe on chest */}
        <mesh position={[0, 1.2, 0.34]}>
          <boxGeometry args={[0.5, 0.04, 0.02]} />
          <meshStandardMaterial
            color={COLORS.characterAccent}
            emissive={COLORS.characterAccent}
            emissiveIntensity={0.2}
            roughness={0.4}
          />
        </mesh>

        {/* Head group — rotates for look-around */}
        <group ref={headRef} position={[0, 1.75, 0]}>
          {/* Head — sphere */}
          <mesh castShadow>
            <sphereGeometry args={[0.28, 24, 24]} />
            <meshStandardMaterial color={COLORS.characterHead} roughness={0.6} metalness={0.1} />
          </mesh>
          {/* Visor / screen-face — subtle emissive plane suggesting a digital face */}
          <mesh position={[0, 0, 0.25]}>
            <planeGeometry args={[0.35, 0.2]} />
            <meshStandardMaterial
              color={COLORS.monitorScreen}
              emissive={COLORS.primary}
              emissiveIntensity={0.08}
              roughness={0.2}
            />
          </mesh>
        </group>

        {/* Left arm — pivots from shoulder */}
        <group ref={leftArmRef} position={[-0.42, 1.35, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.5, 6, 12]} />
            <meshStandardMaterial color={COLORS.characterBody} roughness={0.7} metalness={0.05} />
          </mesh>
          {/* Hand */}
          <mesh position={[0, -0.62, 0]} castShadow>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={COLORS.characterHead} roughness={0.6} metalness={0.1} />
          </mesh>
        </group>

        {/* Right arm — pivots from shoulder */}
        <group ref={rightArmRef} position={[0.42, 1.35, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.5, 6, 12]} />
            <meshStandardMaterial color={COLORS.characterBody} roughness={0.7} metalness={0.05} />
          </mesh>
          {/* Hand */}
          <mesh position={[0, -0.62, 0]} castShadow>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={COLORS.characterHead} roughness={0.6} metalness={0.1} />
          </mesh>
        </group>

        {/* Left leg — visible when standing */}
        <group ref={leftLegRef} position={[-0.18, 0.65, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.55, 6, 12]} />
            <meshStandardMaterial color={COLORS.characterBody} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>

        {/* Right leg — visible when standing */}
        <group ref={rightLegRef} position={[0.18, 0.65, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.55, 6, 12]} />
            <meshStandardMaterial color={COLORS.characterBody} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

/** Simple lerp helper — avoids importing three directly in the JSX. */
function THREE_LERP(current: number, target: number, factor: number): number {
  return current + (target - current) * factor
}
