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

/** Idle behavior states the character cycles through. */
export type IdleState = 'typing' | 'looking' | 'sitting' | 'standing'

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
}

/** Registry of all available rooms. Future: add entries here. */
export type RoomRegistry = Record<string, RoomDefinition>
