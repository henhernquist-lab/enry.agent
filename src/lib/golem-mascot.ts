// Golem the mascot — shared types + the "Show Golem" preference.
//
// Pass one ships the character, the drift, the theming and the toggle.
// `GolemState` is declared in full here so pass two (expressions, poses,
// rate-limit droop) only has to teach the ART to draw a state the rest of the
// app can already broadcast — no signature churn in the mascot itself.

import { getModelMeta } from '@/lib/nim'

export const GOLEM_STATES = ['idle', 'dozing', 'thinking', 'success', 'error'] as const
export type GolemState = (typeof GOLEM_STATES)[number]
export const DEFAULT_GOLEM_STATE: GolemState = 'idle'

export const GOLEM_VISIBILITY_STORAGE_KEY = 'enry-golem-mascot'

// A same-tab localStorage write never fires `storage`, so the settings toggle
// announces itself on this event and the globally-mounted mascot listens —
// same pattern as `grimoire:draft-changed`.
export const GOLEM_VISIBILITY_EVENT = 'golem:mascot-visibility'

export function loadGolemVisible(): boolean {
  try {
    return localStorage.getItem(GOLEM_VISIBILITY_STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function saveGolemVisible(visible: boolean): void {
  try {
    localStorage.setItem(GOLEM_VISIBILITY_STORAGE_KEY, visible ? 'on' : 'off')
  } catch {
    /* noop */
  }
  window.dispatchEvent(new CustomEvent(GOLEM_VISIBILITY_EVENT, { detail: visible }))
}

// ─── Model-aware tint ────────────────────────────────────────────────
//
// Derived from the model registry's existing `company` field rather than a new
// colour-per-model table — models from the same house read as the same hue,
// and a model added to MODEL_LIST tomorrow gets a tint with no edit here.
// The result is mixed into the accent swatches at ~22% (see .golem-figure in
// globals.css): enough to notice out of the corner of your eye, not a costume.

function hueFromString(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash) % 360
}

export function golemTintForModel(modelId: string | null): string | null {
  if (!modelId) return null
  // Community ids are `community:<hfId>:<provider>` and carry no registry
  // entry; the provider segment is their house.
  const house = modelId.startsWith('community:')
    ? modelId.split(':')[2]
    : getModelMeta(modelId)?.company
  if (!house) return null
  return `hsl(${hueFromString(house)} 55% 58%)`
}
