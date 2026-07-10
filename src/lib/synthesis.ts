import { supabase } from './supabase'
import type {
  ResourceType,
  CheckinPayload,
  CountdownPayload,
  RacePacePayload,
  PromptPayload,
  HabitStreakPayload,
  ArticleNotePayload,
} from './resources'

// ─────────────────────────────────────────────────────────────────────────
// Cross-tool synthesis layer.
//
// Queries, aggregates, and reasons across ALL of the user's resources
// regardless of tool type. Returns STRUCTURED DATA ONLY — no LLM calls. The
// Aperture, Chief of Staff, and Root Cause features consume this and do the
// LLM work themselves.
//
// Efficiency: one rollup RPC (synthesis_rollup) + one bounded detail SELECT,
// results cached in-process with a 5-minute TTL keyed by userId.
// ─────────────────────────────────────────────────────────────────────────

export interface ToolActivity {
  type: ResourceType
  total: number
  recent: number
  prior: number
  daysActive: number
  firstCreatedAt: string | null
  lastCreatedAt: string | null
  daysSinceLast: number | null
  rateDelta: number // recent - prior, creation-rate change across equal windows
}

export interface Streaks {
  habitStreak: number | null // best current habit streak
  checkinGapDays: number | null // days since last daily check-in
  trainingFrequency7d: number // workouts logged in the last 7 days
  trainingFrequency14d: number
}

export interface UpcomingEvent {
  title: string
  date: string
  daysUntil: number
  eventType: string
  domain: FailureDomain
}

export interface Trends {
  checkinRatings: { date: string; rating: number }[] // chronological, recent first
  checkinTrajectory: 'rising' | 'falling' | 'flat' | 'unknown'
  raceTimes: { date: string; distance: string; seconds: number; isPr: boolean }[]
  creationRateDelta: number // total recent - total prior across all tools
}

export interface OpenThread {
  kind: 'unused_prompt' | 'unopened_article' | 'stale_project'
  title: string
  ageDays: number
  detail: string
}

export type FailureDomain = 'training' | 'academic' | 'project' | 'other'

export interface ContextSnapshot {
  userId: string
  generatedAt: string
  windowDays: number
  activity: ToolActivity[]
  streaks: Streaks
  upcomingEvents: UpcomingEvent[]
  trends: Trends
  openThreads: OpenThread[]
  totalResources: number
}

interface SnapshotOptions {
  days?: number
}

interface RollupRow {
  type: ResourceType
  total_count: number
  recent_count: number
  first_created_at: string | null
  last_created_at: string | null
  recent_days_active: number
  prior_count: number
}

// A resource row carrying enough to compute trends/threads without extra reads.
interface DetailRow {
  id: string
  type: ResourceType
  title: string
  payload: Record<string, unknown>
  created_at: string
}

const DAY_MS = 24 * 60 * 60 * 1000

function daysBetween(from: string, to: number = Date.now()): number {
  return Math.floor((to - new Date(from).getTime()) / DAY_MS)
}

// ─── Cache ────────────────────────────────────────────────────────────────
const CACHE_TTL_MS = 5 * 60 * 1000
const snapshotCache = new Map<string, { at: number; snapshot: ContextSnapshot }>()

function cacheKey(userId: string, days: number): string {
  return `${userId}:${days}`
}

// ─── Domain mapping (shared with Root Cause) ────────────────────────────────
export function domainForType(type: ResourceType): FailureDomain {
  switch (type) {
    case 'workout':
    case 'race_pace':
    case 'meal':
      return 'training'
    case 'grade_calc':
    case 'flashcards':
    case 'article_note':
    case 'bell_schedule':
      return 'academic'
    case 'repo_scan':
    case 'repo_review':
    case 'prompt':
      return 'project'
    default:
      return 'other'
  }
}

function eventDomain(eventType: string): FailureDomain {
  if (eventType === 'track_meet') return 'training'
  if (eventType === 'football_game') return 'training'
  return 'other'
}

