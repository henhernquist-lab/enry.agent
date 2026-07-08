'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { SmilePlus, Star, Loader2 } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { loadResources, saveResource, updateResource, type Resource, type CheckinPayload } from '@/lib/resources'

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function shortDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface DailyCheckinProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function DailyCheckin({ onClose, mode = 'modal', onSave }: DailyCheckinProps) {
  const [entries, setEntries] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [rating, setRating] = useState<1 | 2 | 3 | 4 | 5>(3)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const load = () => loadResources('checkin').then((r) => { setEntries(r); setLoading(false) })
  useEffect(() => { load() }, [])

  const today = todayStr()
  const todayEntry = useMemo(
    () => entries.find((e) => (e.payload as CheckinPayload).date === today) ?? null,
    [entries, today],
  )

  useEffect(() => {
    if (todayEntry) {
      const p = todayEntry.payload as CheckinPayload
      setRating(p.rating)
      setNote(p.note ?? '')
    }
  }, [todayEntry])

  const sorted = useMemo(
    () => [...entries].sort((a, b) => (b.payload as CheckinPayload).date.localeCompare((a.payload as CheckinPayload).date)),
    [entries],
  )

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload: CheckinPayload = { date: today, rating, ...(note.trim() && { note: note.trim() }) }
      const title = `Check-in — ${today}`
      if (todayEntry) {
        const updated = await updateResource(todayEntry.id, 'checkin', title, payload)
        if (updated) setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)))
      } else {
        await saveResource('checkin', title, payload)
        await load()
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSave?.()
    } finally {
      setSaving(false)
    }
  }

  const icon = <SmilePlus className="h-4 w-4 text-primary" />

  const body = (
    <div className="space-y-4">
      <div className="space-y-3 rounded border border-border bg-surface-elevated p-3">
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            How&apos;d today go? {todayEntry && <span className="text-primary">(editing today&apos;s entry)</span>}
          </p>
          <div className="flex gap-1.5">
            {([1, 2, 3, 4, 5] as const).map((n) => (
              <button
                key={n}
                onClick={() => setRating(n)}
                className={`flex h-9 w-9 items-center justify-center rounded border transition-colors ${
                  n <= rating ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-surface-base text-muted-foreground hover:border-primary/30'
                }`}
              >
                <Star className={`h-4 w-4 ${n <= rating ? 'fill-current' : ''}`} />
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Note (optional)</label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="How did it feel? Anything notable?"
            rows={2}
            className="w-full resize-none rounded border border-border bg-surface-base px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex w-full items-center justify-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {saved ? 'Saved!' : todayEntry ? 'Update today’s entry' : 'Save check-in'}
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : sorted.length === 0 ? (
        <p className="py-6 text-center text-xs text-muted-foreground">No check-ins yet.</p>
      ) : (
        <div className="space-y-1.5">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">History</p>
          <AnimatePresence>
            {sorted.map((entry) => {
              const p = entry.payload as CheckinPayload
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-3 rounded border border-border/60 bg-surface-elevated/60 px-3 py-2"
                >
                  <span className="mt-0.5 flex-shrink-0 font-mono text-[10px] text-muted-foreground">{shortDate(p.date)}</span>
                  <div className="flex flex-shrink-0 gap-0.5">
                    {([1, 2, 3, 4, 5] as const).map((n) => (
                      <Star key={n} className={`h-3 w-3 ${n <= p.rating ? 'fill-current text-primary' : 'text-border'}`} />
                    ))}
                  </div>
                  {p.note && <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{p.note}</p>}
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel title="Daily Check-in" subtitle="Rate your day, track the trend" icon={icon} onClose={onClose}>
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell title="Daily Check-in" subtitle="Rate your day, track the trend" icon={icon} onClose={onClose} width="w-[480px]">
      {body}
    </ModalShell>
  )
}
