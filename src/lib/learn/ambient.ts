import webpush from 'web-push'
import { supabase } from '../supabase'
import { localParts } from '../cruise/schedule'

// Ambient Mode — passive Web Push probing. A background layer (NOT a tab): a
// cron tick decides whether to push-notify the user about one due claim.
// There is no reply channel — a push notification is a summons, not a
// two-way channel. Clicking it opens Learn's Chat tab at /learn?probe=1,
// which auto-runs the real `probe` verb (src/app/learn/page.tsx), and the
// user's typed answer goes through the exact same in-app probe-answer path
// (recordAnswer in learn-ops.ts) as any other probe — this module has no
// answer-recording logic of its own.
//
// This module is the whole decision + send surface. See LEARN.md's Ambient
// contract for the full design.

export const AMBIENT_SETTINGS_TYPE = 'learn_ambient_settings'

export interface PushSubscriptionData {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

export interface AmbientSettings {
  enabled: boolean
  push_subscription: PushSubscriptionData | null
  max_per_day: number          // default 2
  quiet_start_hour: number     // default 22 (10pm) — no sends at/after this local hour
  quiet_end_hour: number       // default 8  (8am)  — resume sends at/after this local hour
  timezone: string             // IANA, e.g. 'America/New_York'
}

export const DEFAULT_AMBIENT: AmbientSettings = {
  enabled: false,
  push_subscription: null,
  max_per_day: 2,
  quiet_start_hour: 22,
  quiet_end_hour: 8,
  timezone: 'America/New_York',
}

interface AmbientPayload extends AmbientSettings {
  // One probe awaiting engagement. Set on send, cleared once the claim's
  // next_probe_at moves past asked_at (proof it was actually answered via the
  // normal probe path) or once PENDING_TIMEOUT_MS elapses ("don't nag, move
  // on"). While set and not timed out, the cron does NOT send again.
  pending?: { claim_id: string; content: string; asked_at: string } | null
  // Daily send counter, reset when the local date rolls (same pattern as
  // cruise-tick's monthly cap counter).
  sends_local_date?: string
  sends_count?: number
}

interface AmbientRow {
  resourceId: string
  userId: string
  payload: AmbientPayload
}

export async function getAmbientSettings(userId: string): Promise<AmbientSettings> {
  const { data } = await supabase
    .from('resources')
    .select('payload')
    .eq('user_id', userId)
    .eq('type', AMBIENT_SETTINGS_TYPE)
    .maybeSingle()
  const p = (data?.payload ?? {}) as Partial<AmbientPayload>
  return {
    enabled: p.enabled ?? DEFAULT_AMBIENT.enabled,
    push_subscription: p.push_subscription ?? DEFAULT_AMBIENT.push_subscription,
    max_per_day: p.max_per_day ?? DEFAULT_AMBIENT.max_per_day,
    quiet_start_hour: p.quiet_start_hour ?? DEFAULT_AMBIENT.quiet_start_hour,
    quiet_end_hour: p.quiet_end_hour ?? DEFAULT_AMBIENT.quiet_end_hour,
    timezone: p.timezone ?? DEFAULT_AMBIENT.timezone,
  }
}

export async function saveAmbientSettings(userId: string, patch: Partial<AmbientSettings>): Promise<AmbientSettings> {
  const { data: existing } = await supabase
    .from('resources')
    .select('id, payload')
    .eq('user_id', userId)
    .eq('type', AMBIENT_SETTINGS_TYPE)
    .maybeSingle()
  const current = (existing?.payload ?? {}) as AmbientPayload
  const merged: AmbientPayload = { ...DEFAULT_AMBIENT, ...current, ...patch }

  if (existing) {
    await supabase.from('resources').update({ payload: merged }).eq('id', existing.id)
  } else {
    await supabase.from('resources').insert({ user_id: userId, type: AMBIENT_SETTINGS_TYPE, source: 'user', title: 'Ambient settings', payload: merged })
  }
  return getAmbientSettings(userId)
}

// Quiet-hours check in the user's local time. Handles the usual overnight
// window (start 22 > end 8 wraps midnight) and the non-wrapping case.
export function isQuietHours(now: Date, settings: AmbientSettings): boolean {
  const { minutes } = localParts(now, settings.timezone)
  const start = settings.quiet_start_hour * 60
  const end = settings.quiet_end_hour * 60
  if (start === end) return false
  return start > end ? minutes >= start || minutes < end : minutes >= start && minutes < end
}

// The notification a due probe becomes. `data.url` is what the service
// worker's notificationclick handler opens/focuses — Learn's Chat tab,
// pre-loaded to auto-run `probe` (same claim, since both this module's
// nextDueClaim and the in-app probe's selectDueClaim order by next_probe_at
// ascending — whichever claim is actually next-due when the user engages).
export interface ProbePushPayload {
  title: string
  body: string
  data: { url: string; claim_id: string }
}

export function buildProbePushPayload(claimId: string, claimContent: string): ProbePushPayload {
  return {
    title: 'enry — quick check',
    body: claimContent,
    data: { url: '/learn?probe=1', claim_id: claimId },
  }
}

// PUSH SEND — real Web Push (VAPID), credential-gated. When VAPID keys are
// present this actually sends via the browser's push service; when they're
// absent it degrades to a logged no-op (stubbed) so the cron's decision path
// stays fully exercisable without keys. Credentials needed (env):
//   NEXT_PUBLIC_VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
//   VAPID_SUBJECT        (a 'mailto:' address or 'https:' URL, per the spec)
export interface PushResult { sent: boolean; stubbed: boolean; expired?: boolean; error?: string }

export function pushConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT)
}

