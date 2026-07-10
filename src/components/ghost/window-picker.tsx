'use client'

import { useCallback, useState } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Hourglass, AlertTriangle } from 'lucide-react'

export interface GhostWindowSelection {
  start: string
  end: string
  label: string
  corpusResourceIds: string[]
  richness: string
  voiceSampleCount: number
}

interface WindowStats {
  countsByType: Record<string, number>
  totalResources: number
  voiceSampleCount: number
  richness: 'rich' | 'sparse' | 'minimal' | 'insufficient'
  corpusResourceIds: string[]
}

function monthsBack(n: number): { start: string; end: string; label: string } {
  const d = new Date()
  const target = new Date(d.getFullYear(), d.getMonth() - n, 1)
  const start = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-01`
  const endDate = new Date(target.getFullYear(), target.getMonth() + 1, 0)
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-${String(endDate.getDate()).padStart(2, '0')}`
  const label = target.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  return { start, end, label }
}

const RICHNESS_COPY: Record<WindowStats['richness'], { text: string; warn: boolean }> = {
  rich: { text: 'plenty of his own writing — the reconstruction will sound like him', warn: false },
  sparse: { text: 'some of his writing exists — voice will be approximate in places', warn: false },
  minimal: { text: 'almost none of his own writing survives — expect "I don\'t remember" a lot', warn: true },
  insufficient: { text: 'no writing from him in this window — the ghost knows the facts but the voice is a guess', warn: true },
}

export function WindowPicker({ onStart }: { onStart: (sel: GhostWindowSelection) => void }) {
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const [label, setLabel] = useState('')
  const [stats, setStats] = useState<WindowStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const inspect = useCallback(async (s: string, e: string, l: string) => {
    setStart(s)
    setEnd(e)
    setLabel(l)
    setStats(null)
    setError(null)
    if (!s || !e) return
    setLoading(true)
    try {
      const res = await fetch('/api/ghost/window', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: s, end: e }),
      })
      const data = await res.json()
      if (!res.ok) setError(data.error ?? 'Could not inspect window')
      else setStats(data)
    } catch {
      setError('Could not inspect window')
    } finally {
      setLoading(false)
    }
  }, [])

  const presets = [
    { ...monthsBack(1) },
    { ...monthsBack(0), label: 'This month so far' },
    { start: '2026-07-01', end: '2026-07-10', label: 'The enry.agent build sprint' },
  ]

  return (
    <div className="mx-auto w-full max-w-xl">
      <div className="rounded-lg border border-warning/25 bg-surface-secondary p-6">
        <div className="mb-4 flex items-center gap-2">
          <Hourglass className="h-4 w-4 text-warning" />
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">choose a window</h2>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {presets.map((p) => (
            <button
              key={p.label}
              onClick={() => inspect(p.start, p.end, p.label)}
              className={`rounded border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                label === p.label ? 'border-warning/60 text-warning' : 'border-border text-muted-foreground hover:border-warning/40 hover:text-foreground'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mb-4 grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">from</span>
            <input
              type="date"
              value={start}
              onChange={(e) => inspect(e.target.value, end, 'Custom window')}
              className="w-full rounded border border-border bg-surface-elevated px-2 py-1.5 font-mono text-xs text-foreground focus:border-warning/50 focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">to</span>
            <input
              type="date"
              value={end}
              onChange={(e) => inspect(start, e.target.value, 'Custom window')}
              className="w-full rounded border border-border bg-surface-elevated px-2 py-1.5 font-mono text-xs text-foreground focus:border-warning/50 focus:outline-none"
            />
          </label>
        </div>

        {loading && (
          <div className="flex items-center gap-2 py-3 font-mono text-[11px] text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> inspecting the record…
          </div>
        )}
        {error && <p className="py-2 font-mono text-[11px] text-red-400/90">{error}</p>}

        {stats && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="border-t border-border/50 pt-4">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">what survives from this window</p>
            {stats.totalResources === 0 ? (
              <p className="text-xs text-muted-foreground">Nothing. No data was logged in this window — pick another.</p>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {Object.entries(stats.countsByType).map(([type, count]) => (
                    <span key={type} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {type} ×{count}
                    </span>
                  ))}
                </div>
                <div className={`mb-4 flex items-start gap-2 text-xs ${RICHNESS_COPY[stats.richness].warn ? 'text-warning' : 'text-muted-foreground'}`}>
                  {RICHNESS_COPY[stats.richness].warn && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />}
                  <span>
                    {stats.voiceSampleCount} writing sample{stats.voiceSampleCount !== 1 ? 's' : ''} in his own words — {RICHNESS_COPY[stats.richness].text}.
                  </span>
                </div>
                <button
                  onClick={() =>
                    onStart({
                      start,
                      end,
                      label,
                      corpusResourceIds: stats.corpusResourceIds,
                      richness: stats.richness,
                      voiceSampleCount: stats.voiceSampleCount,
                    })
                  }
                  className="w-full rounded border border-warning/50 bg-warning/10 px-3 py-2 font-mono text-xs text-warning transition-colors hover:bg-warning/20"
                >
                  Talk to Henry — {label}
                </button>
              </>
            )}
          </motion.div>
        )}
      </div>
    </div>
  )
}
