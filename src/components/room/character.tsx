'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { COLORS, VISOR_COLORS } from './constants'
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

/** Real context shown in the click mini-HUD and speech bubble — no filler. */
export interface WorkerInfo {
  /** Which surface opened The Room (drive/cruise/learn/chat), if any. */
  surface?: string
  /** That surface's run state at entry. */
  state?: 'working' | 'idle'
  /** Top model from today's real usage log. */
  topModel?: string
  /** One-line usage summary, e.g. "DeepSeek V4 Pro · 34 req today". */
  modelLine?: string
  /** From the shared /api/activity/recent source — same feed as the homepage
   *  Live Activity widget, e.g. "Drive · DeepSeek V4 Pro · 2m ago". */
  recentActivityLine?: string
}

interface CharacterControllerProps {
  store: RoomStore
  walker: ReturnType<typeof useWalkingController>
  spawnPosition?: Position
  info?: WorkerInfo
  /** Fired when the character model itself is clicked (opens the worker HUD). */
  onCharacterClick?: () => void
}

export function CharacterController({
  store,
  walker,
  spawnPosition = [0, 0, -0.2],
  info,
  onCharacterClick,
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

  // Visor material — emissive color tracks the activity state
  const visorMatRef = useRef<THREE.MeshStandardMaterial>(null)
  const visorTmpColor = useMemo(() => new THREE.Color(), [])

  // Status label visibility
  const { activity, label } = useActivitySnapshot(store)
  const showLabel = activity !== 'walking'

  // ── Speech-bubble fragments — real state only, no filler ────────
  const fragments = useMemo(() => {
    const f: string[] = []
    if (label) f.push(label)
    if (info?.surface) {
      f.push(`${info.surface} session · ${info.state === 'working' ? 'active' : 'idle'}`)
    }
    if (info?.modelLine) f.push(info.modelLine)
    if (info?.recentActivityLine) f.push(info.recentActivityLine)
    return f.length > 0 ? f : ['Idle']
  }, [label, info])

  // Render side uses modulo, so a stale index is always safe when the
  // fragment list shrinks — no sync reset needed.
  const [fragIdx, setFragIdx] = useState(0)
  useEffect(() => {
    if (fragments.length < 2) return
    const id = setInterval(() => setFragIdx((i) => i + 1), 4000)
    return () => clearInterval(id)
  }, [fragments])

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    onCharacterClick?.()
  }

  // Initial position comes from the <group position={spawnPosition}> prop —
  // no ref sync needed (and refs are null during the first render anyway).

  // R3F's delta argument, not clock.getDelta() — getDelta() measures since
  // the LAST getDelta() call anywhere, and several useFrame callbacks share
  // the clock, so each caller saw a near-zero slice (walking barely moved).
  useFrame((state, delta) => {
    if (!groupRef.current) return
    const t = state.clock.elapsedTime

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

    // ── Visor emissive — green idle, blue-white working, amber error ─
    if (visorMatRef.current) {
      const targetColor = VISOR_COLORS[currentActivity] ?? VISOR_COLORS.idle
      visorMatRef.current.emissive.lerp(visorTmpColor.set(targetColor), 0.08)
      if (currentActivity === 'error') {
        // Urgent pulse, flashing toward red on the peaks
        const pulse = Math.sin(t * 6)
        visorMatRef.current.emissiveIntensity = 0.9 + pulse * 0.5
        if (pulse > 0.6) {
          visorMatRef.current.emissive.lerp(visorTmpColor.set('#ff4a3d'), 0.35)
        }
      } else {
        visorMatRef.current.emissiveIntensity +=
          (0.7 - visorMatRef.current.emissiveIntensity) * 0.08
      }
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
    <group
      ref={groupRef}
      position={spawnPosition}
      onClick={handleClick}
      onPointerOver={() => { document.body.style.cursor = 'pointer' }}
      onPointerOut={() => { document.body.style.cursor = 'auto' }}
    >
      {/* Speech bubble — rotates through real status fragments */}
      {showLabel && (
        <Html
          position={[0, 2.35, 0]}
          center
          distanceFactor={8}
          zIndexRange={[10, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <SpeechBubble text={fragments[fragIdx % fragments.length]} activity={activity} />
        </Html>
      )}

      {/* The click mini-HUD renders screen-space in Scene's overlay layer —
          a drei <Html> mounted conditionally after initial mount fails to
          portal its children, and a fixed panel is more readable anyway. */}

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
            emissiveIntensity={0.9}
            roughness={0.4}
          />
        </mesh>

        {/* Head group — rotates for look-around */}
        <group ref={headRef} position={[0, 1.75, 0]}>
          <mesh castShadow>
            <sphereGeometry args={[0.28, 24, 24]} />
            <meshStandardMaterial color={COLORS.characterHead} roughness={0.6} metalness={0.1} />
          </mesh>
          {/* Visor — a curved sphere-segment hugging only the FRONT of the
              head (phi arc centered on +Z, a band at eye level). The old flat
              plane sat inside the skull and its wide edges poked out the sides
              as a green arc; a front-only segment reads as a visor from the
              front and vanishes edge-on from behind. Radius is just proud of
              the head so it never z-fights the skull. Emissive color/intensity
              are still driven by activity state via visorMatRef. */}
          <mesh>
            <sphereGeometry args={[0.29, 24, 16, Math.PI / 4, Math.PI / 2, 1.12, 0.52]} />
            <meshStandardMaterial
              ref={visorMatRef}
              color={COLORS.monitorScreen}
              emissive={COLORS.primary}
              emissiveIntensity={0.7}
              roughness={0.2}
              side={THREE.DoubleSide}
            />
          </mesh>
        </group>

        {/* Left arm — pivots from shoulder */}
        <group ref={leftArmRef} position={[-0.42, 1.35, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.5, 6, 12]} />
            <meshStandardMaterial color={COLORS.characterLimb} roughness={0.7} metalness={0.05} />
          </mesh>
          <mesh position={[0, -0.62, 0]} castShadow>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={COLORS.characterJoint} roughness={0.55} metalness={0.15} />
          </mesh>
        </group>

        {/* Right arm — pivots from shoulder */}
        <group ref={rightArmRef} position={[0.42, 1.35, 0]}>
          <mesh position={[0, -0.3, 0]} castShadow>
            <capsuleGeometry args={[0.09, 0.5, 6, 12]} />
            <meshStandardMaterial color={COLORS.characterLimb} roughness={0.7} metalness={0.05} />
          </mesh>
          <mesh position={[0, -0.62, 0]} castShadow>
            <sphereGeometry args={[0.1, 12, 12]} />
            <meshStandardMaterial color={COLORS.characterJoint} roughness={0.55} metalness={0.15} />
          </mesh>
        </group>

        {/* Left leg — visible when standing */}
        <group ref={leftLegRef} position={[-0.18, 0.65, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.55, 6, 12]} />
            <meshStandardMaterial color={COLORS.characterLimb} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>

        {/* Right leg — visible when standing */}
        <group ref={rightLegRef} position={[0.18, 0.65, 0]}>
          <mesh position={[0, -0.32, 0]} castShadow>
            <capsuleGeometry args={[0.12, 0.55, 6, 12]} />
            <meshStandardMaterial color={COLORS.characterLimb} roughness={0.7} metalness={0.05} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

// ── Speech Bubble ──────────────────────────────────────────────────

function SpeechBubble({ text, activity }: { text: string; activity: Activity }) {
  const colorClass =
    activity === 'error'
      ? 'text-warning'
      : activity === 'celebrating'
        ? 'text-primary'
        : activity === 'thinking'
          ? 'text-blue-300/80'
          : 'text-foreground/85'

  const borderColor = activity === 'error' ? 'rgba(255,154,61,0.55)' : 'rgba(58,158,96,0.4)'

  return (
    <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        key={text}
        style={{
          background: 'rgba(10,13,15,0.92)',
          border: `1px solid ${borderColor}`,
          borderRadius: '10px',
          padding: '4px 12px',
          fontFamily: 'monospace',
          fontSize: '12px',
          whiteSpace: 'nowrap',
          backdropFilter: 'blur(8px)',
          userSelect: 'none',
          animation: 'roomBubbleIn 0.35s ease',
        }}
        className={colorClass}
      >
        {text}
      </div>
      {/* Tail */}
      <div
        style={{
          width: 0,
          height: 0,
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: `6px solid ${borderColor}`,
          marginTop: '-1px',
        }}
      />
      <style>{`@keyframes roomBubbleIn { from { opacity: 0; transform: translateY(3px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  )
}

