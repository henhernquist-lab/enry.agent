'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { Timer, Flag, Trophy, Loader2 } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { loadResources, type Resource, type RacePacePayload } from '@/lib/resources'

// ── types ──────────────────────────────────────────────────────

type Strategy = 'even' | 'negative' | 'race_model'
type InternalMode = 'calculator' | 'log'

interface SplitRow {
  label: string
  seconds: number
  cumulative: number
}

interface CalcResult {
  distance: string
  distanceMeters: number
  totalSeconds: number
  splits: SplitRow[]
  paceCards: { label: string; value: string }[]
}

// ── constants ──────────────────────────────────────────────────

export const RACE_DISTANCES = [
  { label: '100m',            value: '100m',   meters: 100  },
  { label: '200m',            value: '200m',   meters: 200  },
  { label: '400m',            value: '400m',   meters: 400  },
  { label: '800m',            value: '800m',   meters: 800  },
  { label: '1600m / Mile',    value: '1600m',  meters: 1600 },
  { label: '3200m / 2 Mile',  value: '3200m',  meters: 3200 },
  { label: '5K',              value: '5K',     meters: 5000 },
  { label: 'Custom…',         value: 'custom', meters: 0    },
]

const STRATEGIES: { value: Strategy; label: string }[] = [
  { value: 'even',       label: 'Even' },
  { value: 'negative',   label: 'Negative' },
  { value: 'race_model', label: 'Race model' },
]

// Fractional split weights for each distance — must sum to 1.0
const RACE_MODEL_WEIGHTS: Record<string, number[]> = {
  '200m':  [0.480, 0.520],
  '400m':  [0.235, 0.245, 0.255, 0.265],
  '800m':  [0.245, 0.260, 0.265, 0.230],
  '1600m': [0.245, 0.255, 0.260, 0.240],
  '3200m': [0.122, 0.127, 0.128, 0.128, 0.127, 0.127, 0.127, 0.114],
  '5K':    [0.205, 0.202, 0.200, 0.198, 0.195],
}

// ── pure helpers ───────────────────────────────────────────────

export function parseTime(raw: string): number | null {
  const s = raw.trim()
  const m = s.match(/^(?:(\d+):)?(\d+)(?:[.,](\d+))?$/)
  if (!m) return null
  const mins = m[1] ? parseInt(m[1], 10) : 0
  const secs = parseInt(m[2], 10)
  const frac = m[3] ? parseFloat(`0.${m[3]}`) : 0
  const total = mins * 60 + secs + frac
  return total > 0 && total < 86400 ? total : null
}

export function fmtSecs(s: number): string {
  if (s < 60) return s.toFixed(2)
  const m = Math.floor(s / 60)
  const r = s - m * 60
  return `${m}:${r < 10 ? '0' : ''}${r.toFixed(2)}`
}

function getSplitInterval(dist: number): number {
  if (dist <= 200) return 100
  if (dist <= 1000) return 200
  if (dist < 5000) return 400
  return 1000
}

function buildCheckpoints(distMeters: number): number[] {
  const interval = getSplitInterval(distMeters)
  const pts: number[] = []
  for (let d = interval; d < distMeters; d += interval) pts.push(d)
  pts.push(distMeters)
  return pts
}

function computeCumulativeTimes(
  pts: number[],
  distMeters: number,
  distValue: string,
  totalSecs: number,
  strategy: Strategy,
): number[] {
  let strat = strategy
  if (strat === 'race_model') {
    const weights = RACE_MODEL_WEIGHTS[distValue]
    if (weights && weights.length === pts.length) {
      let acc = 0
      return weights.map((w) => { acc += w * totalSecs; return acc })
    }
    strat = 'negative'
  }
  if (strat === 'negative') {
    return pts.map((d) => {
      const f = d / distMeters
      return f <= 0.5
        ? totalSecs * 0.51 * (f / 0.5)
        : totalSecs * (0.51 + 0.49 * ((f - 0.5) / 0.5))
    })
  }
  // even
  return pts.map((d) => totalSecs * (d / distMeters))
}

export function computeSplits(
  distValue: string,
  distMeters: number,
  totalSecs: number,
  strategy: Strategy,
): SplitRow[] {
  const interval = getSplitInterval(distMeters)
  const pts = buildCheckpoints(distMeters)
  const cums = computeCumulativeTimes(pts, distMeters, distValue, totalSecs, strategy)

  return pts.map((d, i) => ({
    label: interval === 400
      ? `Lap ${i + 1}`
      : interval === 1000
      ? `${d / 1000}K`
      : `${d}m`,
    seconds: cums[i] - (i > 0 ? cums[i - 1] : 0),
    cumulative: cums[i],
  }))
}

