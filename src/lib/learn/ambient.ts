import { supabase } from '../supabase'
import { localParts } from '../cruise/schedule'

// Ambient Mode — passive SMS probing. A background layer (NOT a tab): a cron
// tick decides whether to text the user one due claim, and an inbound webhook
// records their reply into claim_events exactly like an in-app probe.
//
// This module is the whole decision + parsing surface. It is deliberately
// build-complete but NOT scheduled and NOT wired to a real SMS provider —
// sendAmbientSms is a stub (there is no Twilio/etc. in this repo yet). See
// LEARN.md's Ambient contract and the [PAUSE] items in OVERNIGHT.md.

export const AMBIENT_SETTINGS_TYPE = 'learn_ambient_settings'

export interface AmbientSettings {
  enabled: boolean
  phone: string | null
  max_per_day: number          // default 2
  quiet_start_hour: number     // default 22 (10pm) — no sends at/after this local hour
  quiet_end_hour: number       // default 8  (8am)  — resume sends at/after this local hour
  timezone: string             // IANA, e.g. 'America/New_York'
}

export const DEFAULT_AMBIENT: AmbientSettings = {
  enabled: false,
  phone: null,
  max_per_day: 2,
  quiet_start_hour: 22,
  quiet_end_hour: 8,
  timezone: 'America/New_York',
}

interface AmbientPayload extends AmbientSettings {
  // One probe awaiting a reply. Set on send, cleared on reply. While set, the
  // cron does NOT send again — "if a response doesn't arrive, don't nag."
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
    phone: p.phone ?? DEFAULT_AMBIENT.phone,
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

// The one probe message template. Kept here (not inline in the cron) so it's a
// single reviewable string — see OVERNIGHT.md [PAUSE].
export function buildProbeMessage(claimContent: string): string {
  return `enry: quick check — in a sentence, what's the deal with: "${claimContent}"? Reply here to log it. (Txt STOP to pause.)`
}

// SMS SEND — STUB. There is no SMS provider wired in this repo. This function
// NEVER sends; it returns a stubbed result so the cron's decision path is fully
// exercisable without touching a phone. Wiring a provider (Twilio, etc.) means
// replacing this body — nothing else in the flow changes.
export async function sendAmbientSms(phone: string, message: string): Promise<{ sent: boolean; stubbed: true }> {
  console.log(`[ambient] STUB send → ${phone.slice(0, 3)}***: ${message.slice(0, 60)}…`)
  return { sent: false, stubbed: true }
}

// Reason strings the cron reports per user, so a dry run is legible.
export type AmbientDecision = 'sent' | 'quiet_hours' | 'daily_cap' | 'awaiting_reply' | 'nothing_due' | 'disabled' | 'no_phone'

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

// Evaluate + (stub-)send one user's ambient probe. Pure decision logic; the
// actual "send" is the stub above. Returns the decision for the cron summary.
export async function runAmbientForRow(row: AmbientRow, now: Date): Promise<AmbientDecision> {
  const s: AmbientSettings = {
    enabled: row.payload.enabled ?? false,
    phone: row.payload.phone ?? null,
    max_per_day: row.payload.max_per_day ?? DEFAULT_AMBIENT.max_per_day,
    quiet_start_hour: row.payload.quiet_start_hour ?? DEFAULT_AMBIENT.quiet_start_hour,
    quiet_end_hour: row.payload.quiet_end_hour ?? DEFAULT_AMBIENT.quiet_end_hour,
    timezone: row.payload.timezone ?? DEFAULT_AMBIENT.timezone,
  }
  if (!s.enabled) return 'disabled'
  if (!s.phone) return 'no_phone'
  if (isQuietHours(now, s)) return 'quiet_hours'
  if (row.payload.pending) return 'awaiting_reply' // don't nag

  const localDate = localParts(now, s.timezone).date
  const countToday = row.payload.sends_local_date === localDate ? (row.payload.sends_count ?? 0) : 0
  if (countToday >= s.max_per_day) return 'daily_cap'

  const due = await nextDueClaim(row.userId)
  if (!due) return 'nothing_due' // silence is fine

  const asked_at = now.toISOString()
  await sendAmbientSms(s.phone, buildProbeMessage(due.content))
  // Mirror an in-app probe: write probe_asked (via ambient) so activity/fog
  // reflect it, and park the pending probe + bump the daily counter.
  await supabase.from('claim_events').insert({ claim_id: due.id, event_type: 'probe_asked', payload: { content: due.content, via: 'ambient' } })
  const merged: AmbientPayload = {
    ...row.payload, ...s,
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

// Inbound reply → record like an in-app probe answer. Finds the user by phone,
// writes answer_recorded (via ambient), advances next_probe_at using the
// claim's half_life, clears pending. Returns what happened.
export async function recordAmbientReply(fromPhone: string, body: string): Promise<{ ok: boolean; reason: string }> {
  const answer = body.trim()
  if (!answer) return { ok: false, reason: 'empty_body' }

  const rows = await loadRows()
  const norm = (p: string | null) => (p ?? '').replace(/[^\d]/g, '').slice(-10)
  const row = rows.find((r) => norm(r.payload.phone ?? null) === norm(fromPhone) && norm(fromPhone).length >= 10)
  if (!row) return { ok: false, reason: 'unknown_sender' }
  const pending = row.payload.pending
  if (!pending) return { ok: false, reason: 'no_pending_probe' }

  const { error: evErr } = await supabase.from('claim_events').insert({
    claim_id: pending.claim_id,
    event_type: 'answer_recorded',
    payload: { answer, asked_at: pending.asked_at, via: 'ambient' },
  })
  if (evErr) return { ok: false, reason: `event_insert_failed:${evErr.message}` }

  const { data: claim } = await supabase.from('claims').select('half_life').eq('id', pending.claim_id).maybeSingle()
  const halfLife = (claim?.half_life as number) ?? 24
  const now = new Date()
  const nextProbeAt = new Date(now.getTime() + halfLife * 3_600_000).toISOString()
  await supabase.from('claims').update({ last_probed_at: now.toISOString(), next_probe_at: nextProbeAt, updated_at: now.toISOString() }).eq('id', pending.claim_id)

  await supabase.from('resources').update({ payload: { ...row.payload, pending: null } }).eq('id', row.resourceId)
  return { ok: true, reason: 'recorded' }
}
