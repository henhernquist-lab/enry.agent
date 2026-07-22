import { getModelMeta, listModels } from '@/lib/nim'
import type { ModelMeta } from '@/lib/nim'
import { costTierFor } from '@/lib/usage/pricing'
import type { TaskComplexity } from '@/lib/drive/auto-select'
import type { RoutingProfileId, RouterReason, FallbackEntry, RoutingDecision } from '@/lib/router/types'
import { getRoutingProfile } from '@/lib/router/profiles'

// Bridge from Drive's existing (real) auto-select decision to the
// profile-vocabulary RoutingDecision the explanation UI renders. This is NOT a
// new router — it relabels the complexity tier onto a profile and derives
// reasons from live ModelMeta + pricing, so the explanation is driven by the
// actual decision and metadata, not hardcoded prose. When a real profile
// router lands, it emits a RoutingDecision directly and this builder is
// bypassed.
function profileForComplexity(c: TaskComplexity): RoutingProfileId {
  if (c === 'complex') return 'coding'
  if (c === 'simple') return 'fast'
  return 'smart'
}

function strengthScore(m: ModelMeta): number {
  return (m.supportsReasoning ? 2 : 0) + (m.defaultEffort === 'high' ? 2 : m.defaultEffort === 'medium' ? 1 : 0)
}

function modelReasons(m: ModelMeta): RouterReason[] {
  const reasons: RouterReason[] = []
  if (m.supportsReasoning) reasons.push({ kind: 'capability', text: 'Deep reasoning support', positive: true })
  if (m.defaultEffort === 'high') reasons.push({ kind: 'benchmark', text: 'High reasoning-effort ceiling', positive: true })
  if (m.supportsVision) reasons.push({ kind: 'capability', text: 'Vision capable', positive: true })
  if (/long.?context/i.test(m.description)) reasons.push({ kind: 'context', text: 'Large context window', positive: true })
  if (/coding/i.test(m.description) || /code/i.test(m.label)) {
    reasons.push({ kind: 'benchmark', text: 'Coding-tuned', positive: true })
  }
  if (m.company.includes('NIM')) reasons.push({ kind: 'latency', text: 'Low latency (co-located NIM)', positive: true })
  const tier = costTierFor(m.id)
  if (tier === 'lowest' || tier === 'low') reasons.push({ kind: 'cost', text: 'Low estimated cost', positive: true })
  if (tier === 'high') reasons.push({ kind: 'cost', text: 'Higher cost tier', positive: false })
  return reasons
}

function profileReasons(profileId: RoutingProfileId, complexity: TaskComplexity, m: ModelMeta): RouterReason[] {
  const reasons: RouterReason[] = []
  if (profileId === 'coding') {
    reasons.push({ kind: 'capability', text: 'Optimized for code generation', positive: true })
  }
  if (profileId === 'fast' || complexity === 'simple') {
    reasons.push({ kind: 'latency', text: 'Fast response time', positive: true })
  }
  if (complexity === 'complex') {
    reasons.push({ kind: 'complexity', text: 'Matched to a complex task', positive: true })
    reasons.push({ kind: 'benchmark', text: 'High reasoning benchmark', positive: true })
  }
  if (complexity === 'moderate') {
    reasons.push({ kind: 'complexity', text: 'Balanced for a moderate task', positive: true })
  }
  const tier = costTierFor(m.id)
  if (tier === 'lowest' || tier === 'low') {
    reasons.push({ kind: 'cost', text: 'Lowest estimated cost for this task', positive: true })
  }
  return reasons
}

function fallbackReason(m: ModelMeta): string {
  const tier = costTierFor(m.id)
  if (tier === 'lowest' || tier === 'low') return 'Lower-cost fallback if the primary is unavailable'
  if (m.supportsReasoning) return 'Preserves reasoning capacity if the primary degrades'
  return 'Available fallback if the primary is unavailable'
}

function buildFallbacks(selected: ModelMeta): FallbackEntry[] {
  const others = listModels('drive').filter((m) => m.id !== selected.id)
  const ranked = others.sort((a, b) => strengthScore(b) - strengthScore(a))
  return ranked.slice(0, 2).map((m) => ({
    modelId: m.id,
    modelLabel: m.label,
    reason: fallbackReason(m),
  }))
}

export interface BuildRoutingDecisionInput {
  complexity: TaskComplexity
  modelId: string
  modelLabel: string
  effort?: string
  think?: string
}

export function buildRoutingDecision(input: BuildRoutingDecisionInput): RoutingDecision {
  const profileId = profileForComplexity(input.complexity)
  const profile = getRoutingProfile(profileId)
  const meta = getModelMeta(input.modelId)
  return {
    profileId,
    profileLabel: profile.label,
    selectedModelId: input.modelId,
    selectedModelLabel: input.modelLabel,
    complexity: input.complexity,
    effort: input.effort,
    think: input.think,
    profileReasons: meta ? profileReasons(profileId, input.complexity, meta) : [],
    modelReasons: meta ? modelReasons(meta) : [],
    fallbacks: meta ? buildFallbacks(meta) : [],
    decidedAt: Date.now(),
  }
}
