// DST-safe schedule evaluation for Cruise Auto-run.
//
// The one rule that matters: NEVER precompute a future local time into a fixed
// UTC instant (storing `localTime - fixedOffset` is the DST bug — the offset is
// wrong on the far side of a transition). Instead, every tick we read the
// CURRENT wall-clock in the repo's IANA zone via Intl and compare it to the
// stored "HH:MM". Because we only ever ask "what time is it there right now,"
// there is no offset to get wrong across spring-forward / fall-back.

import type { AutoRunConfig } from './types'

export interface LocalParts {
  date: string // YYYY-MM-DD in the zone
  minutes: number // minutes since local midnight
  weekday: number // 0=Sun..6=Sat
}

// Current wall-clock in `tz`, as a local date-string + minutes-since-midnight +
// weekday. en-CA formats as YYYY-MM-DD; h23 gives 00–23 hours. Weekday is
// derived from the local date-string (not the instant) so it's the local day.
export function localParts(now: Date, tz: string): LocalParts {
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(now) // "HH:MM"
  const [h, m] = time.split(':').map(Number)
  const [y, mo, d] = dateStr.split('-').map(Number)
  // getUTCDay of the local Y/M/D gives that calendar day's weekday, independent
  // of zone/DST (we're treating the date as a bare calendar date here).
  const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay()
  return { date: dateStr, minutes: h * 60 + m, weekday }
}

export function parseHM(hm: string | null): number | null {
  if (!hm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return null
  const h = Number(m[1]), min = Number(m[2])
  if (h < 0 || h > 23 || min < 0 || min > 59) return null
  return h * 60 + min
}

// Whole calendar days between two YYYY-MM-DD strings (date-only math, so DST is
// irrelevant — no clocks involved).
export function daysBetween(fromDate: string, toDate: string): number {
  const [ay, am, ad] = fromDate.split('-').map(Number)
  const [by, bm, bd] = toDate.split('-').map(Number)
  const a = Date.UTC(ay, am - 1, ad), b = Date.UTC(by, bm - 1, bd)
  return Math.round((b - a) / 86_400_000)
}

export interface DueResult { due: boolean; reason: string }

// Is this repo's schedule due to fire as of `now`? Due iff: today (local) hasn't
// already fired, the local time is at/after the scheduled minute, and the
// frequency gate passes. A missed tick self-heals (the next tick still fires,
// once, because last_fired is an earlier date); a fully-missed day is skipped.
export function isScheduleDue(cfg: AutoRunConfig, now: Date): DueResult {
  if (!cfg.auto_run_enabled) return { due: false, reason: 'auto-run disabled' }
  if (!cfg.auto_run_tz || !cfg.auto_run_time || !cfg.auto_run_frequency) {
    return { due: false, reason: 'schedule incomplete' }
  }
  const sched = parseHM(cfg.auto_run_time)
  if (sched == null) return { due: false, reason: 'bad time' }

  let p: LocalParts
  try { p = localParts(now, cfg.auto_run_tz) } catch { return { due: false, reason: 'bad timezone' } }

  if (cfg.auto_run_last_fired_local_date === p.date) return { due: false, reason: 'already fired today' }
  if (p.minutes < sched) return { due: false, reason: 'before scheduled time' }

  switch (cfg.auto_run_frequency) {
    case 'daily':
      break
    case 'weekly':
      if (p.weekday !== cfg.auto_run_weekday) return { due: false, reason: 'not the scheduled weekday' }
      break
    case 'every_n_days': {
      const n = cfg.auto_run_interval_days ?? 0
      if (n < 1) return { due: false, reason: 'bad interval' }
      const anchor = cfg.auto_run_anchor_date ?? p.date
      if (daysBetween(anchor, p.date) % n !== 0) return { due: false, reason: `not an every-${n}-days day` }
      break
    }
    default:
      return { due: false, reason: 'unknown frequency' }
  }
  return { due: true, reason: 'due' }
}

// Next future local occurrence, for the "next auto-run: …" label. Display-only:
// walks forward day-by-day in the zone from `now`, up to ~370 days.
export function nextRun(cfg: AutoRunConfig, now: Date): Date | null {
  const sched = parseHM(cfg.auto_run_time)
  if (!cfg.auto_run_enabled || !cfg.auto_run_tz || sched == null || !cfg.auto_run_frequency) return null
  const tz = cfg.auto_run_tz
  const startMin = (() => { try { return localParts(now, tz).minutes } catch { return null } })()
  if (startMin == null) return null

  for (let offset = 0; offset <= 370; offset++) {
    const probe = new Date(now.getTime() + offset * 86_400_000)
    let p: LocalParts
    try { p = localParts(probe, tz) } catch { return null }
    // Skip today if we're already past the scheduled minute.
    if (offset === 0 && startMin >= sched) continue
    let ok = false
    if (cfg.auto_run_frequency === 'daily') ok = true
    else if (cfg.auto_run_frequency === 'weekly') ok = p.weekday === cfg.auto_run_weekday
    else if (cfg.auto_run_frequency === 'every_n_days') {
      const n = cfg.auto_run_interval_days ?? 0
      ok = n >= 1 && daysBetween(cfg.auto_run_anchor_date ?? p.date, p.date) % n === 0
    }
    if (ok) return zonedTimeToInstant(p.date, sched, tz)
  }
  return null
}

// The UTC instant for a local date + minute-of-day in `tz`, DST-safe. Used ONLY
// for the display "next run" label — never for the due check. Computes the
// zone's offset at the target and refines once for the transition edge.
function zonedTimeToInstant(dateStr: string, minutes: number, tz: string): Date {
  const [y, mo, d] = dateStr.split('-').map(Number)
  const guess = Date.UTC(y, mo - 1, d, Math.floor(minutes / 60), minutes % 60)
  const off1 = tzOffsetMs(tz, new Date(guess))
  let inst = guess - off1
  const off2 = tzOffsetMs(tz, new Date(inst))
  if (off2 !== off1) inst = guess - off2
  return new Date(inst)
}

// Offset (local - UTC, ms) that `tz` was at for the given instant.
function tzOffsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(at)
  const m: Record<string, number> = {}
  for (const p of parts) if (p.type !== 'literal') m[p.type] = Number(p.value)
  const asUTC = Date.UTC(m.year, m.month - 1, m.day, m.hour % 24, m.minute, m.second)
  return asUTC - at.getTime()
}
