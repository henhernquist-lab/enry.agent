import { Zap, Sparkles, Code2, Microscope, BadgeDollarSign, Palette } from 'lucide-react'
import type { RoutingProfile, RoutingProfileId } from '@/lib/router/types'

// Named routing profiles — the vocabulary a (future) profile router selects
// from. Today buildRoutingDecision() maps Drive's complexity tier onto one of
// these so the explanation UI already speaks the right language. Adding a new
// profile is an entry here + a case in profileForComplexity() if it should be
// auto-reachable.
export const ROUTING_PROFILES: Record<RoutingProfileId, RoutingProfile> = {
  fast:     { id: 'fast',     label: 'Fast',     description: 'Lowest latency for simple tasks',        icon: Zap },
  smart:    { id: 'smart',    label: 'Smart',    description: 'Balanced capability and cost',           icon: Sparkles },
  coding:   { id: 'coding',   label: 'Coding',   description: 'Optimized for code generation',          icon: Code2 },
  research: { id: 'research', label: 'Research', description: 'Deep reasoning and large context',       icon: Microscope },
  cheapest: { id: 'cheapest', label: 'Cheapest', description: 'Lowest estimated cost for the task',     icon: BadgeDollarSign },
  creative: { id: 'creative', label: 'Creative', description: 'Higher temperature, divergent thinking', icon: Palette },
}

export function getRoutingProfile(id: RoutingProfileId): RoutingProfile {
  return ROUTING_PROFILES[id] ?? ROUTING_PROFILES.smart
}