// ─── getContextSnapshot ─────────────────────────────────────────────────────
export async function getContextSnapshot(
  userId: string,
  options: SnapshotOptions = {},
): Promise<ContextSnapshot> {
  const days = options.days ?? 14
  const key = cacheKey(userId, days)
  const cached = snapshotCache.get(key)
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.snapshot

  // One aggregation RPC + one bounded detail SELECT. The detail rows power
  // trend series and open-thread detection; capped so we never pull the whole
  // table. 400 rows covers well over a month of a single user's activity.
  const [rollupRes, detailRes] = await Promise.all([
    supabase.rpc('synthesis_rollup', { p_user_id: userId, p_days: days }),
    supabase
      .from('resources')
      .select('id, type, title, payload, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(400),
  ])

  const rollup = (rollupRes.data ?? []) as RollupRow[]
  const details = (detailRes.data ?? []) as DetailRow[]
  if (rollupRes.error) console.error('[synthesis] rollup RPC error:', rollupRes.error)
  if (detailRes.error) console.error('[synthesis] detail query error:', detailRes.error)

  const activity: ToolActivity[] = rollup.map((r) => ({
    type: r.type,
    total: Number(r.total_count),
    recent: Number(r.recent_count),
    prior: Number(r.prior_count),
    daysActive: Number(r.recent_days_active),
    firstCreatedAt: r.first_created_at,
    lastCreatedAt: r.last_created_at,
    daysSinceLast: r.last_created_at ? daysBetween(r.last_created_at) : null,
    rateDelta: Number(r.recent_count) - Number(r.prior_count),
  }))

  const snapshot: ContextSnapshot = {
    userId,
    generatedAt: new Date().toISOString(),
    windowDays: days,
    activity,
    streaks: computeStreaks(details),
    upcomingEvents: computeUpcomingEvents(details),
    trends: computeTrends(details, activity),
    openThreads: computeOpenThreads(details),
    totalResources: activity.reduce((sum, a) => sum + a.total, 0),
  }

  snapshotCache.set(key, { at: Date.now(), snapshot })
  return snapshot
}

function byType(details: DetailRow[], type: ResourceType): DetailRow[] {
  return details.filter((d) => d.type === type)
}

function computeStreaks(details: DetailRow[]): Streaks {
  const habits = byType(details, 'habit_streak')
  const habitStreak = habits.reduce<number | null>((best, h) => {
    const streak = (h.payload as unknown as HabitStreakPayload).streak
    if (typeof streak !== 'number') return best
    return best === null ? streak : Math.max(best, streak)
  }, null)

  const checkins = byType(details, 'checkin')
  const checkinGapDays = checkins.length > 0 ? daysBetween(checkins[0].created_at) : null

  const workouts = byType(details, 'workout')
  const now = Date.now()
  const trainingFrequency7d = workouts.filter((w) => now - new Date(w.created_at).getTime() < 7 * DAY_MS).length
  const trainingFrequency14d = workouts.filter((w) => now - new Date(w.created_at).getTime() < 14 * DAY_MS).length

  return { habitStreak, checkinGapDays, trainingFrequency7d, trainingFrequency14d }
}

function computeUpcomingEvents(details: DetailRow[]): UpcomingEvent[] {
  const now = Date.now()
  return byType(details, 'countdown')
    .map((c) => {
      const p = c.payload as unknown as CountdownPayload
      const daysUntil = Math.ceil((new Date(p.event_date).getTime() - now) / DAY_MS)
      return {
        title: p.event_name,
        date: p.event_date,
        daysUntil,
        eventType: p.event_type,
        domain: eventDomain(p.event_type),
      }
    })
    .filter((e) => e.daysUntil >= 0)
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5)
}

function computeTrends(details: DetailRow[], activity: ToolActivity[]): Trends {
  const checkinRatings = byType(details, 'checkin')
    .map((c) => ({
      date: c.created_at.slice(0, 10),
      rating: (c.payload as unknown as CheckinPayload).rating as number,
    }))
    .filter((r) => typeof r.rating === 'number')
    .slice(0, 14)

  const checkinTrajectory = trajectoryOf(checkinRatings.map((r) => r.rating))

  const raceTimes = byType(details, 'race_pace')
    .map((r) => ({ row: r, p: r.payload as unknown as RacePacePayload }))
    .filter(({ p }) => p.mode === 'result')
    .map(({ row, p }) => ({ date: row.created_at.slice(0, 10), distance: p.distance, seconds: p.time_seconds, isPr: !!p.is_pr }))
    .slice(0, 10)

  const creationRateDelta = activity.reduce((sum, a) => sum + a.rateDelta, 0)

  return { checkinRatings, checkinTrajectory, raceTimes, creationRateDelta }
}

