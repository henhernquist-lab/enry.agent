import { useRef, useCallback, useEffect } from 'react'
import * as THREE from 'three'
import type { RoomStore } from './room-state'
import type { Activity, Station, RoomEventType } from './types'
import { ACTIVITY_CONFIG, EVENT_ACTIVITY_MAP, STATIONS } from './constants'
import type { WalkingControllerHandle } from './walking-controller'

// ───────────────────────────────────────────────────────────────────
// ActivityManager — drives character activities from events + timeline.
//
// The manager:
//   1. Receives room events (drive.editing, drive.testing, etc.)
//   2. Maps events to activities + stations
//   3. When an activity requires a different station, commands the
//      walking controller to walk there first, then transitions
//   4. Runs a background timeline that generates organic activity
//      changes when no real events are arriving (mocked events)
//   5. Never hardcodes animation logic — it only sets the activity
//      and station; the character component interprets the pose
//
// Future: real events from Drive/Cruise/Chat will replace the mocked
// timeline. The manager's interface won't change.
// ───────────────────────────────────────────────────────────────────

export interface ActivityManagerHandle {
  /** Dispatch a room event. */
  dispatch: (eventType: RoomEventType) => void
  /** Per-frame update — call from useFrame. */
  tick: (delta: number) => void
  /** Start the mocked event timeline. */
  startMockTimeline: () => void
  /** Stop the mocked event timeline. */
  stopMockTimeline: () => void
}

function randRange(min: number, max: number): number {
  return min + Math.random() * (max - min)
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** Mocked event sequence — simulates a day of Enry working. */
const MOCK_TIMELINE: RoomEventType[] = [
  'drive.editing',
  'drive.planning',
  'drive.editing',
  'drive.testing',
  'drive.idle',
  'chat.thinking',
  'chat.responding',
  'drive.editing',
  'cruise.scanning',
  'cruise.fixing',
  'drive.idle',
  'lab.evolving',
  'memory.storing',
  'drive.planning',
  'drive.editing',
  'drive.testing',
  'system.idle',
]

export function useActivityManager(
  store: RoomStore,
  walker: WalkingControllerHandle,
): ActivityManagerHandle {
  const mockTimerRef = useRef(0)
  const mockIndexRef = useRef(0)
  const mockActiveRef = useRef(false)
  const mockIntervalRef = useRef(8) // seconds between mock events
  const transitionCooldownRef = useRef(0)
  const pendingActivityRef = useRef<{ activity: Activity; stationId: string } | null>(null)

  // ── Event dispatch ──────────────────────────────────────────────
  const dispatch = useCallback((eventType: RoomEventType) => {
    store.dispatchEvent(eventType)

    const mapping = EVENT_ACTIVITY_MAP[eventType]
    if (!mapping) return

    const targetActivity = mapping.activity
    const targetStationId = mapping.station ?? null
    const currentStationId = store.character.stationId

    // Cooldown — don't transition too rapidly
    if (transitionCooldownRef.current > 0) return

    // If we're already doing this activity at this station, skip
    if (
      store.character.activity === targetActivity &&
      currentStationId === targetStationId
    ) return

    // If the target station is different, walk there first
    if (targetStationId && targetStationId !== currentStationId) {
      const station = STATIONS.find((s) => s.id === targetStationId)
      if (station) {
        pendingActivityRef.current = { activity: targetActivity, stationId: targetStationId }
        store.character.targetStationId = targetStationId
        store.character.pendingActivity = targetActivity
        walker.walkTo(station.standPosition, () => {
          // After arriving, set the activity
          if (pendingActivityRef.current) {
            const { activity, stationId } = pendingActivityRef.current
            store.setActivity(activity, stationId)
            pendingActivityRef.current = null
            transitionCooldownRef.current = 2
          }
        })
      }
    } else {
      // Same station — just switch activity
      store.setActivity(targetActivity, targetStationId ?? currentStationId)
      transitionCooldownRef.current = 2
    }
  }, [store, walker])

  // ── Per-frame tick ──────────────────────────────────────────────
  const tick = useCallback((delta: number) => {
    // Cooldown
    if (transitionCooldownRef.current > 0) {
      transitionCooldownRef.current -= delta
    }

    // Store tick (advances activity timer)
    store.tick(delta)

    // Mock timeline
    if (mockActiveRef.current) {
      mockTimerRef.current += delta
      if (mockTimerRef.current >= mockIntervalRef.current) {
        mockTimerRef.current = 0
        // Vary the interval slightly for organic feel
        mockIntervalRef.current = randRange(6, 14)
        const event = MOCK_TIMELINE[mockIndexRef.current % MOCK_TIMELINE.length]
        mockIndexRef.current++
        dispatch(event)
      }
    }
  }, [store, dispatch])

  // ── Mock timeline control ───────────────────────────────────────
  const startMockTimeline = useCallback(() => {
    mockActiveRef.current = true
    mockTimerRef.current = 0
    // Fire first event after a short delay
    mockIntervalRef.current = 3
  }, [])

  const stopMockTimeline = useCallback(() => {
    mockActiveRef.current = false
  }, [])

  // Auto-start mock timeline on mount
  useEffect(() => {
    startMockTimeline()
    return () => stopMockTimeline()
  }, [startMockTimeline, stopMockTimeline])

  return {
    dispatch,
    tick,
    startMockTimeline,
    stopMockTimeline,
  }
}

// ── Station helpers ────────────────────────────────────────────────

/** Find a station by ID. */
export function getStation(stationId: string): Station | undefined {
  return STATIONS.find((s) => s.id === stationId)
}

/** Pick a random station that supports a given activity. */
export function pickStationForActivity(activity: Activity): Station | null {
  const candidates = STATIONS.filter((s) => s.activities.includes(activity))
  if (candidates.length === 0) return null
  return pickRandom(candidates)
}

/** Pick a random different station to wander to. */
export function pickRandomStation(currentStationId: string): Station | null {
  const candidates = STATIONS.filter((s) => s.id !== currentStationId)
  if (candidates.length === 0) return null
  return pickRandom(candidates)
}

/** Get the stand position for a station. */
export function getStationStandPosition(stationId: string): THREE.Vector3 | null {
  const station = getStation(stationId)
  if (!station) return null
  return new THREE.Vector3(...station.standPosition)
}
