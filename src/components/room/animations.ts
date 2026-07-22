import { useRef, useCallback } from 'react'
import * as THREE from 'three'
import { IDLE_TIMING, ANIM } from './constants'
import type { IdleState } from './types'

// ───────────────────────────────────────────────────────────────────
// Animations — pure utility functions for character idle behaviors.
//
// The useIdleBehavior hook below manages the state machine that cycles
// the character through typing / looking / sitting / standing. Each
// state has a duration range (from IDLE_TIMING in constants.ts). When
// the timer expires, a new state is randomly selected.
//
// The actual per-frame animation is applied in character.tsx via
// useFrame, reading the current state from this hook's ref.
// ───────────────────────────────────────────────────────────────────

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function pickNextState(current: IdleState): IdleState {
  const states: IdleState[] = ['typing', 'looking', 'sitting', 'standing']
  // Don't repeat the same state twice in a row
  const candidates = states.filter((s) => s !== current)
  return candidates[Math.floor(Math.random() * candidates.length)]
}

export interface IdleBehaviorState {
  state: IdleState
  elapsed: number
  duration: number
}

/**
 * State machine hook for idle character behaviors.
 * Returns a ref that character.tsx reads each frame + a tick function
 * to call from useFrame.
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

/** Breathing — subtle vertical oscillation of the torso. */
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

/** Smooth lerp utility for camera transitions. */
export function lerpVector3(
  current: THREE.Vector3,
  target: THREE.Vector3,
  factor: number,
): THREE.Vector3 {
  current.lerp(target, factor)
  return current
}