// Ratings arrive recent-first; reverse to chronological, then slope-sign the
// first vs second half. Needs at least 3 points to call a direction.
function trajectoryOf(recentFirst: number[]): Trends['checkinTrajectory'] {
  if (recentFirst.length < 3) return 'unknown'
  const chrono = [...recentFirst].reverse()
  const mid = Math.floor(chrono.length / 2)
  const firstHalf = chrono.slice(0, mid)
  const secondHalf = chrono.slice(chrono.length - mid)
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
  const delta = avg(secondHalf) - avg(firstHalf)
  if (delta > 0.5) return 'rising'
  if (delta < -0.5) return 'falling'
  return 'flat'
}

function computeOpenThreads(details: DetailRow[]): OpenThread[] {
  const threads: OpenThread[] = []

  for (const p of byType(details, 'prompt')) {
    const payload = p.payload as unknown as PromptPayload
    const used = (payload.use_count ?? 0) > 0 || !!payload.last_used_at
    if (!used) {
      threads.push({
        kind: 'unused_prompt',
        title: p.title,
        ageDays: daysBetween(p.created_at),
        detail: 'saved but never used',
      })
    }
  }

  for (const a of byType(details, 'article_note')) {
    const payload = a.payload as unknown as ArticleNotePayload
    // No "opened in Study Mode" flag exists yet; absence of a user_note is the
    // current proxy for "saved but never engaged with".
    if (!payload.user_note) {
      threads.push({
        kind: 'unopened_article',
        title: p_title(a.title),
        ageDays: daysBetween(a.created_at),
        detail: 'saved, no notes added',
      })
    }
  }

  // Repo scans with no follow-up review = a project seed not acted on.
  const reviews = byType(details, 'repo_review')
  for (const s of byType(details, 'repo_scan')) {
    const name = (s.payload as { name?: string }).name ?? s.title
    const reviewed = reviews.some((r) => (r.payload as { repo_full_name?: string }).repo_full_name?.includes(name))
    if (!reviewed && daysBetween(s.created_at) > 7) {
      threads.push({
        kind: 'stale_project',
        title: s.title,
        ageDays: daysBetween(s.created_at),
        detail: 'scanned but never reviewed',
      })
    }
  }

  // Oldest, most-neglected threads first; cap so the LLM prompt stays tight.
  return threads.sort((a, b) => b.ageDays - a.ageDays).slice(0, 12)
}

function p_title(title: string): string {
  return title.length > 60 ? `${title.slice(0, 60)}…` : title
}

// ─── findCrossToolPatterns ──────────────────────────────────────────────────
// Deterministic correlation surfacing — NO LLM. Consumes the snapshot plus a
// per-day activity matrix to find temporal co-occurrence, neglect, and
// divergence signals across tool boundaries.

export type PatternKind = 'temporal' | 'neglect' | 'divergence'

export interface CrossToolPattern {
  kind: PatternKind
  summary: string
  evidence: string[]
  strength: number // 0..1 rough confidence, for ranking
}

