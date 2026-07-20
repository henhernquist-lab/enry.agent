// Focus Mode — shared types so chat/route.ts, the skills registry, and the
// UI all agree on the same enumerations without duplicating them.
//
// Two orthogonal axes — separate concerns, separate configs, separate state:
// - `FocusMode`      = *source scope*:    which DRAWERS the agent reads from
//                                       (memory / web / repo / all)
// - `SessionFocus`   = *stance/posture*:  HOW the agent responds
//                                       (Brainstorm / Ship / Teacher / Focus)
//
// They compose: a session can be "Ship" (posture) + "repo_only" (source).
// The UI surfaces both as sibling pills in the controls row.

export const ALLOWED_FOCUS_MODES = ['all', 'memory_only', 'web_only', 'repo_only'] as const
export type FocusMode = (typeof ALLOWED_FOCUS_MODES)[number]

export function normalizeFocusMode(raw: unknown): FocusMode {
  return (ALLOWED_FOCUS_MODES as readonly string[]).includes(raw as string)
    ? (raw as FocusMode)
    : 'all'
}

// ─── Session Focus (stance/posture) ──────────────────────────────────
//
// A SessionFocus is *how Enry responds right now* — a behavioral posture
// adopted for every reply, regardless of topic. While active:
//   - the system prompt includes the mode directive so the model adopts it
//   - mid-session switching is live: next POST carries the new posture
//
// Stance modes change Enry's default behavior across ANY topic:
//   Brainstorm — divergent, generative, quantity over quality
//   Ship — convergent, decisive, picks one path
//   Teacher — explains the why, not just the what
//   Focus — suppresses tangents, anti-distraction
//
// None is the default — no posture, standard behavior.
// Seed postures are pre-defined and surface as quick-pick chips; custom is
// user-named, persists to localStorage; both treat the session identically.

export const SEED_FOCUSES = ['brainstorm', 'ship', 'teacher', 'focus'] as const
export type SeedFocus = (typeof SEED_FOCUSES)[number]
export const SESSION_FOCUS_NONE = 'none'

export type SessionFocus =
  | { kind: 'none' }
  | { kind: 'seed'; id: SeedFocus }
  | { kind: 'custom'; id: string }    // lowercase, trimmed; max 32 chars

export const DEFAULT_SESSION_FOCUS: SessionFocus = { kind: 'none' }

// Display metadata — UI uses this to render pills/chips. Not serialized.
export interface SessionFocusMeta {
  id: string
  label: string
  shortLabel: string  // for the pill (single word, max ~10 chars)
  description: string // hover/tooltip
}

export const SESSION_FOCUS_META: Record<string, SessionFocusMeta> = {
  none: {
    id: 'none',
    label: 'No posture',
    shortLabel: 'Focus',
    description: 'Standard behavior — no stance applied.',
  },
  brainstorm: {
    id: 'brainstorm',
    label: 'Brainstorm',
    shortLabel: 'Brainstorm',
    description: 'Divergent — generate many options, withhold judgment.',
  },
  ship: {
    id: 'ship',
    label: 'Ship',
    shortLabel: 'Ship',
    description: 'Convergent — pick one path, state the next action.',
  },
  teacher: {
    id: 'teacher',
    label: 'Teacher',
    shortLabel: 'Teacher',
    description: 'Explain why, not just what — surface reasoning.',
  },
  focus: {
    id: 'focus',
    label: 'Focus',
    shortLabel: 'Focus',
    description: 'Anti-distraction — answer exactly what is asked.',
  },
}

// ─── Injection prompts — each mode's distinct behavioral directive ────
// Injected into the system prompt via chat/route.ts. These ARE the feature.

export const SESSION_FOCUS_PROMPTS: Record<string, string> = {
  brainstorm: `MODE: BRAINSTORM — You are in exploratory, divergent mode.
- Generate many options. Quantity and variety matter more than polish.
- Do NOT narrow to one answer or declare a winner. Label options clearly (A, B, C...) so the user can reference them.
- Withhold judgment. Every idea gets air. When you catch yourself evaluating or pruning, stop and generate one more option instead.
- Stay exploratory until the user explicitly says "pick one," "which is best," or "let's converge."`,

  ship: `MODE: SHIP — You are in execution, convergent mode.
- Stop exploring. Pick ONE concrete path forward and state it clearly.
- Give the very next action the user should take — not a menu, not a framework.
- Do NOT say "here are some approaches" or "you could also..." — commit to one recommendation and explain why it's the right call right now.
- The user is stuck in analysis-paralysis. Your job is to break them out with a decision, not more possibilities.`,

  teacher: `MODE: TEACHER — You are in teaching mode.
- Every answer must include the reasoning and mechanism behind it — not just the output.
- Explain WHY something works, not just WHAT to do. Surface underlying principles.
- When you give a conclusion, walk backward to show how you arrived at it.
- Assume the user wants to understand, not just receive. If an answer would normally be one sentence, make it three: what, why, and how.`,

  focus: `MODE: FOCUS — You are in anti-distraction mode.
- Answer exactly what is asked. Nothing more.
- Do NOT volunteer new ideas, related topics, or "you might also consider..." tangents.
- Do NOT scope-creep. Do NOT ask clarifying questions unless the request is genuinely unanswerable without them.
- The user is heads-down. Brevity over completeness. One clear answer, then stop.`,
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

// Human-facing label for the current pill — falls back to the raw id for
// user-created custom focuses (so the pill reads the user's own name back).
export function sessionFocusLabel(focus: SessionFocus): string {
  if (focus.kind === 'none') return SESSION_FOCUS_META.none.shortLabel
  if (focus.kind === 'custom') return focus.id
  return SESSION_FOCUS_META[focus.id]?.shortLabel ?? SESSION_FOCUS_META.none.shortLabel
}
