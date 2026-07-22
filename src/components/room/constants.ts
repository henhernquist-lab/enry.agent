import type { RoomDefinition, RoomRegistry, Position, Activity, ActivityConfig, Station, RoomEventType } from './types'

// ───────────────────────────────────────────────────────────────────
// The Room — constants
// ───────────────────────────────────────────────────────────────────

/** Enry's brand colors mapped to 3D-friendly hex values.
 *
 * Albedos are deliberately lifted well above the CSS token values —
 * meshStandardMaterial only reflects what its color allows, so
 * near-black (#0d–#26) surfaces stay invisible no matter how strong
 * the lights are. Dark graphite with a green-cool undertone reads as
 * "dark premium" once lit; the raw token hexes read as a void.
 */
export const COLORS = {
  // Surfaces — dark graphite, subtle green-cool undertone
  floor: '#242a27',
  wallBack: '#2a3033',
  wallLeft: '#262c2f',
  wallRight: '#262c2f',
  ceiling: '#1c2124',

  // Furniture — mid graphite so the desk reads as an object, not a shadow
  desk: '#31373b',
  deskTop: '#3e454a',
  chair: '#2e3438',
  chairSeat: '#3a4145',

  // Accent — Enry green
  primary: '#3a9e60',
  primaryDim: '#2d7a4a',
  primaryGlow: '#00ff66',

  // Monitor — cool screen glow
  monitorScreen: '#0d2233',
  monitorGlow: '#3a7ab8',
  monitorFrame: '#282d31',

  // Character — light warm gray so it's the brightest object in frame
  characterBody: '#4a5258',
  characterHead: '#5c646a',
  characterAccent: '#3a9e60',

  // Lighting
  ambientColor: '#dfe8ee',
  directionalColor: '#fff4e0',
  accentLightColor: '#3a9e60',
  monitorLightColor: '#4a9eff',
  lampLightColor: '#ffc97a',

  // New furniture
  whiteboard: '#2c3236',
  whiteboardSurface: '#d9dde0',
  coffeeMachine: '#2e3337',
  coffeeMachineTop: '#3b4145',
  window: '#10263c',
  windowFrame: '#2a2f33',
  keyboardLed: '#3a9e60',
  deskLamp: '#2e3337',
  deskLampHead: '#3b4145',
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
  /** Lerp factor for smooth camera transitions. */
  focusLerp: 0.05,
  /** Lerp factor for reset transitions. */
  resetLerp: 0.06,
  /** Idle camera sway amplitude (world units). */
  swayAmplitude: 0.15,
  /** Idle camera sway speed. */
  swaySpeed: 0.3,
  /** Follow lerp factor when tracking a character. */
  followLerp: 0.03,
} as const

// ── Activity System ────────────────────────────────────────────────

/** Configuration for each activity. */
export const ACTIVITY_CONFIG: Record<Activity, ActivityConfig> = {
  idle: {
    duration: { min: 5, max: 10 },
    label: 'Idle',
    standing: false,
  },
  typing: {
    duration: { min: 8, max: 16 },
    label: 'Editing…',
    station: 'desk',
    standing: false,
  },
  thinking: {
    duration: { min: 4, max: 8 },
    label: 'Thinking…',
    station: 'whiteboard',
    standing: true,
  },
  walking: {
    duration: { min: 2, max: 5 },
    label: '',
    standing: true,
  },
  inspecting: {
    duration: { min: 3, max: 6 },
    label: 'Inspecting…',
    station: 'monitor',
    standing: true,
  },
  waiting: {
    duration: { min: 4, max: 8 },
    label: 'Waiting…',
    standing: false,
  },
  celebrating: {
    duration: { min: 2, max: 4 },
    label: 'Done!',
    standing: true,
  },
  lookingAround: {
    duration: { min: 2, max: 5 },
    label: '',
    standing: true,
  },
}

/** Maps room events to activities. */
export const EVENT_ACTIVITY_MAP: Record<string, { activity: Activity; station?: string }> = {
  'drive.editing': { activity: 'typing', station: 'desk' },
  'drive.planning': { activity: 'thinking', station: 'whiteboard' },
  'drive.testing': { activity: 'inspecting', station: 'monitor' },
  'drive.idle': { activity: 'idle', station: 'desk' },
  'chat.responding': { activity: 'typing', station: 'desk' },
  'chat.thinking': { activity: 'thinking', station: 'desk' },
  'cruise.scanning': { activity: 'inspecting', station: 'monitor' },
  'cruise.fixing': { activity: 'typing', station: 'desk' },
  'lab.evolving': { activity: 'thinking', station: 'whiteboard' },
  'memory.storing': { activity: 'celebrating', station: 'desk' },
  'system.idle': { activity: 'idle', station: 'desk' },
}

/**
 * Maps an opening surface ("See Enry" entry points) to the event dispatched
 * on arrival — working if the surface had an active run, idle otherwise.
 * Keys match the `from` query param on /room.
 */
