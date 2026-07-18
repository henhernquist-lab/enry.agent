// Focus Mode — shared types so chat/route.ts, the skills registry, and the
// UI all agree on the same enumerations without duplicating them.
//
// Two orthogonal axes — separate concerns, separate configs, separate state:
// - `FocusMode`      = *source scope*:    which DRAWERS the agent reads from
//                                       (memory / web / repo / all)
// - `SessionFocus`   = *domain scope*:    which TASK/APP the session is about
//                                       (coding in Drive / Learn / school / custom)
//
// They compose: a session can be "Drive" (domain) + "repo_only" (source).
// The UI surfaces both as sibling pills in the controls row.

export const ALLOWED_FOCUS_MODES = ['all', 'memory_only', 'web_only', 'repo_only'] as const
export type FocusMode = (typeof ALLOWED_FOCUS_MODES)[number]

export function normalizeFocusMode(raw: unknown): FocusMode {
  return (ALLOWED_FOCUS_MODES as readonly string[]).includes(raw as string)
    ? (raw as FocusMode)
    : 'all'
}

// ─── Session Focus (domain scope) ────────────────────────────────────
//
// A SessionFocus is *what work I'm doing right now*. While active:
//   - skill suggestions narrow to skills relevant to the domain
//   - memory retrieval (when domain-tagged) prefers matching memories
//   - system prompt includes the focus name so the agent self-contextualizes
//
// None is the default — no scoping, behaves like "all domains visible."
// Seed focuses are pre-defined and surface as quick-pick chips; custom is
// user-named, persists to localStorage; both treat the session identically.
//
// Format on the wire: a discriminated union — { kind: 'none' } is the
// safe default that survives any malformed payload.

export const SEED_FOCUSES = ['drive', 'learn', 'school'] as const
export type SeedFocus = (typeof SEED_FOCUSES)[number]
export const SESSION_FOCUS_NONE = 'none'

export type SessionFocus =
  | { kind: 'none' }
  | { kind: 'seed'; id: SeedFocus }
  | { kind: 'custom'; id: string }    // lowercase, trimmed; max 32 chars

export const DEFAULT_SESSION_FOCUS: SessionFocus = { kind: 'none' }

// Display metadata — UI uses this to render pills/chips, and to surface
// what a focus actually *means* to the user. Not serialized over the wire.
export interface SessionFocusMeta {
  id: SessionFocus['kind'] extends 'seed' | 'custom' ? string : string
  label: string
  shortLabel: string  // for the pill (single word, max ~10 chars)
  description: string // hover/tooltip
  domains: string[]   // which SkillDefinition domains to surface
}

export const SESSION_FOCUS_META: Record<string, SessionFocusMeta> = {
  none: {
    id: 'none',
    label: 'No focus',
    shortLabel: 'Focus',
    description: 'No session scoping — every domain visible.',
    domains: ['coding', 'general', 'learning'],
  },
  drive: {
    id: 'drive',
    label: 'Drive',
    shortLabel: 'Drive',
    description: 'Coding work — narrow to Drive/coding skills.',
    domains: ['coding'],
  },
  learn: {
    id: 'learn',
    label: 'Learn',
    shortLabel: 'Learn',
    description: 'Learning work — coding skills hidden; learn skills live in /learn.',
    domains: [],
  },
  school: {
    id: 'school',
    label: 'School',
    shortLabel: 'School',
    description: 'General school work — no narrowing.',
    domains: ['coding', 'general', 'learning'],
  },
}

export function isSessionFocus(raw: unknown): raw is SessionFocus {
  if (!raw || typeof raw !== 'object') return false
  const r = raw as { kind?: unknown; id?: unknown }
  if (r.kind === 'none') return true
  if (r.kind === 'seed' && typeof r.id === 'string') {
    return (SEED_FOCUSES as readonly string[]).includes(r.id)
  }
  if (r.kind === 'custom' && typeof r.id === 'string') {
    const v = r.id.trim().toLowerCase()
    return v.length > 0 && v.length <= 32
  }
  return false
}

export function normalizeSessionFocus(raw: unknown): SessionFocus {
  return isSessionFocus(raw) ? (raw as SessionFocus) : DEFAULT_SESSION_FOCUS
}

// Compact wire form for the chat POST body — single string instead of the
// discriminated union, since the server only needs to know *which* session
// focus is active, not its internal kind.
export type SessionFocusId =
  | 'none'
  | SeedFocus
  | `custom:${string}`

export function serializeSessionFocus(focus: SessionFocus): SessionFocusId {
  if (focus.kind === 'none') return 'none'
  if (focus.kind === 'seed') return focus.id
  return `custom:${focus.id.trim().toLowerCase()}`
}

export function parseSessionFocusId(raw: unknown): SessionFocus {
  if (typeof raw !== 'string') return DEFAULT_SESSION_FOCUS
  if (raw === 'none') return { kind: 'none' }
  if ((SEED_FOCUSES as readonly string[]).includes(raw)) {
    return { kind: 'seed', id: raw as SeedFocus }
  }
  if (raw.startsWith('custom:')) {
    const id = raw.slice('custom:'.length).trim().toLowerCase()
    if (id.length === 0 || id.length > 32) return DEFAULT_SESSION_FOCUS
    return { kind: 'custom', id }
  }
  return DEFAULT_SESSION_FOCUS
}

export function sessionFocusDomains(focus: SessionFocus): string[] {
  if (focus.kind === 'none') return SESSION_FOCUS_META.none.domains
  return SESSION_FOCUS_META[focus.id]?.domains ?? ['coding', 'general', 'learning']
}

// Human-facing label for the current pill — falls back to the raw id for
// user-created custom focuses (so the pill reads the user's own name back).
export function sessionFocusLabel(focus: SessionFocus): string {
  if (focus.kind === 'none') return SESSION_FOCUS_META.none.shortLabel
  if (focus.kind === 'custom') return focus.id
  return SESSION_FOCUS_META[focus.id]?.shortLabel ?? SESSION_FOCUS_META.none.shortLabel
}