function buildPaceCards(distMeters: number, totalSecs: number): { label: string; value: string }[] {
  const cards: { label: string; value: string }[] = []
  if (distMeters <= 400) cards.push({ label: 'per 100m', value: fmtSecs(totalSecs / (distMeters / 100)) })
  cards.push({ label: 'per lap', value: fmtSecs(totalSecs / (distMeters / 400)) })
  if (distMeters >= 800)  cards.push({ label: 'per km',   value: fmtSecs(totalSecs / (distMeters / 1000)) })
  if (distMeters >= 1600) cards.push({ label: 'per mile', value: fmtSecs(totalSecs / (distMeters / 1609.34)) })
  return cards
}

// ── component ──────────────────────────────────────────────────

interface RacePaceCalculatorProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function RacePaceCalculator({ onClose, mode = 'modal', onSave }: RacePaceCalculatorProps) {
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<InternalMode>(searchParams.get('tab') === 'log' ? 'log' : 'calculator')

  // Calculator state
  const [calcDist, setCalcDist] = useState('400m')
  const [calcCustomM, setCalcCustomM] = useState('')
  const [calcTime, setCalcTime] = useState('')
  const [calcStrat, setCalcStrat] = useState<Strategy>('even')
  const [calcResult, setCalcResult] = useState<CalcResult | null>(null)
  const [calcError, setCalcError] = useState('')
  const [calcSaving, setCalcSaving] = useState(false)
  const [calcSaved, setCalcSaved] = useState(false)

