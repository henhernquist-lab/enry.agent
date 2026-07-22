import { useRef, useCallback } from 'react'
import * as THREE from 'three'
import { IDLE_TIMING, ANIM } from './constants'
import type { IdleState, Activity } from './types'

// Re-export for backward compat — animations.ts used to own this type
export type { IdleState }

// ───────────────────────────────────────────────────────────────────
// Animations — pure utility functions for character behaviors.
//
// These functions compute pose parameters for each activity.
// The character component calls them each frame in useFrame,
// passing the current activity + elapsed time. No animation logic
// lives in the character component itself — it just applies the
// numbers these functions return.
//
// This separation means new activities can be added by adding a
// function here and a case in the character's switch — nothing else
// changes.
// ───────────────────────────────────────────────────────────────────

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function pickNextState(current: IdleState): IdleState {
  const states: IdleState[] = ['typing', 'looking', 'sitting', 'standing']
  const candidates = states.filter((s) => s !== current)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

export interface IdleBehaviorState {
  state: IdleState
  elapsed: number
  duration: number
}

/**
 * Legacy idle state machine — kept for backward compatibility.
 * The new activity system uses useActivityManager instead.
 */
export function useIdleBehavior() {
  const stateRef = useRef<IdleBehaviorState>({
    state: 'typing',
    elapsed: 0,
    duration: randomRange(IDLE_TIMING.typing.min, IDLE_TIMING.typing.max),
  })

  const tick = useCallback((delta: number) => {
    const s = stateRef.current
    s.elapsed += delta
    if (s.elapsed >= s.duration) {
      const next = pickNextState(s.state)
      const timing = IDLE_TIMING[next]
      stateRef.current = {
        state: next,
        elapsed: 0,
        duration: randomRange(timing.min, timing.max),
      }
    }
    return stateRef.current.state
  }, [])

  return { stateRef, tick }
}

// ── Base animation helpers ─────────────────────────────────────────

/** Breathing — subtle vertical oscillation of the torso. Always active. */
export function getBreathingOffset(time: number): number {
  return Math.sin(time * ANIM.breathingSpeed) * ANIM.breathingAmplitude
}

/** Typing — oscillation for the arms/hands when typing. */
export function getTypingOffset(time: number): number {
  return Math.sin(time * ANIM.typingSpeed) * 0.015
}

/** Looking around — rotation offset for the head. */
export function getLookOffset(time: number): number {
  return Math.sin(time * ANIM.lookAroundSpeed) * ANIM.lookAroundAmplitude
}

// ── Activity-specific pose helpers ─────────────────────────────────

/**
 * ActivityPose — the full set of pose parameters for a character.
 * The character component lerps its current pose toward the target
 * pose each frame for smooth transitions.
 */
export interface ActivityPose {
  /** Head rotation Y (left-right look). */
  headY: number
  /** Head rotation X (up-down tilt). */
  headX: number
  /** Left arm rotation X. */
  leftArmX: number
  /** Right arm rotation X. */
  rightArmX: number
  /** Left arm rotation Z (out to side). */
  leftArmZ: number
  /** Right arm rotation Z. */
  rightArmZ: number
  /** Body Y offset (sitting lowers, celebrating bounces). */
  bodyY: number
  /** Whether legs are visible (false when sitting). */
  legsVisible: boolean
  /** Left leg rotation X (for walking swing). */
  leftLegX: number
  /** Right leg rotation X. */
  rightLegX: number
  /** Body lean X (forward/back). */
  bodyLeanX: number
}

/** The resting/neutral pose — all values at default. */
export const NEUTRAL_POSE: ActivityPose = {
  headY: 0,
  headX: 0,
  leftArmX: 0.05,
  rightArmX: 0.05,
  leftArmZ: 0,
  rightArmZ: 0,
  bodyY: -0.15, // sitting by default
  legsVisible: false,
  leftLegX: 0,
  rightLegX: 0,
  bodyLeanX: 0,
}

/**
 * Compute the target pose for a given activity at a given time.
 * Returns a ActivityPose that the character will lerp toward.
 */
export function getActivityPose(activity: Activity, time: number): ActivityPose {
  switch (activity) {
    case 'typing': {
      const t = getTypingOffset(time)
      return {
        ...NEUTRAL_POSE,
        headY: Math.sin(time * 0.3) * 0.05,
        headX: 0.05,
        leftArmX: -0.6 + t,
        rightArmX: -0.6 - t,
        leftArmZ: 0.1,
        rightArmZ: -0.1,
        bodyY: -0.15,
        legsVisible: false,
        bodyLeanX: 0.02,
      }
    }

    case 'thinking': {
      // Standing, one hand on chin, head tilted up slightly
      const sway = Math.sin(time * ANIM.thinkingPaceSpeed) * 0.05
      return {
        ...NEUTRAL_POSE,
        headY: sway,
        headX: -ANIM.thinkingHeadTilt,
        leftArmX: -0.3,
        rightArmX: -1.2,
        rightArmZ: 0.2,
        leftArmZ: 0.05,
        bodyY: 0,
        legsVisible: true,
        bodyLeanX: -0.02,
      }
    }

    case 'inspecting': {
      // Standing, leaning toward the monitor, arms slightly forward
      return {
        ...NEUTRAL_POSE,
        headY: 0,
        headX: ANIM.inspectingLean,
        leftArmX: -0.4,
        rightArmX: -0.4,
        leftArmZ: 0.15,
        rightArmZ: -0.15,
        bodyY: 0,
        legsVisible: true,
        bodyLeanX: ANIM.inspectingLean,
      }
    }

    case 'waiting': {
      // Sitting, arms relaxed, occasional head turn
      const look = Math.sin(time * 0.4) * 0.1
      return {
        ...NEUTRAL_POSE,
        headY: look,
        headX: 0,
        leftArmX: 0.1,
        rightArmX: 0.1,
        leftArmZ: 0.08,
        rightArmZ: -0.08,
        bodyY: -0.15,
        legsVisible: false,
        bodyLeanX: 0,
      }
    }

    case 'celebrating': {
      // Standing, arms raised, subtle bounce
      const bounce = Math.sin(time * ANIM.celebratingBounceSpeed) * ANIM.celebratingBounceAmplitude
      return {
        ...NEUTRAL_POSE,
        headY: 0,
        headX: -0.05,
        leftArmX: -1.8,
        rightArmX: -1.8,
        leftArmZ: 0.5,
        rightArmZ: -0.5,
        bodyY: bounce,
        legsVisible: true,
        bodyLeanX: 0,
      }
    }

    case 'lookingAround': {
      // Standing, head turning side to side
      const look = getLookOffset(time) * 2
      return {
        ...NEUTRAL_POSE,
        headY: look,
        headX: Math.sin(time * 0.3) * 0.05,
        leftArmX: 0.05,
        rightArmX: 0.05,
        leftArmZ: 0,
        rightArmZ: 0,
        bodyY: 0,
        legsVisible: true,
        bodyLeanX: 0,
      }
    }

    case 'idle': {
      // Sitting at desk, relaxed, subtle breathing + occasional head turn
      const look = Math.sin(time * 0.15) * 0.06
      return {
        ...NEUTRAL_POSE,
        headY: look,
        headX: 0,
        leftArmX: 0.1,
        rightArmX: 0.1,
        leftArmZ: 0.05,
        rightArmZ: -0.05,
        bodyY: -0.15,
        legsVisible: false,
        bodyLeanX: 0,
      }
    }

    case 'walking': {
      // Pose is handled by walking-controller's getWalkingAnimation
      // This return is a fallback that shouldn't normally be used
      return {
        ...NEUTRAL_POSE,
        bodyY: 0,
        legsVisible: true,
        leftArmX: 0.1,
        rightArmX: 0.1,
      }
    }

    default:
      return NEUTRAL_POSE
  }
}

/**
 * Lerp a pose toward a target pose. Used each frame for smooth transitions.
 */
export function lerpPose(current: ActivityPose, target: ActivityPose, factor: number): ActivityPose {
  const lerp = (a: number, b: number) => a + (b - a) * factor
  return {
    headY: lerp(current.headY, target.headY),
    headX: lerp(current.headX, target.headX),
    leftArmX: lerp(current.leftArmX, target.leftArmX),
    rightArmX: lerp(current.rightArmX, target.rightArmX),
    leftArmZ: lerp(current.leftArmZ, target.leftArmZ),
    rightArmZ: lerp(current.rightArmZ, target.rightArmZ),
    bodyY: lerp(current.bodyY, target.bodyY),
    legsVisible: target.legsVisible, // boolean — snap, don't lerp
    leftLegX: lerp(current.leftLegX, target.leftLegX),
    rightLegX: lerp(current.rightLegX, target.rightLegX),
    bodyLeanX: lerp(current.bodyLeanX, target.bodyLeanX),
  }
}

/** Smooth lerp utility for camera transitions. */
export function lerpVector3(
  current: THREE.Vector3,
  target: THREE.Vector3,
  factor: number,
): THREE.Vector3 {
  current.lerp(target, factor)
  return current
}
