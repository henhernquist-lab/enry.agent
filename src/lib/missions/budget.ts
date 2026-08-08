// Hard spend caps for Layer 1 orchestrators.
//
// The builders in Layer 2 cost whatever their own CLIs cost and are metered by
// their vendors. The orchestrators are different: they call a model from inside
// Golem, on a loop, with no human watching. That is where an unbounded bill
// comes from, so the cap lives here and is checked BEFORE any model call.
//
// ─── Where the numbers live, and why not usage_log ──────────────────────
// src/lib/usage/ already meters chat traffic, and reusing it was the first
// plan. Two things ruled it out as the authority for this cap:
//
//   1. usage_log.mode carries CHECK (mode IN ('chat','drive','cruise','learn',
//      'lab')). A planner row does not fit any of those, and widening the
//      constraint needs a migration applied before the cap could work at all.
//   2. logUsage() swallows every error by design — correctly, because usage
//      metering must never break a streaming response. But a spend cap built
//      on a ledger whose writes can fail silently is a cap that quietly stops
//      counting and then permits everything. That is the exact failure mode a
//      hard cap exists to prevent.
//
// So mission_events is the authority: it is already applied, already
// append-only, and its writes here are NOT swallowed. Usage is one
// 'planner.usage' event per call, and both sums are queries over those events.
// Nothing is dual-written, so the two ledgers cannot drift.

import { supabase } from '@/lib/supabase'
import { estimateCostUsd } from '@/lib/usage/pricing'
import { MissionStoreError } from './store'

export const PLANNER_USAGE_EVENT = 'planner.usage'
export const BUDGET_EXCEEDED_EVENT = 'budget_exceeded'

/**
 * Conservative on purpose — this is new and unproven, and the failure mode of
 * "too low" is a visible halt while "too high" is an invisible bill. Raise via
 * env once the numbers are trusted.
 */
const DEFAULT_MISSION_TOKEN_CAP = 60_000
const DEFAULT_DAILY_TOKEN_CAP = 400_000
const DEFAULT_MISSION_COST_CAP_USD = 0.5
const DEFAULT_DAILY_COST_CAP_USD = 3

export interface BudgetLimits {
  missionTokens: number
  dailyTokens: number
  missionCostUsd: number
  dailyCostUsd: number
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const parsed = Number(raw)
  // A typo in an env var must not silently become an unlimited budget.
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new MissionStoreError(`${name} is not a non-negative number: ${JSON.stringify(raw)}`)
  }
  return parsed
}

export function budgetLimits(): BudgetLimits {
  return {
    missionTokens: envNumber('PLANNER_MISSION_TOKEN_CAP', DEFAULT_MISSION_TOKEN_CAP),
    dailyTokens: envNumber('PLANNER_DAILY_TOKEN_CAP', DEFAULT_DAILY_TOKEN_CAP),
    missionCostUsd: envNumber('PLANNER_MISSION_COST_CAP_USD', DEFAULT_MISSION_COST_CAP_USD),
    dailyCostUsd: envNumber('PLANNER_DAILY_COST_CAP_USD', DEFAULT_DAILY_COST_CAP_USD),
  }
}

export interface Spend {
  tokens: number
  costUsd: number
  calls: number
}

const ZERO: Spend = { tokens: 0, costUsd: 0, calls: 0 }

interface UsagePayload {
  totalTokens?: number
  costUsd?: number
}

function sum(rows: { payload: UsagePayload | null }[]): Spend {
  return rows.reduce<Spend>(
    (acc, row) => ({
      tokens: acc.tokens + (Number(row.payload?.totalTokens) || 0),
      costUsd: acc.costUsd + (Number(row.payload?.costUsd) || 0),
      calls: acc.calls + 1,
    }),
    ZERO,
  )
}