export const SURFACE_ENTRY_EVENTS: Record<string, { working: RoomEventType; idle: RoomEventType }> = {
  drive: { working: 'drive.editing', idle: 'drive.idle' },
  cruise: { working: 'cruise.scanning', idle: 'system.idle' },
  learn: { working: 'lab.evolving', idle: 'system.idle' },
  chat: { working: 'chat.responding', idle: 'system.idle' },
}

/** Idle behavior timing (seconds for each state before cycling). */
export const IDLE_TIMING = {
  typing: { min: 4, max: 8 },
  looking: { min: 2, max: 4 },
  sitting: { min: 6, max: 12 },
  standing: { min: 3, max: 6 },
} as const

// ── Walking System ─────────────────────────────────────────────────

export const WALKING = {
  /** Character movement speed in world units per second. */
  speed: 1.2,
  /** Rotation lerp factor — how fast the character turns to face destination. */
  rotationLerp: 0.08,
  /** Position lerp factor for smooth movement. */
  positionLerp: 0.1,
  /** Distance threshold to consider "arrived" at a destination. */
  arrivalThreshold: 0.08,
  /** Pause duration after arriving before transitioning to next activity. */
  arrivalPause: 0.5,
  /** Leg swing amplitude when walking. */
  legSwingAmplitude: 0.3,
  /** Leg swing speed when walking. */
  legSwingSpeed: 6,
  /** Arm swing amplitude when walking. */
  armSwingAmplitude: 0.25,
  /** Arm swing speed when walking. */
  armSwingSpeed: 6,
  /** Body bob amplitude when walking. */
  bodyBobAmplitude: 0.03,
  /** Body bob speed when walking. */
  bodyBobSpeed: 6,
} as const

// ── Station Definitions ────────────────────────────────────────────

/** Stations in the office room. */
export const STATIONS: Station[] = [
  {
    id: 'desk',
    label: 'Desk',
    position: [0, 0, -1.5],
    rotationY: 0,
    activities: ['typing', 'waiting', 'celebrating', 'idle'],
    standPosition: [0, 0, -0.2],
  },
  {
    id: 'monitor',
    label: 'Monitor',
    position: [0, 1.1, -2.3],
    rotationY: 0,
    activities: ['inspecting', 'lookingAround'],
    standPosition: [0, 0, -0.8],
  },
  {
    id: 'whiteboard',
    label: 'Whiteboard',
    position: [-3.5, 0, -3.5],
    rotationY: Math.PI / 4,
    activities: ['thinking', 'lookingAround'],
    standPosition: [-2.5, 0, -2.8],
  },
  {
    id: 'coffee',
    label: 'Coffee Machine',
    position: [4, 0, -3],
    rotationY: -Math.PI / 3,
    activities: ['waiting', 'lookingAround'],
    standPosition: [3.2, 0, -2.3],
  },
  {
    id: 'window',
    label: 'Window',
    position: [5.5, 2, 0],
    rotationY: -Math.PI / 2,
    activities: ['thinking', 'lookingAround', 'idle'],
    standPosition: [4.5, 0, 0],
  },
]

// ── The Office Room ────────────────────────────────────────────────

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
    {
      id: 'whiteboard',
      label: 'Whiteboard',
      position: [-3.5, 1.5, -3.5],
      distance: 4,
    },
  ],
  characterSpawn: [0, 0, -0.2],
  ambientIntensity: 0.6,
  accentColor: COLORS.primary,
  stations: STATIONS,
}

/** Room registry — today just the office. Future: Drive, Cruise, Chat, etc. */
export const ROOMS: RoomRegistry = {
  office: OFFICE_ROOM,
}

// ── Animation Parameters ───────────────────────────────────────────

export const ANIM = {
  breathingAmplitude: 0.02,
  breathingSpeed: 0.8,
  typingSpeed: 6,
  lookAroundSpeed: 0.5,
  lookAroundAmplitude: 0.15,
  monitorPulseSpeed: 1.2,
  monitorPulseAmplitude: 0.15,
  // Activity-specific
  thinkingHeadTilt: 0.15,
  thinkingPaceSpeed: 0.8,
  inspectingLean: 0.1,
  celebratingBounceAmplitude: 0.08,
  celebratingBounceSpeed: 4,
  // Transition
  transitionSpeed: 3, // higher = faster blend
  // Environment
  dustParticleCount: 40,
  dustMaxHeight: 3.5,
  dustDriftSpeed: 0.3,
  dustDriftAmplitude: 0.4,
  keyboardLedPulseSpeed: 2.5,
  keyboardLedPulseAmplitude: 0.3,
  lampGlowSpeed: 0.6,
  lampGlowAmplitude: 0.08,
  monitorFlickerChance: 0.003,
  monitorFlickerDuration: 0.1,
  windowLightIntensity: 0.55,
  windowLightColor: '#5a8ec4',
} as const
