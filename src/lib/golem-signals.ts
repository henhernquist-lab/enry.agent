// Cross-tree signals for the mascot. Same approach as agent-presence.ts —
// useSyncExternalStore over a module-level value, no state library — because
// the publishers (chat panel, model picker, run watchers) and the subscriber
// (one mascot mounted in the root layout) sit in unrelated parts of the tree.
//
// Everything here is client-only; the server snapshots are inert.

import { useSyncExternalStore } from 'react'
import type { SuggestionCard } from '@/lib/suggestion-cards'

type Listener = () => void

function createSignal<T>(initial: T) {
  let value = initial
  const listeners = new Set<Listener>()
  return {
    get: () => value,
    set(next: T) {
      if (Object.is(next, value)) return
      value = next
      for (const l of listeners) l()
    },
    subscribe(l: Listener) {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
}

// ─── Transient mood pulses (success / error) ─────────────────────────
// A pulse outranks every ambient state for a moment, then clears itself.

export type GolemPulse = 'success' | 'error'

const PULSE_MS: Record<GolemPulse, number> = { success: 1600, error: 2200 }

const pulseSignal = createSignal<GolemPulse | null>(null)
let pulseTimer: ReturnType<typeof setTimeout> | null = null

/** Flash Golem success/error — e.g. a Cruise run finishing, a request failing. */
export function pulseGolem(kind: GolemPulse): void {
  if (pulseTimer) clearTimeout(pulseTimer)
  pulseSignal.set(kind)
  pulseTimer = setTimeout(() => {
    pulseTimer = null
    pulseSignal.set(null)
  }, PULSE_MS[kind])
}

export function useGolemPulse(): GolemPulse | null {
  return useSyncExternalStore(pulseSignal.subscribe, pulseSignal.get, () => null)
}

// ─── Active model (drives the tint) ──────────────────────────────────

const modelSignal = createSignal<string | null>(null)

export function setGolemModel(modelId: string | null): void {
  modelSignal.set(modelId)
}

export function useGolemModel(): string | null {
  return useSyncExternalStore(modelSignal.subscribe, modelSignal.get, () => null)
}

// ─── Seek target (drift toward the active input while typing) ────────

export interface GolemSeekTarget {
  x: number
  y: number
}

const SEEK_LINGER_MS = 3000

const seekSignal = createSignal<GolemSeekTarget | null>(null)
let seekTimer: ReturnType<typeof setTimeout> | null = null

/**
 * Point Golem at a spot in viewport coordinates. The target expires on its own
 * a few seconds after the last call, so callers can fire this on every
 * keystroke and never have to remember to clear it.
 */
export function setGolemSeekTarget(target: GolemSeekTarget | null): void {
  if (seekTimer) clearTimeout(seekTimer)
  seekSignal.set(target)
  if (!target) return
  seekTimer = setTimeout(() => {
    seekTimer = null
    seekSignal.set(null)
  }, SEEK_LINGER_MS)
}

export function useGolemSeekTarget(): GolemSeekTarget | null {
  return useSyncExternalStore(seekSignal.subscribe, seekSignal.get, () => null)
}

// ─── Quick action (clicking Golem) ───────────────────────────────────
// Fire-and-forget rather than stored state: a click is an event, and replaying
// the last one on mount would be wrong.

type QuickActionListener = (card: SuggestionCard) => void
const quickActionListeners = new Set<QuickActionListener>()

export function fireGolemQuickAction(card: SuggestionCard): void {
  for (const l of quickActionListeners) l(card)
}

export function onGolemQuickAction(listener: QuickActionListener): () => void {
  quickActionListeners.add(listener)
  return () => quickActionListeners.delete(listener)
}

/** True when something is listening — the mascot stays inert otherwise. */
export function hasQuickActionListener(): boolean {
  return quickActionListeners.size > 0
}
