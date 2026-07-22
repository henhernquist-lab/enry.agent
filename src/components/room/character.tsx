'use client'

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { COLORS, ANIM } from './constants'
import { getBreathingOffset, getActivityPose, lerpPose, NEUTRAL_POSE, type ActivityPose } from './animations'
import { useWalkingController, getWalkingAnimation } from './walking-controller'
import type { RoomStore } from './room-state'
import { useActivitySnapshot } from './room-state'
import type { Position, Activity } from './types'

// ───────────────────────────────────────────────────────────────────
// CharacterController — the character is now driven entirely by
// external systems (ActivityManager + WalkingController + RoomState).
//
// The character component does NOT decide what to do — it only:
//   1. Reads the current activity from the store
//   2. Reads walking state from the walking controller
//   3. Applies the correct pose for the current activity
//   4. Lerps smoothly between poses for transitions
//
// This separation means:
//   - New activities = add a case in getActivityPose + register in config
//   - Multiple characters = each gets its own store + walker
//   - Real events = just dispatch to the store, character reacts
// ───────────────────────────────────────────────────────────────────

interface CharacterControllerProps {
  store: RoomStore
  walker: ReturnType<typeof useWalkingController>
  spawnPosition?: Position
}

export function CharacterController({
  store,
  walker,
  spawnPosition = [0, 0, -0.2],
}: CharacterControllerProps) {
  const groupRef = useRef<THREE.Group>(null)
  const headRef = useRef<THREE.Group>(null)
  const leftArmRef = useRef<THREE.Group>(null)
  const rightArmRef = useRef<THREE.Group>(null)
  const leftLegRef = useRef<THREE.Group>(null)
  const rightLegRef = useRef<THREE.Group>(null)
  const bodyRef = useRef<THREE.Group>(null)

  // Current pose (lerped each frame toward target)
  const currentPoseRef = useRef<ActivityPose>({ ...NEUTRAL_POSE })

  // Status label visibility
  const { activity, label } = useActivitySnapshot(store)
  const showLabel = label !== '' && activity !== 'walking'

  // Sync initial position
  useMemo(() => {
    if (groupRef.current) {
      groupRef.current.position.set(...spawnPosition)
    }
  }, [spawnPosition])

  useFrame((state) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime
    const delta = state.clock.getDelta()

    // ── Walking ──────────────────────────────────────────────────
    const isWalking = walker.tick(delta, groupRef.current)
    const currentActivity = store.getActivity()

    // ── Pose computation ─────────────────────────────────────────
    let targetPose: ActivityPose

    if (isWalking || currentActivity === 'walking') {
      // Walking pose — legs swing, arms swing, body bob
      const walkAnim = getWalkingAnimation(t)
      targetPose = {
        headY: Math.sin(t * 0.5) * 0.05,
        headX: 0,
        leftArmX: walkAnim.leftArmRotation,
        rightArmX: walkAnim.rightArmRotation,
        leftArmZ: 0,
        rightArmZ: 0,
        bodyY: walkAnim.bodyBob,
        legsVisible: true,
        leftLegX: walkAnim.leftLegRotation,
        rightLegX: walkAnim.rightLegRotation,
        bodyLeanX: 0.03,
      }
    } else {
      // Activity-specific pose
      targetPose = getActivityPose(currentActivity, t)
    }

    // Breathing — always layered on top
    const breathing = getBreathingOffset(t)
    targetPose.bodyY += breathing

    // Lerp current pose toward target for smooth transitions
    const transitionSpeed = store.character.transitionProgress < 1
      ? 0.08 + store.character.transitionProgress * 0.04
      : 0.06
    currentPoseRef.current = lerpPose(currentPoseRef.current, targetPose, transitionSpeed)
    const pose = currentPoseRef.current

    // ── Apply pose to skeleton ───────────────────────────────────
    if (headRef.current) {
      headRef.current.rotation.y = pose.headY
      headRef.current.rotation.x = pose.headX
    }

    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = pose.leftArmX
      leftArmRef.current.rotation.z = pose.leftArmZ
    }
    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = pose.rightArmX
      rightArmRef.current.rotation.z = pose.rightArmZ
    }

    if (leftLegRef.current) {
      leftLegRef.current.visible = pose.legsVisible
      leftLegRef.current.rotation.x = pose.leftLegX
    }
    if (rightLegRef.current) {
      rightLegRef.current.visible = pose.legsVisible
      rightLegRef.current.rotation.x = pose.rightLegX
    }

    if (bodyRef.current) {
      bodyRef.current.position.y = pose.bodyY
      bodyRef.current.rotation.x = pose.bodyLeanX
    }

    // ── Root position: lerp Y for sit/stand, keep XZ from walker ─
    if (!isWalking) {
      const targetRootY = spawnPosition[1] + (pose.legsVisible ? 0 : 0)
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        targetRootY,
        0.08,
      )
    }
  })

  return (
    <group ref={groupRef} position={spawnPosition}>
      {/* Status label — floating above the character */}
      {showLabel && (
        <Html
          position={[0, 2.3, 0]}
          center
          distanceFactor={8}
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <StatusLabel text={label} activity={activity} />
        </Html>
      )}

      {/* Body group — breathing + lean moves this, not the root */}
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
          <mesh castShadow>
            <sphereGeometry args={[0.28, 24, 24]} />
            <meshStandardMaterial color={COLORS.characterHead} roughness={0.6} metalness={0.1} />
          </mesh>
          {/* Visor / screen-face */}
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

// ── Status Label ───────────────────────────────────────────────────

function StatusLabel({ text, activity }: { text: string; activity: Activity }) {
  // Color shifts subtly based on activity type
  const colorClass =
    activity === 'celebrating'
      ? 'text-primary'
      : activity === 'typing'
        ? 'text-muted-foreground'
        : activity === 'thinking'
          ? 'text-blue-400/60'
          : 'text-muted-foreground/70'

  return (
    <div
      style={{
        background: 'rgba(8,8,8,0.85)',
        border: '1px solid rgba(58,158,96,0.15)',
        borderRadius: '6px',
        padding: '3px 10px',
        fontFamily: 'monospace',
        fontSize: '11px',
        whiteSpace: 'nowrap',
        backdropFilter: 'blur(8px)',
        userSelect: 'none',
        transition: 'opacity 0.4s ease',
      }}
      className={colorClass}
    >
      {text}
    </div>
  )
}