export async function sendAmbientPush(subscription: PushSubscriptionData, payload: ProbePushPayload): Promise<PushResult> {
  if (!pushConfigured()) {
    console.log(`[ambient] STUB send (no VAPID keys) → ${subscription.endpoint.slice(0, 40)}…: ${payload.body.slice(0, 60)}…`)
    return { sent: false, stubbed: true }
  }

  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!)

  try {
    await webpush.sendNotification(subscription, JSON.stringify(payload))
    return { sent: true, stubbed: false }
  } catch (e) {
    const err = e as { statusCode?: number; message?: string }
    // 404 (Not Found) and 410 (Gone) mean the push service has invalidated
    // this subscription — the browser unregistered it, the user cleared site
    // data, etc. That's an expiry, not a transient failure.
    if (err.statusCode === 404 || err.statusCode === 410) {
      console.log(`[ambient] push subscription expired (${err.statusCode})`)
      return { sent: false, stubbed: false, expired: true, error: `push_${err.statusCode}` }
    }
    console.error('[ambient] push send failed:', err.statusCode, err.message)
    return { sent: false, stubbed: false, error: `push_${err.statusCode ?? 'exception'}` }
  }
}

// Reason strings the cron reports per user, so a dry run is legible.
export type AmbientDecision =
  | 'sent' | 'quiet_hours' | 'daily_cap' | 'awaiting_engagement' | 'nothing_due'
  | 'disabled' | 'no_subscription' | 'send_failed' | 'subscription_expired'

async function loadRows(): Promise<AmbientRow[]> {
  const { data } = await supabase
    .from('resources')
    .select('id, user_id, payload')
    .eq('type', AMBIENT_SETTINGS_TYPE)
  return (data ?? []).map((r) => ({ resourceId: r.id, userId: r.user_id as string, payload: (r.payload ?? {}) as AmbientPayload }))
}

async function nextDueClaim(userId: string): Promise<{ id: string; content: string } | null> {
  const nowIso = new Date().toISOString()
  const { data } = await supabase
    .from('claims')
    .select('id, content')
    .eq('user_id', userId)
    .eq('status', 'active')
    .or(`next_probe_at.is.null,next_probe_at.lte.${nowIso}`)
    .order('next_probe_at', { ascending: true, nullsFirst: true })
    .limit(1)
    .maybeSingle()
  return (data as { id: string; content: string }) ?? null
}

// A pending probe is "resolved" once the claim's next_probe_at has moved past
// asked_at — which only happens via the in-app probe-answer path's
// recordAnswer (it bumps next_probe_at forward by half_life on a real
// answer). No separate write path needed — this reads the same fact the
// answer path already produced.
async function pendingIsResolved(pending: NonNullable<AmbientPayload['pending']>): Promise<boolean> {
  const { data } = await supabase.from('claims').select('next_probe_at').eq('id', pending.claim_id).maybeSingle()
  if (!data?.next_probe_at) return false
  return new Date(data.next_probe_at).getTime() > new Date(pending.asked_at).getTime()
}