  // Log state
  const [logDist, setLogDist] = useState('400m')
  const [logCustomM, setLogCustomM] = useState('')
  const [logTime, setLogTime] = useState('')
  const [logDate, setLogDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [logMeet, setLogMeet] = useState('')
  const [logNotes, setLogNotes] = useState('')
  const [logSplitStr, setLogSplitStr] = useState('')
  const [logging, setLogging] = useState(false)
  const [loggedPR, setLoggedPR] = useState<boolean | null>(null)
  const [logError, setLogError] = useState('')

  // History for PR detection (loaded once on mount)
  const [history, setHistory] = useState<Resource[]>([])

  useEffect(() => {
    loadResources('race_pace').then(setHistory).catch(console.error)
  }, [])

  function resolveMeters(distValue: string, customStr: string): number {
    if (distValue === 'custom') return parseInt(customStr, 10) || 0
    return RACE_DISTANCES.find((d) => d.value === distValue)?.meters ?? 0
  }

  // ── calculator ─────────────────────────────────────────────

  const handleCalculate = () => {
    setCalcError('')
    setCalcResult(null)
    const totalSecs = parseTime(calcTime)
    if (!totalSecs) {
      setCalcError('Invalid time — use e.g. 53.00 or 1:53.45')
      return
    }
    const distMeters = resolveMeters(calcDist, calcCustomM)
    if (!distMeters || distMeters < 50 || distMeters > 100000) {
      setCalcError('Invalid distance')
      return
    }
    const splits = computeSplits(calcDist, distMeters, totalSecs, calcStrat)
    const paceCards = buildPaceCards(distMeters, totalSecs)
    setCalcResult({ distance: calcDist, distanceMeters: distMeters, totalSeconds: totalSecs, splits, paceCards })
  }

  const handleSaveCalc = async () => {
    if (!calcResult) return
    setCalcSaving(true)
    const distLabel = RACE_DISTANCES.find((d) => d.value === calcDist)?.label ?? calcDist
    await fetch('/api/resources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'race_pace',
        title: `${distLabel} — goal ${fmtSecs(calcResult.totalSeconds)}`,
        payload: {
          mode: 'calculation',
          distance: calcDist,
          distance_meters: calcResult.distanceMeters,
          time_seconds: calcResult.totalSeconds,
          splits: calcResult.splits.map((s) => s.seconds),
          strategy: calcStrat,
        } satisfies RacePacePayload,
      }),
    }).catch(console.error)
    setCalcSaving(false)
    setCalcSaved(true)
    setTimeout(() => setCalcSaved(false), 2000)
    onSave?.()
  }

  // ── log ────────────────────────────────────────────────────

  const handleLog = async () => {
    setLogError('')
    const totalSecs = parseTime(logTime)
    if (!totalSecs) { setLogError('Invalid time'); return }
    const distMeters = resolveMeters(logDist, logCustomM)
    if (!distMeters) { setLogError('Invalid distance'); return }

    const prevTimes = history
      .filter((r) => {
        const p = r.payload as RacePacePayload
        return p.mode === 'result' && p.distance === logDist
      })
      .map((r) => (r.payload as RacePacePayload).time_seconds)

    const isPR = prevTimes.length === 0 || totalSecs < Math.min(...prevTimes)

    setLogging(true)
    try {
      const distLabel = RACE_DISTANCES.find((d) => d.value === logDist)?.label ?? logDist
      const splitArr = logSplitStr
        .split(',')
        .map((s) => parseTime(s.trim()))
        .filter((n): n is number => n !== null)

      const payload: RacePacePayload = {
        mode: 'result',
        distance: logDist,
        distance_meters: distMeters,
        time_seconds: totalSecs,
        date: logDate,
        is_pr: isPR,
        ...(splitArr.length > 0 && { splits: splitArr }),
        ...(logMeet.trim() && { meet: logMeet.trim() }),
        ...(logNotes.trim() && { notes: logNotes.trim() }),
      }

      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'race_pace',
          title: `${distLabel} — ${fmtSecs(totalSecs)}${logMeet.trim() ? ` @ ${logMeet.trim()}` : ''}`,
          payload,
        }),
      })
      if (!res.ok) throw new Error('save failed')

      const { resource } = await res.json() as { resource?: Resource }
      if (resource) setHistory((prev) => [resource, ...prev])

      setLoggedPR(isPR)
      onSave?.()

      setTimeout(() => {
        setLogTime('')
        setLogMeet('')
        setLogNotes('')
        setLogSplitStr('')
        setLoggedPR(null)
      }, 3000)
    } catch {
      setLogError('Failed to save — try again')
    } finally {
      setLogging(false)
    }
  }

  // ── body ───────────────────────────────────────────────────

  const icon = <Timer className="h-4 w-4 text-primary" />

  const inputCls = 'w-full rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none'
  const labelCls = 'mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground'

  const body = (
    <div className="space-y-4">
      {/* Mode tabs */}
      <div className="flex rounded border border-border bg-surface-base p-0.5">
        {(['calculator', 'log'] as InternalMode[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded px-3 py-1.5 font-mono text-xs transition-colors ${
              tab === t
                ? 'bg-surface-elevated text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'calculator' ? 'Calculate pace' : 'Log a result'}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        {tab === 'calculator' ? (
          <motion.div
            key="calculator"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Distance</label>
                <select
                  value={calcDist}
                  onChange={(e) => { setCalcDist(e.target.value); setCalcResult(null); setCalcError('') }}
                  className={inputCls}
                >
                  {RACE_DISTANCES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Goal time</label>
                <input
                  type="text"
                  value={calcTime}
                  onChange={(e) => { setCalcTime(e.target.value); setCalcError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleCalculate()}
                  placeholder="e.g. 53.00 or 1:53.45"
                  className={inputCls}
                />
              </div>
            </div>

            {calcDist === 'custom' && (
              <div>
                <label className={labelCls}>Custom distance (meters)</label>
                <input
                  type="number"
                  value={calcCustomM}
                  onChange={(e) => setCalcCustomM(e.target.value)}
                  placeholder="e.g. 1500"
                  className={inputCls}
                />
              </div>
            )}

            <div>
              <label className={labelCls}>Split strategy</label>
              <div className="grid grid-cols-3 gap-1.5">
                {STRATEGIES.map((s) => (
                  <button
                    key={s.value}
                    onClick={() => setCalcStrat(s.value)}
                    className={`rounded border px-2 py-1.5 font-mono text-[11px] transition-all ${
                      calcStrat === s.value
                        ? 'border-primary bg-primary/10 text-primary'
                        : 'border-border bg-surface-elevated text-muted-foreground hover:border-primary/30 hover:text-foreground'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {calcError && <p className="text-xs text-destructive">{calcError}</p>}

            <button
              onClick={handleCalculate}
              className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20"
            >
              Calculate
            </button>

            <AnimatePresence>
              {calcResult && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {/* Pace cards */}
                  <div className="flex gap-2 overflow-x-auto pb-0.5 scrollbar-hidden">
                    {calcResult.paceCards.map((c) => (
                      <div key={c.label} className="flex-shrink-0 rounded border border-border bg-surface-base px-3 py-2 text-center">
                        <p className="font-mono text-sm font-semibold text-foreground">{c.value}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">{c.label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Splits table */}
                  {calcResult.splits.length > 1 && (
                    <div className="overflow-hidden rounded border border-border">
                      <div className="grid grid-cols-3 bg-surface-base px-3 py-1.5">
                        {['Split', 'Time', 'Total'].map((h) => (
                          <span key={h} className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{h}</span>
                        ))}
                      </div>
                      <div className="divide-y divide-border/40">
                        {calcResult.splits.map((row, i) => (
                          <div
                            key={i}
                            className="grid grid-cols-3 px-3 py-2 transition-colors hover:bg-surface-elevated/40"
                          >
                            <span className="font-mono text-xs text-muted-foreground">{row.label}</span>
                            <span className="font-mono text-xs font-medium text-foreground">{fmtSecs(row.seconds)}</span>
                            <span className="font-mono text-xs text-muted-foreground">{fmtSecs(row.cumulative)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleSaveCalc}
                    disabled={calcSaving || calcSaved}
                    className="flex w-full items-center justify-center gap-2 rounded border border-border bg-surface-elevated px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40"
                  >
                    {calcSaved ? 'Saved!' : calcSaving ? 'Saving…' : 'Save this plan'}
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : (
          <motion.div
            key="log"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="space-y-3"
          >
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Distance</label>
                <select
                  value={logDist}
                  onChange={(e) => setLogDist(e.target.value)}
                  className={inputCls}
                >
                  {RACE_DISTANCES.map((d) => (
                    <option key={d.value} value={d.value}>{d.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Actual time</label>
                <input
                  type="text"
                  value={logTime}
                  onChange={(e) => { setLogTime(e.target.value); setLogError('') }}
                  placeholder="e.g. 53.35 or 2:01.47"
                  className={inputCls}
                />
              </div>
            </div>

            {logDist === 'custom' && (
              <div>
                <label className={labelCls}>Custom distance (meters)</label>
                <input
                  type="number"
                  value={logCustomM}
                  onChange={(e) => setLogCustomM(e.target.value)}
                  placeholder="e.g. 1500"
                  className={inputCls}
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Date</label>
                <input
                  type="date"
                  value={logDate}
                  onChange={(e) => setLogDate(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Meet (optional)</label>
                <input
                  type="text"
                  value={logMeet}
                  onChange={(e) => setLogMeet(e.target.value)}
                  placeholder="e.g. State Champs"
                  className={inputCls}
                />
              </div>
            </div>

            <div>
              <label className={labelCls}>Actual splits (optional, comma-separated)</label>
              <input
                type="text"
                value={logSplitStr}
                onChange={(e) => setLogSplitStr(e.target.value)}
                placeholder="e.g. 12.5, 13.0, 13.5, 14.0"
                className={inputCls}
              />
            </div>

            <div>
              <label className={labelCls}>Notes (optional)</label>
              <textarea
                value={logNotes}
                onChange={(e) => setLogNotes(e.target.value)}
                placeholder="Weather, conditions, place, etc."
                rows={2}
                className={`${inputCls} resize-none`}
              />
            </div>

            {logError && <p className="text-xs text-destructive">{logError}</p>}

            <AnimatePresence>
              {loggedPR !== null && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className={`flex items-center gap-2 rounded border px-3 py-2 ${
                    loggedPR
                      ? 'border-warning/40 bg-warning/10'
                      : 'border-primary/30 bg-primary/10'
                  }`}
                >
                  <Trophy className={`h-4 w-4 flex-shrink-0 ${loggedPR ? 'text-warning' : 'text-primary'}`} />
                  <span className={`text-xs font-medium ${loggedPR ? 'text-warning' : 'text-primary'}`}>
                    {loggedPR ? 'New PR! Logged successfully.' : 'Result logged.'}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <button
              onClick={handleLog}
              disabled={logging || loggedPR !== null}
              className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
            >
              {logging
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Logging…</>
                : <><Flag className="h-3.5 w-3.5" /> Log Result</>
              }
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel
        title="Race Pace Calculator"
        subtitle="Split targets and result tracking"
        icon={icon}
        onClose={onClose}
      >
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell
      title="Race Pace Calculator"
      subtitle="Split targets and result tracking"
      icon={icon}
      onClose={onClose}
      width="w-[520px]"
    >
      {body}
    </ModalShell>
  )
}
