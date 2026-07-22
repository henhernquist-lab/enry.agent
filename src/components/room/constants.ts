import type { RoomDefinition, RoomRegistry, Position } from './types'

// ───────────────────────────────────────────────────────────────────
// The Room — constants
// ───────────────────────────────────────────────────────────────────

/** Enry's brand colors mapped to 3D-friendly hex values. */
export const COLORS = {
  // Surfaces — match the CSS token system (surface-base/secondary/elevated)
  floor: '#0d0d0d',
  wallBack: '#111111',
  wallLeft: '#0f0f0f',
  wallRight: '#0f0f0f',
  ceiling: '#0a0a0a',

  // Furniture — muted dark tones with slight warmth
  desk: '#1a1a1a',
  deskTop: '#222222',
  chair: '#1e1e1e',
  chairSeat: '#262626',

  // Accent — Enry green
  primary: '#3a9e60',
  primaryDim: '#2d7a4a',
  primaryGlow: '#00ff66',

  // Monitor — cool screen glow
  monitorScreen: '#0a1620',
  monitorGlow: '#1a3a5a',
  monitorFrame: '#161616',

  // Character — stylized dark figure
  characterBody: '#1e1e1e',
  characterHead: '#2a2a2a',
  characterAccent: '#3a9e60',

  // Lighting
  ambientColor: '#ffffff',
  directionalColor: '#fff8e7',
  accentLightColor: '#3a9e60',
  monitorLightColor: '#4a9eff',
} as const

/** Room dimensions in world units. */
export const ROOM_DIMS = {
  width: 12,
  depth: 10,
  height: 5,
  wallThickness: 0.2,
} as const

/** Camera defaults — third-person isometric. */
export const CAMERA_DEFAULTS = {
  position: [10, 8, 10] as Position,
  target: [0, 1.5, 0] as Position,
  minDistance: 4,
  maxDistance: 25,
  maxPolarAngle: Math.PI / 2.1,
  minPolarAngle: Math.PI / 6,
} as const

/** The office room — the first and currently only room. */
export const OFFICE_ROOM: RoomDefinition = {
  id: 'office',
  name: 'Enry Headquarters',
  description: 'The main office where Enry works',
  cameraInitial: CAMERA_DEFAULTS.position,
  cameraTarget: CAMERA_DEFAULTS.target,
  focusTargets: [
    {
      id: 'main-desk',
      label: 'Main Desk',
      position: [0, 1.2, -1],
      distance: 5,
    },
    {
      id: 'monitor',
      label: 'Monitor',
      position: [0, 1.5, -2],
      distance: 3,
    },
  ],
  characterSpawn: [0, 0, -0.5],
  ambientIntensity: 0.35,
  accentColor: COLORS.primary,
}

/** Room registry — today just the office. Future: Drive, Cruise, Chat, etc. */
export const ROOMS: RoomRegistry = {
  office: OFFICE_ROOM,
}

/** Idle behavior timing (seconds for each state before cycling). */
export const IDLE_TIMING = {
  typing: { min: 4, max: 8 },
  looking: { min: 2, max: 4 },
  sitting: { min: 6, max: 12 },
  standing: { min: 3, max: 6 },
} as const

/** Animation parameters. */
export const ANIM = {
  breathingAmplitude: 0.02,
  breathingSpeed: 0.8,
  typingSpeed: 6,
  lookAroundSpeed: 0.5,
  lookAroundAmplitude: 0.15,
  monitorPulseSpeed: 1.2,
  monitorPulseAmplitude: 0.15,
} as const
