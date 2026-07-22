import { useRef, useCallback, useSyncExternalStore } from 'react'
import type { CharacterState, Activity, RoomEventType, Position } from './types'
import { ACTIVITY_CONFIG } from './constants'

// ───────────────────────────────────────────────────────────────────
// RoomState — central state store for The Room.
//
// This is a lightweight store that lives outside React's render cycle.
// Animation logic reads/writes via refs in useFrame — no re-renders.
// The only React-visible state is the "currentActivity" string, which
// the status label subscribes to via useSyncExternalStore.
//
// Future: this same store will hold multi-character state, room switches,
// and live event feeds without architectural changes.
// ───────────────────────────────────────────────────────────────────

export interface RoomStore {
  character: CharacterState
  /** Subscribe to activity changes for UI (status label). */
  subscribe: (callback: () => void) => () => void
  /** Get current activity for UI consumers. */
  getActivity: () => Activity
  /** Dispatch a room event that may change the activity. */
  dispatchEvent: (eventType: RoomEventType) => void
  /** Force an activity change (used by activity manager timeline). */
  setActivity: (activity: Activity, stationId?: string | null) => void
  /** Update character position (called from walking controller). */
  updatePosition: (pos: Position) => void
  /** Begin a walk to a destination. */
  startWalk: (destination: Position, onComplete?: () => void) => void
  /** Mark walk as complete. */
  finishWalk: () => void
  /** Tick the store — called every frame. */
  tick: (delta: number) => void
}

function createInitialCharacterState(): CharacterState {
  return {
    activity: 'idle',
    previousActivity: 'idle',
    stationId: 'desk',
    targetStationId: null,
    isWalking: false,
    walkDestination: null,
    pendingActivity: null,
    activityElapsed: 0,
    activityDuration: 6,
    transitionProgress: 1,
    lastEvent: null,
  }
}

/** Random in range. */
function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

/**
 * useRoomState — the hook that creates and returns a RoomStore.
 * The store lives in a ref, so it persists across re-renders without
 * triggering them. Only activity-change notifications go to React.
 */
export function useRoomState(): RoomStore {
  const characterRef = useRef<CharacterState>(createInitialCharacterState())
  const listenersRef = useRef<Set<() => void>>(new Set())
  const activityVersionRef = useRef(0)
  const walkCompleteRef = useRef<(() => void) | null>(null)
  const arrivalPauseRef = useRef(0)

  const notify = useCallback(() => {
    activityVersionRef.current++
    listenersRef.current.forEach((cb) => cb())
  }, [])

  const subscribe = useCallback((callback: () => void) => {
    listenersRef.current.add(callback)
    return () => { listenersRef.current.delete(callback) }
  }, [])

  const getActivity = useCallback(() => characterRef.current.activity, [])

  const setActivity = useCallback((activity: Activity, stationId?: string | null) => {
    const s = characterRef.current
    if (s.activity === activity && s.stationId === stationId) return
    s.previousActivity = s.activity
    s.activity = activity
    s.activityElapsed = 0
    const cfg = ACTIVITY_CONFIG[activity]
    s.activityDuration = randRange(cfg.duration.min, cfg.duration.max)
    s.transitionProgress = 0
    if (stationId !== undefined) {
      s.stationId = stationId
      s.targetStationId = null
    }
    notify()
  }, [notify])

  const dispatchEvent = useCallback((eventType: RoomEventType) => {
    const s = characterRef.current
    s.lastEvent = eventType
    // The activity manager will pick this up on next tick
  }, [])

  const updatePosition = useCallback((pos: Position) => {
    // Position is tracked by the character's group ref directly,
    // not stored here — this is a no-op hook for future expansion.
    void pos
  }, [])

  const startWalk = useCallback((destination: Position, onComplete?: () => void) => {
    const s = characterRef.current
    s.isWalking = true
    s.walkDestination = destination
    s.previousActivity = s.activity
    s.activity = 'walking'
    walkCompleteRef.current = onComplete ?? null
    notify()
  }, [notify])

  const finishWalk = useCallback(() => {
    const s = characterRef.current
    s.isWalking = false
    s.walkDestination = null
    arrivalPauseRef.current = 0.5 // brief pause after arriving
    const onComplete = walkCompleteRef.current
    walkCompleteRef.current = null
    if (onComplete) onComplete()
  }, [])

  const tick = useCallback((delta: number) => {
    const s = characterRef.current

    // Handle arrival pause
    if (arrivalPauseRef.current > 0) {
      arrivalPauseRef.current -= delta
      return
    }

    // Advance transition progress
    if (s.transitionProgress < 1) {
      s.transitionProgress = Math.min(1, s.transitionProgress + delta * 3)
    }

    // Don't advance the activity timer while walking
    if (s.isWalking || s.activity === 'walking') return

    s.activityElapsed += delta
    if (s.activityElapsed >= s.activityDuration) {
      // The activity manager's tick will handle the transition
      // We just mark that the activity is expired
    }
  }, [])

  return {
    character: characterRef.current,
    subscribe,
    getActivity,
    dispatchEvent,
    setActivity,
    updatePosition,
    startWalk,
    finishWalk,
    tick,
  }
}

/**
 * useActivitySnapshot — subscribes to the store and returns the current
 * activity label. Only this triggers React re-renders (for the status label).
 */
export function useActivitySnapshot(store: RoomStore): { activity: Activity; label: string } {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    () => ACTIVITY_CONFIG[store.getActivity()].label,
    () => ACTIVITY_CONFIG[store.getActivity()].label,
  )
  const activity = store.getActivity()
  return { activity, label: snapshot }
}
