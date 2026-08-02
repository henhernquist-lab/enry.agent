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
// Keyed on the model registry's existing `company` field rather than a
// colour-per-model table — every model from a house reads as one hue, so a new
// model from a known house needs no edit here. The result is mixed into the
// accent swatches at ~22% (see .golem-figure in globals.css): enough to notice
// out of the corner of your eye, not a costume.
//
// Hues were hashed from the company string originally. They aren't any more,
// because a hash can't promise two houses look different — and at this mix,
// two that hash close are simply the same colour. See HOUSE_HUE.

/**
 * A house's identity, independent of which gateway serves it: the registry
 * records "Anthropic (GitHub Models)" and "DeepSeek (NVIDIA NIM)", but the
 * brand is what the tint is meant to signal. Leading token, lowercased —
 * "DeepSeek (NVIDIA NIM)" and a future bare "DeepSeek" land on one hue.
 */
function houseKey(house: string): string {
  return house.trim().split(/[\s(]+/)[0].toLowerCase()
}

// Hues are assigned, not hashed, because hashing put two pairs on top of each
// other: Anthropic and Google landed 3° apart, DeepSeek and NVIDIA 13° apart.
// At the deliberately subtle 22% mix those differences vanished entirely, so
// the tint said "a model changed" without ever saying which.
//
// The values are solved rather than eyeballed. Even spacing around the hue
// wheel is NOT even to the eye once each tint is mixed 22% into a saturated
// theme accent — the base dominates and compresses the differences unevenly,
// worst in the light theme where the primary is a strong blue. So these
// maximise the *minimum* CIE76 distance between any two houses, measured
// after the mix, across all three themes at once. Anthropic and NVIDIA are
// pinned at the hues they already had, since neither was part of a collision.
//
// Worst-case separation goes from dE 4.78 to 9.60 without touching the 22%.
// Adding a sixth house means re-solving this table, not appending to it.
const HOUSE_HUE: Record<string, number> = {
  anthropic: 62,
  google: 27,
  groq: 188,
  deepseek: 228,
  nvidia: 350,
}

/**
 * Every house without an assigned slot shares one hue.
 *
 * Not laziness — the wheel is full. Solved the same way as the table above,
 * five anchored houses at a 22% mix leave exactly one hue standing more than
 * dE 8 clear of all of them (152°), two above dE 6, and four above dE 5.
 * There is no room to give unknown houses distinct, actually-distinguishable
 * colours, and a hash that lands one of them a dE of 1.5 from Claude's tint
 * is worse than no distinction at all — it would be a *wrong* signal.
 *
 * So the fallback says one true thing instead: "not one of the known houses."
 * That mostly means a community model, which is its own category anyway —
 * they're deliberately kept out of every autonomous path (see the
 * community_models migration). A new registry company also lands here, and
 * reads as unassigned until someone gives it a slot above.
 */
const UNASSIGNED_HUE = 152

export function golemTintForModel(modelId: string | null): string | null {
  if (!modelId) return null
  // Community ids are `community:<hfId>:<provider>` and carry no registry
  // entry; the provider segment is their house.
  const house = modelId.startsWith('community:')
    ? modelId.split(':')[2]
    : getModelMeta(modelId)?.company
  if (!house) return null
  const hue = HOUSE_HUE[houseKey(house)] ?? UNASSIGNED_HUE
  return `hsl(${hue} 55% 58%)`
}
