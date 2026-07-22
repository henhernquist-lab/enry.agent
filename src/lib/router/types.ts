import type { ComponentType } from 'react'

// Future-proof router-explanation contracts. Today the only auto-routing is
// Drive's complexity-based auto-select (src/lib/drive/auto-select.ts); the
// explain builder adapts that real decision into a RoutingDecision. When a
// profile-based router lands later, it produces a RoutingDecision directly —
// the <RouterExplanation> component and these types stay unchanged.

export type RoutingProfileId =
  | 'fast' | 'smart' | 'coding' | 'research' | 'cheapest' | 'creative'

export type IconType = ComponentType<{ className?: string }>

export interface RoutingProfile {
  id: RoutingProfileId
  label: string
  description: string
  icon: IconType
}

export type RouterReasonKind =
  | 'cost' | 'latency' | 'benchmark' | 'context'
  | 'capability' | 'complexity' | 'preference'

export interface RouterReason {
  kind: RouterReasonKind
  text: string
  positive: boolean
}

export interface FallbackEntry {
  modelId: string
  modelLabel: string
  reason: string
}

export interface RoutingDecision {
  profileId: RoutingProfileId
  profileLabel: string
  selectedModelId: string
  selectedModelLabel: string
  /** Human-readable complexity tier, e.g. "complex". */
  complexity: string
  effort?: string
  think?: string
  profileReasons: RouterReason[]
  modelReasons: RouterReason[]
  fallbacks: FallbackEntry[]
  /** Epoch ms when the decision was made — lets the UI key/fade it. */
  decidedAt: number
}
