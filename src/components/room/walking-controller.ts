import { useRef, useCallback } from 'react'
import * as THREE from 'three'
import { WALKING } from './constants'
import type { Position, WalkDestination } from './types'

// ───────────────────────────────────────────────────────────────────
// WalkingController — reusable movement system for characters.
//
// Any character can use this controller to walk to destinations with:
//   - Smooth position interpolation (lerp)
//   - Rotation toward the destination (smooth turn)
//   - Configurable walking speed
//   - Queue of future destinations
//   - Idle state after arrival
//   - Arrival callback
//
// The controller is purely imperative — it reads/writes refs in
// useFrame and never triggers React re-renders. The parent character
// component passes its group ref and calls tick() each frame.
// ───────────────────────────────────────────────────────────────────

export interface WalkingControllerHandle {
  /** Walk to a destination. Returns true if accepted (not already walking). */
  walkTo: (destination: Position, onComplete?: () => void) => boolean
  /** Walk to a destination and queue more after. */
  walkQueue: (destinations: WalkDestination[]) => void
  /** Stop walking immediately. */
  stop: () => void
  /** Per-frame update — call from useFrame. Returns true if currently walking. */
  tick: (delta: number, group: THREE.Group) => boolean
  /** Is the character currently walking? */
  isWalking: () => boolean
  /** Current destination, if walking. */
  getDestination: () => Position | null
}

interface WalkState {
  active: boolean
  destination: THREE.Vector3 | null
  queue: WalkDestination[]
  onComplete: (() => void) | null
}

function createInitialWalkState(): WalkState {
  return {
    active: false,
    destination: null,
    queue: [],
    onComplete: null,
  }
}

/**
 * useWalkingController — creates a reusable walking controller.
 * Returns a handle with imperative methods for movement.
 */
export function useWalkingController(): WalkingControllerHandle {
  const stateRef = useRef<WalkState>(createInitialWalkState())

  const walkTo = useCallback((destination: Position, onComplete?: () => void): boolean => {
    const s = stateRef.current
    if (s.active) return false
    s.active = true
    s.destination = new THREE.Vector3(...destination)
    s.onComplete = onComplete ?? null
    s.queue = []
    return true
  }, [])

  const walkQueue = useCallback((destinations: WalkDestination[]) => {
    const s = stateRef.current
    if (destinations.length === 0) return
    if (!s.active) {
      const first = destinations[0]
      s.active = true
      s.destination = new THREE.Vector3(...first.position)
      s.onComplete = first.onComplete ?? null
      s.queue = destinations.slice(1)
    } else {
      s.queue.push(...destinations)
    }
  }, [])

  const stop = useCallback(() => {
    const s = stateRef.current
    s.active = false
    s.destination = null
    s.queue = []
    s.onComplete = null
  }, [])

  const isWalking = useCallback(() => stateRef.current.active, [])

  const getDestination = useCallback((): Position | null => {
    const s = stateRef.current
    if (!s.destination) return null
    return [s.destination.x, s.destination.y, s.destination.z]
  }, [])

  const tick = useCallback((delta: number, group: THREE.Group): boolean => {
    const s = stateRef.current
    if (!s.active || !s.destination) return false

    const currentPos = group.position
    const dest = s.destination

    // Move toward destination
    const distance = currentPos.distanceTo(dest)
    if (distance < WALKING.arrivalThreshold) {
      // Arrived
      group.position.copy(dest)
      s.active = false
      s.destination = null
      const callback = s.onComplete
      s.onComplete = null

      // Process queue
      if (s.queue.length > 0) {
        const next = s.queue.shift()!
        s.active = true
        s.destination = new THREE.Vector3(...next.position)
        s.onComplete = next.onComplete ?? null
      }

      if (callback) callback()
      return false
    }

    // Direction toward destination
    const direction = new THREE.Vector3()
    direction.subVectors(dest, currentPos)
    direction.normalize()

    // Move at walking speed (delta-adjusted)
    const moveDistance = Math.min(WALKING.speed * delta, distance)
    currentPos.addScaledVector(direction, moveDistance)

    // Rotate to face destination (smooth)
    const targetAngle = Math.atan2(direction.x, direction.z)
    const currentAngle = group.rotation.y
    // Shortest path angle interpolation
    let angleDiff = targetAngle - currentAngle
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2
    group.rotation.y += angleDiff * WALKING.rotationLerp

    return true
  }, [])

  return {
    walkTo,
    walkQueue,
    stop,
    tick,
    isWalking,
    getDestination,
  }
}

/**
 * getWalkingAnimation — returns animation parameters for a walking character.
 * Used by character.tsx to animate legs/arms/body while walking.
 */
export function getWalkingAnimation(time: number): {
  leftLegRotation: number
  rightLegRotation: number
  leftArmRotation: number
  rightArmRotation: number
  bodyBob: number
} {
  const swing = Math.sin(time * WALKING.legSwingSpeed)
  return {
    leftLegRotation: swing * WALKING.legSwingAmplitude,
    rightLegRotation: -swing * WALKING.legSwingAmplitude,
    leftArmRotation: -swing * WALKING.armSwingAmplitude,
    rightArmRotation: swing * WALKING.armSwingAmplitude,
    bodyBob: Math.abs(Math.sin(time * WALKING.bodyBobSpeed)) * WALKING.bodyBobAmplitude,
  }
}
