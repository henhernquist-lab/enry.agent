import type { Vector3Tuple } from 'three'

// ───────────────────────────────────────────────────────────────────
// The Room — shared types
//
// These types establish the contract for future room pluggability.
// Today only one room exists (the office), but every component
// already consumes these types so adding a new room is purely
// additive: implement RoomDefinition, register it, done.
// ───────────────────────────────────────────────────────────────────

/** A 3D position as [x, y, z]. */
export type Position = Vector3Tuple

/** A 3D rotation as [x, y, z] in radians. */
export type Rotation = Vector3Tuple

/** A 3D scale as [x, y, z]. */
export type Scale = Vector3Tuple

/** Legacy idle states — kept for backward compatibility with useIdleBehavior. */
export type IdleState = 'typing' | 'looking' | 'sitting' | 'standing'

// ── Activity System ────────────────────────────────────────────────

/** Activities the character can perform. Each changes the character's pose. */
export type Activity =
  | 'idle'
  | 'typing'
  | 'thinking'
  | 'walking'
  | 'inspecting'
  | 'waiting'
  | 'celebrating'
  | 'lookingAround'

/** Configuration for each activity: duration range, label, station, posture. */
export interface ActivityConfig {
  /** How long the activity lasts before transitioning (seconds). */
  duration: { min: number; max: number }
  /** Floating label text shown above the character. */
  label: string
  /** Which station this activity takes place at (null = no movement). */
  station?: string
  /** Whether the character stands during this activity. */
  standing: boolean
}

// ── Station System ─────────────────────────────────────────────────

/** An interaction point in the room the character can walk to and work at. */
export interface Station {
  id: string
  label: string
  /** World position of the station itself (furniture). */
  position: Position
  /** Y rotation the character faces when at this station. */
  rotationY?: number
  /** Activities that can be performed at this station. */
  activities: Activity[]
  /** Where the character stands when working at this station. */
  standPosition: Position
}

// ── Event System ───────────────────────────────────────────────────

/** Real or mocked application events that drive activity changes. */
export type RoomEventType =
  | 'drive.editing'
  | 'drive.planning'
  | 'drive.testing'
  | 'drive.idle'
  | 'chat.responding'
  | 'chat.thinking'
  | 'cruise.scanning'
  | 'cruise.fixing'
  | 'lab.evolving'
  | 'memory.storing'
  | 'system.idle'

export interface RoomEvent {
  type: RoomEventType
  timestamp: number
}

// ── Walking System ─────────────────────────────────────────────────

/** A destination the character walks to. */
export interface WalkDestination {
  position: Position
  onComplete?: () => void
}

// ── Character State ────────────────────────────────────────────────

/** Full state of a character at any point in time. */
export interface CharacterState {
  activity: Activity
  previousActivity: Activity
  stationId: string | null
  targetStationId: string | null
  isWalking: boolean
  walkDestination: Position | null
  pendingActivity: Activity | null
  activityElapsed: number
  activityDuration: number
  /** 0→1 blend factor for smooth animation transitions. */
  transitionProgress: number
  lastEvent: RoomEventType | null
}

// ── Camera ─────────────────────────────────────────────────────────

/** A camera focus target — clicking a desk moves the camera here. */
export interface FocusTarget {
  id: string
  label: string
  position: Position
  /** Camera distance from the target. */
  distance: number
}

/** A piece of furniture or interactive object in the room. */
export interface RoomObject {
  id: string
  label: string
  position: Position
  rotation?: Rotation
  scale?: Scale
}

// ── Room Definition ────────────────────────────────────────────────

/**
 * RoomDefinition — the contract every room implements.
 * Future rooms (Drive, Cruise, Chat, Memory, Learn, Lab) will each
 * provide their own definition and component. The registry in
 * constants.ts maps room IDs to their definitions.
 */
export interface RoomDefinition {
  id: string
  name: string
  description: string
  /** Initial camera position (isometric). */
  cameraInitial: Position
  /** Initial camera target (look-at point). */
  cameraTarget: Position
  /** Interactive focus targets in the room (desks, workstations). */
  focusTargets: FocusTarget[]
  /** Character spawn position. */
  characterSpawn: Position
  /** Ambient light intensity for the room. */
  ambientIntensity: number
  /** Accent color for the room (Enry green by default). */
  accentColor: string
  /** Stations available in this room. */
  stations: Station[]
}

/** Registry of all available rooms. Future: add entries here. */
export type RoomRegistry = Record<string, RoomDefinition>
