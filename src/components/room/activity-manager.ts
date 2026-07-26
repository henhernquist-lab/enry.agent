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
  /** Start polling /api/activity/recent and reflecting real state. */
  startAmbientSync: () => void
  /** Stop ambient polling — used when a "See Enry" entry (?from=) takes over. */
  stopAmbientSync: () => void
}

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

/** How often ambient (unattended) view polls for real activity, in seconds. */
const AMBIENT_POLL_INTERVAL = 20

/**
 * Maps the shared /api/activity/recent response (same source as the
 * homepage Live Activity widget and the worker HUD) to a room event.
 * usage_log has no mode-specific "learn" event in RoomEventType, so
 * 'learn' maps to lab.evolving — both read as "thinking/studying at the
 * whiteboard," the closest real fit rather than inventing a new state.
 */
function mapActivityToEvent(mode: string | null, isActive: boolean): RoomEventType {
  if (!isActive || !mode) return 'system.idle'
  switch (mode) {
    case 'drive': return 'drive.editing'
    case 'cruise': return 'cruise.scanning'
    case 'chat': return 'chat.responding'
    case 'learn': return 'lab.evolving'
    case 'lab': return 'lab.evolving'
    default: return 'system.idle'
  }
}

export function useActivityManager(
  store: RoomStore,
  walker: WalkingControllerHandle,
): ActivityManagerHandle {
  const ambientTimerRef = useRef(0)
  const ambientActiveRef = useRef(false)
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

  // ── Ambient sync — polls real activity, dispatches the mapped event ──
  const syncRealActivity = useCallback(() => {
    fetch('/api/activity/recent')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { mode: string | null; isActive: boolean; error?: { source: string } | null } | null) => {
        if (!data) return
        // A real recent failure wins over normal activity — flip to the error
        // state (amber/red visor + stuck pose). The endpoint already clears
        // this once a later success arrives, so it can't stick forever.
        if (data.error) {
          dispatch('cruise.error')
          return
        }
        dispatch(mapActivityToEvent(data.mode, data.isActive))
      })
      .catch(() => { /* request failed — stay in current state, never fall back to fake data */ })
  }, [dispatch])

  // ── Per-frame tick ──────────────────────────────────────────────
  const tick = useCallback((delta: number) => {
    // Cooldown
    if (transitionCooldownRef.current > 0) {
      transitionCooldownRef.current -= delta
    }

    // Store tick (advances activity timer)
    store.tick(delta)

    if (ambientActiveRef.current) {
      ambientTimerRef.current += delta
      if (ambientTimerRef.current >= AMBIENT_POLL_INTERVAL) {
        ambientTimerRef.current = 0
        syncRealActivity()
      }
    }
  }, [store, syncRealActivity])

  // ── Ambient sync control ──────────────────────────────────────────
  const startAmbientSync = useCallback(() => {
    ambientActiveRef.current = true
    ambientTimerRef.current = AMBIENT_POLL_INTERVAL // poll immediately on first tick instead of waiting a full interval
  }, [])

  const stopAmbientSync = useCallback(() => {
    ambientActiveRef.current = false
  }, [])

  // Auto-start ambient sync on mount — direct /room visits with no ?from=
  // entry context reflect real recent activity (or a genuine idle state)
  // instead of a scripted "day of Enry working."
  useEffect(() => {
    startAmbientSync()
    return () => stopAmbientSync()
  }, [startAmbientSync, stopAmbientSync])

  return {
    dispatch,
    tick,
    startAmbientSync,
    stopAmbientSync,
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