/** Everything Layer 1 has spent on one mission. */
export async function missionSpend(missionId: string): Promise<Spend> {
  const { data, error } = await supabase
    .from('mission_events')
    .select('payload')
    .eq('mission_id', missionId)
    .eq('type', PLANNER_USAGE_EVENT)
  if (error) throw new MissionStoreError(`missionSpend: ${error.message}`, error)
  return sum((data ?? []) as { payload: UsagePayload | null }[])
}

/** Everything Layer 1 has spent since UTC midnight, across all missions. */
export async function dailySpend(now = new Date()): Promise<Spend> {
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const { data, error } = await supabase
    .from('mission_events')
    .select('payload')
    .eq('type', PLANNER_USAGE_EVENT)
    .gte('ts', since)
  if (error) throw new MissionStoreError(`dailySpend: ${error.message}`, error)
  return sum((data ?? []) as { payload: UsagePayload | null }[])
}

export interface BudgetVerdict {
  allowed: boolean
  /** Which cap tripped. Null when allowed. */
  breached: 'mission_tokens' | 'daily_tokens' | 'mission_cost' | 'daily_cost' | null
  reason: string | null
  limits: BudgetLimits
  mission: Spend
  daily: Spend
}

/**
 * Decide whether the planner may make a model call.
 *
 * Checks committed spend against the caps. It cannot know a call's cost in
 * advance, so a call that starts under the cap may finish over it — the next
 * check then refuses. That is deliberate: pre-charging an estimate would either
 * over-block on a bad guess or under-block on a low one, and one call's
 * overshoot is bounded by maxOutputTokens on the planner call itself.
 *
 * Throws rather than returning "allowed" if the ledger cannot be read. An
 * unreadable ledger means unknown spend, and unknown spend is not permission.
 */
export async function checkBudget(missionId: string): Promise<BudgetVerdict> {
  const limits = budgetLimits()
  const [mission, daily] = await Promise.all([missionSpend(missionId), dailySpend()])

  const breach = (() => {
    if (mission.tokens >= limits.missionTokens) return 'mission_tokens' as const
    if (mission.costUsd >= limits.missionCostUsd) return 'mission_cost' as const
    if (daily.tokens >= limits.dailyTokens) return 'daily_tokens' as const
    if (daily.costUsd >= limits.dailyCostUsd) return 'daily_cost' as const
    return null
  })()

  const reason = breach
    ? {
        mission_tokens: `mission token cap reached: ${mission.tokens} / ${limits.missionTokens}`,
        mission_cost: `mission cost cap reached: $${mission.costUsd.toFixed(4)} / $${limits.missionCostUsd}`,
        daily_tokens: `daily token cap reached: ${daily.tokens} / ${limits.dailyTokens}`,
        daily_cost: `daily cost cap reached: $${daily.costUsd.toFixed(4)} / $${limits.dailyCostUsd}`,
      }[breach]
    : null

  return { allowed: !breach, breached: breach, reason, limits, mission, daily }
}

export interface PlannerUsage {
  modelId: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number
  latencyMs: number
}

/**
 * Record what one Layer 1 model call actually cost.
 *
 * Deliberately does NOT go through store.recordEvent: that swallows its errors
 * so a logging failure can't roll back a state transition. Here the write IS
 * the accounting — a dropped row is spend that the next cap check will not see.
 */
export async function recordPlannerUsage(
  missionId: string,
  usage: PlannerUsage,
): Promise<void> {
  const { error } = await supabase.from('mission_events').insert({
    mission_id: missionId,
    type: PLANNER_USAGE_EVENT,
    payload: { ...usage },
  })
  if (error) {
    throw new MissionStoreError(
      `recordPlannerUsage: could not persist ${usage.totalTokens} tokens ($${usage.costUsd.toFixed(4)}) — ` +
        `refusing to continue with an incomplete spend ledger: ${error.message}`,
      error,
    )
  }
}

/** Cost for a call, using the same pricing table the usage dashboard uses. */
export function costOf(modelId: string, promptTokens: number, completionTokens: number): number {
  return estimateCostUsd(modelId, promptTokens, completionTokens)
}