export async function findCrossToolPatterns(userId: string): Promise<CrossToolPattern[]> {
  const snapshot = await getContextSnapshot(userId, { days: 30 })

  // Pull a 60-day activity matrix (type × day) in one query for temporal work.
  const since = new Date(Date.now() - 60 * DAY_MS).toISOString()
  const { data, error } = await supabase
    .from('resources')
    .select('type, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
  if (error) console.error('[synthesis] pattern matrix error:', error)

  const rows = (data ?? []) as { type: ResourceType; created_at: string }[]
  const patterns: CrossToolPattern[] = []

  patterns.push(...temporalPatterns(rows))
  patterns.push(...neglectPatterns(snapshot))
  patterns.push(...divergencePatterns(snapshot))

  return patterns.sort((a, b) => b.strength - a.strength).slice(0, 8)
}

// Build a per-day set of active tool types, then look for ordered pairs where
// type A on day D is repeatedly followed by type B on day D+lag (lag 0..3).
function temporalPatterns(rows: { type: ResourceType; created_at: string }[]): CrossToolPattern[] {
  const dayTypes = new Map<string, Set<ResourceType>>()
  for (const r of rows) {
    const day = r.created_at.slice(0, 10)
    if (!dayTypes.has(day)) dayTypes.set(day, new Set())
    dayTypes.get(day)!.add(r.type)
  }
  const days = [...dayTypes.keys()].sort()
  if (days.length < 6) return []

  const dayIndex = new Map(days.map((d, i) => [d, i]))
  const toEpochDay = (d: string) => Math.floor(new Date(d).getTime() / DAY_MS)
  const epochOf = new Map(days.map((d) => [d, toEpochDay(d)]))

  const pairCounts = new Map<string, { count: number; lag: number; a: ResourceType; b: ResourceType }>()
  for (let i = 0; i < days.length; i++) {
    const dEpoch = epochOf.get(days[i])!
    const aTypes = dayTypes.get(days[i])!
    for (let j = i; j < days.length; j++) {
      const lag = epochOf.get(days[j])! - dEpoch
      if (lag < 0 || lag > 3) { if (lag > 3) break; else continue }
      const bTypes = dayTypes.get(days[j])!
      for (const a of aTypes) {
        for (const b of bTypes) {
          if (a === b || lag === 0) continue
          if (domainForType(a) === domainForType(b)) continue // cross-tool only
          const k = `${a}->${b}@${lag}`
          const cur = pairCounts.get(k) ?? { count: 0, lag, a, b }
          cur.count += 1
          pairCounts.set(k, cur)
        }
      }
    }
  }
  void dayIndex

  const out: CrossToolPattern[] = []
  for (const { count, lag, a, b } of pairCounts.values()) {
    if (count < 3) continue
    out.push({
      kind: 'temporal',
      summary: `${a} tends to precede ${b} by ${lag} day${lag === 1 ? '' : 's'}`,
      evidence: [`observed ${count} times in the last 60 days`],
      strength: Math.min(1, count / 6),
    })
  }
  return out
}

// A stated commitment in one tool with no supporting activity in the domain
// it implies. E.g. a race goal set, but training frequency near zero.
function neglectPatterns(snapshot: ContextSnapshot): CrossToolPattern[] {
  const out: CrossToolPattern[] = []

  for (const ev of snapshot.upcomingEvents) {
    if (ev.daysUntil > 14 || ev.domain !== 'training') continue
    if (snapshot.streaks.trainingFrequency7d === 0) {
      out.push({
        kind: 'neglect',
        summary: `${ev.title} is ${ev.daysUntil} days out with no training logged this week`,
        evidence: [`countdown: ${ev.title} (${ev.date})`, 'workout frequency (7d): 0'],
        strength: 0.9,
      })
    }
  }

  const unusedPrompts = snapshot.openThreads.filter((t) => t.kind === 'unused_prompt')
  if (unusedPrompts.length >= 5) {
    out.push({
      kind: 'neglect',
      summary: `${unusedPrompts.length} saved prompts have never been used`,
      evidence: unusedPrompts.slice(0, 3).map((t) => `"${t.title}" — ${t.ageDays}d old`),
      strength: 0.5,
    })
  }

  const staleArticles = snapshot.openThreads.filter((t) => t.kind === 'unopened_article')
  if (staleArticles.length >= 4) {
    out.push({
      kind: 'neglect',
      summary: `${staleArticles.length} saved articles have no notes — read-later pile is growing`,
      evidence: staleArticles.slice(0, 3).map((t) => `"${t.title}" — ${t.ageDays}d old`),
      strength: 0.45,
    })
  }

  return out
}

// Stated intent vs logged behavior: check-in trajectory falling while the user
// keeps creating goals; declining training against a race target, etc.
function divergencePatterns(snapshot: ContextSnapshot): CrossToolPattern[] {
  const out: CrossToolPattern[] = []

  if (
    snapshot.trends.checkinTrajectory === 'falling' &&
    snapshot.streaks.trainingFrequency7d < snapshot.streaks.trainingFrequency14d - snapshot.streaks.trainingFrequency7d
  ) {
    out.push({
      kind: 'divergence',
      summary: 'Check-in ratings are falling and training volume dropped in the last 7 days vs the prior week',
      evidence: [
        `check-in trajectory: falling (${snapshot.trends.checkinRatings.map((r) => r.rating).join(', ')})`,
        `workouts 7d: ${snapshot.streaks.trainingFrequency7d} vs prior 7d: ${snapshot.streaks.trainingFrequency14d - snapshot.streaks.trainingFrequency7d}`,
      ],
      strength: 0.8,
    })
  }

  const workout = snapshot.activity.find((a) => a.type === 'workout')
  if (workout && workout.rateDelta < 0 && snapshot.upcomingEvents.some((e) => e.domain === 'training')) {
    out.push({
      kind: 'divergence',
      summary: 'Training frequency is trending down while a competition is on the calendar',
      evidence: [
        `workout creation rate delta: ${workout.rateDelta}`,
        `next event: ${snapshot.upcomingEvents.find((e) => e.domain === 'training')!.title}`,
      ],
      strength: 0.75,
    })
  }

  return out
}

// ─── Serialization for LLM prompts ──────────────────────────────────────────
// Compact, human-readable rendering the Aperture / Chief of Staff / Root Cause
// features drop straight into a system or user message.
export function snapshotToText(snapshot: ContextSnapshot, patterns: CrossToolPattern[]): string {
  const lines: string[] = []
  lines.push(`# Henry's current state (as of ${snapshot.generatedAt.slice(0, 10)})`)
  lines.push(`Total resources across all tools: ${snapshot.totalResources}`)

  lines.push('\n## Activity by tool (recent window = last ' + snapshot.windowDays + ' days)')
  if (snapshot.activity.length === 0) lines.push('(no activity logged)')
  for (const a of snapshot.activity.sort((x, y) => y.recent - x.recent)) {
    const last = a.daysSinceLast === null ? 'never' : a.daysSinceLast === 0 ? 'today' : `${a.daysSinceLast}d ago`
    lines.push(`- ${a.type}: ${a.total} total, ${a.recent} recent (Δ${a.rateDelta >= 0 ? '+' : ''}${a.rateDelta} vs prior window), last ${last}`)
  }

  lines.push('\n## Streaks & consistency')
  lines.push(`- best habit streak: ${snapshot.streaks.habitStreak ?? 'none'}`)
  lines.push(`- days since last check-in: ${snapshot.streaks.checkinGapDays ?? 'no check-ins'}`)
  lines.push(`- workouts last 7d / 14d: ${snapshot.streaks.trainingFrequency7d} / ${snapshot.streaks.trainingFrequency14d}`)

  if (snapshot.upcomingEvents.length) {
    lines.push('\n## Upcoming events')
    for (const e of snapshot.upcomingEvents) lines.push(`- ${e.title} in ${e.daysUntil}d (${e.date}, ${e.eventType})`)
  }

  lines.push('\n## Trends')
  lines.push(`- check-in trajectory: ${snapshot.trends.checkinTrajectory}${snapshot.trends.checkinRatings.length ? ` [${snapshot.trends.checkinRatings.map((r) => r.rating).join(', ')}]` : ''}`)
  if (snapshot.trends.raceTimes.length) {
    lines.push(`- recent races: ${snapshot.trends.raceTimes.map((r) => `${r.distance} ${r.seconds}s${r.isPr ? ' (PR)' : ''}`).join(', ')}`)
  }
  lines.push(`- overall creation-rate delta: ${snapshot.trends.creationRateDelta >= 0 ? '+' : ''}${snapshot.trends.creationRateDelta}`)

  if (snapshot.openThreads.length) {
    lines.push('\n## Open threads (started, not followed through)')
    for (const t of snapshot.openThreads.slice(0, 8)) lines.push(`- [${t.kind}] "${t.title}" — ${t.detail} (${t.ageDays}d)`)
  }

  if (patterns.length) {
    lines.push('\n## Detected cross-tool patterns')
    for (const p of patterns) lines.push(`- [${p.kind}] ${p.summary} — ${p.evidence.join('; ')}`)
  }

  return lines.join('\n')
}