// "If a response doesn't arrive in a reasonable window, don't nag — move on."
// There's no reply webhook to clear `pending` anymore, so this is the only
// thing that lifts the one-in-flight guard when the user never engages.
const PENDING_TIMEOUT_MS = 24 * 60 * 60 * 1000

// Evaluate + send one user's ambient probe. Pure decision logic aside from the
// actual send call. Returns the decision for the cron summary.
export async function runAmbientForRow(row: AmbientRow, now: Date): Promise<AmbientDecision> {
  const s: AmbientSettings = {
    enabled: row.payload.enabled ?? false,
    push_subscription: row.payload.push_subscription ?? null,
    max_per_day: row.payload.max_per_day ?? DEFAULT_AMBIENT.max_per_day,
    quiet_start_hour: row.payload.quiet_start_hour ?? DEFAULT_AMBIENT.quiet_start_hour,
    quiet_end_hour: row.payload.quiet_end_hour ?? DEFAULT_AMBIENT.quiet_end_hour,
    timezone: row.payload.timezone ?? DEFAULT_AMBIENT.timezone,
  }
  if (!s.enabled) return 'disabled'
  if (!s.push_subscription) return 'no_subscription'
  if (isQuietHours(now, s)) return 'quiet_hours'

  let payload = row.payload
  if (payload.pending) {
    const timedOut = now.getTime() - new Date(payload.pending.asked_at).getTime() > PENDING_TIMEOUT_MS
    const resolved = await pendingIsResolved(payload.pending)
    if (!resolved && !timedOut) return 'awaiting_engagement'
    // Resolved or abandoned — lift the guard and persist the clear so future
    // ticks don't redo this check for a stale flag.
    payload = { ...payload, pending: null }
    await supabase.from('resources').update({ payload }).eq('id', row.resourceId)
  }

  const localDate = localParts(now, s.timezone).date
  const countToday = payload.sends_local_date === localDate ? (payload.sends_count ?? 0) : 0
  if (countToday >= s.max_per_day) return 'daily_cap'

  const due = await nextDueClaim(row.userId)
  if (!due) return 'nothing_due' // silence is fine

  const asked_at = now.toISOString()
  const send = await sendAmbientPush(s.push_subscription, buildProbePushPayload(due.id, due.content))

  if (send.expired) {
    // Invalidate the dead subscription so the UI can prompt a resubscribe.
    // Per spec: expiry behaves like send_failed — no cap consumed, no pending
    // parked.
    await supabase.from('resources').update({ payload: { ...payload, push_subscription: null } }).eq('id', row.resourceId)
    return 'subscription_expired'
  }
  // A real provider error (keys present but the push service rejected it)
  // must NOT consume the daily cap or park a pending probe — leave it due so
  // the next tick retries. A stubbed no-op (no keys) still advances the flow
  // so the decision path stays exercisable in a dry run.
  if (!send.sent && !send.stubbed) return 'send_failed'

  // Mirror an in-app probe: write probe_asked (via ambient) so activity/fog
  // reflect it, and park the pending probe + bump the daily counter.
  await supabase.from('claim_events').insert({ claim_id: due.id, event_type: 'probe_asked', payload: { content: due.content, via: 'ambient' } })
  const merged: AmbientPayload = {
    ...payload, ...s,
    pending: { claim_id: due.id, content: due.content, asked_at },
    sends_local_date: localDate,
    sends_count: countToday + 1,
  }
  await supabase.from('resources').update({ payload: merged }).eq('id', row.resourceId)
  return 'sent'
}

export async function runAmbientTick(now: Date = new Date()): Promise<{ evaluated: number; sent: number; decisions: { userId: string; decision: AmbientDecision }[] }> {
  const rows = await loadRows()
  const decisions: { userId: string; decision: AmbientDecision }[] = []
  for (const row of rows) {
    try {
      decisions.push({ userId: row.userId, decision: await runAmbientForRow(row, now) })
    } catch (e) {
      console.error('[ambient] row threw:', row.userId, e)
    }
  }
  return { evaluated: rows.length, sent: decisions.filter((d) => d.decision === 'sent').length, decisions }
}
