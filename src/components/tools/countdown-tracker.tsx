'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Hourglass, Plus, Trash2, Loader2, ChevronDown, ChevronUp } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { loadResources, deleteResource, type Resource, type CountdownPayload } from '@/lib/resources'

type EventType = CountdownPayload['event_type']

const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'track_meet', label: 'Track meet' },
  { value: 'football_game', label: 'Football game' },
  { value: 'other', label: 'Other' },
]

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

function daysAway(eventDate: string): number {
  const today = new Date(todayStr() + 'T00:00:00')
  const event = new Date(eventDate + 'T00:00:00')
  return Math.round((event.getTime() - today.getTime()) / 86400000)
}

function daysAwayLabel(n: number): string {
  if (n === 0) return 'today!'
  if (n === 1) return 'tomorrow'
  if (n === -1) return 'yesterday'
  if (n < 0) return `${Math.abs(n)}d ago`
  return `${n} days away`
}

function shortDate(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

interface CountdownTrackerProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function CountdownTracker({ onClose, mode = 'modal', onSave }: CountdownTrackerProps) {
  const [events, setEvents] = useState<Resource[]>([])
  const [loading, setLoading] = useState(true)
  const [showPast, setShowPast] = useState(false)

  const [name, setName] = useState('')
  const [date, setDate] = useState('')
  const [eventType, setEventType] = useState<EventType>('track_meet')
  const [location, setLocation] = useState('')
  const [notes, setNotes] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  const load = () => loadResources('countdown').then((r) => { setEvents(r); setLoading(false) })
  useEffect(() => { load() }, [])

  const { upcoming, past } = useMemo(() => {
    const today = todayStr()
    const sorted = [...events].sort((a, b) => {
      const ad = (a.payload as CountdownPayload).event_date
      const bd = (b.payload as CountdownPayload).event_date
      return ad.localeCompare(bd)
    })
    return {
      upcoming: sorted.filter((e) => (e.payload as CountdownPayload).event_date >= today),
      past: sorted.filter((e) => (e.payload as CountdownPayload).event_date < today).reverse(),
    }
  }, [events])

  const handleAdd = async () => {
    if (!name.trim() || !date) { setError('Name and date required'); return }
    setAdding(true)
    setError('')
    try {
      const payload: CountdownPayload = {
        event_name: name.trim(),
        event_date: date,
        event_type: eventType,
        ...(location.trim() && { location: location.trim() }),
        ...(notes.trim() && { notes: notes.trim() }),
      }
      const res = await fetch('/api/resources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'countdown', title: `${name.trim()} — ${date}`, payload }),
      })
      if (!res.ok) throw new Error('save failed')
      setName(''); setDate(''); setLocation(''); setNotes(''); setEventType('track_meet')
      await load()
      onSave?.()
    } catch {
      setError('Failed to save — try again')
    } finally {
      setAdding(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(id)
    await deleteResource(id)
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setDeleting(null)
  }

  const icon = <Hourglass className="h-4 w-4 text-primary" />
  const inputCls = 'w-full rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none'
  const labelCls = 'mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground'

  const body = (
    <div className="space-y-4">
      <div className="space-y-2 rounded border border-border bg-surface-elevated p-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Event name</label>
            <input value={name} onChange={(e) => { setName(e.target.value); setError('') }} placeholder="e.g. Regional Championships" className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Date</label>
            <input type="date" value={date} onChange={(e) => { setDate(e.target.value); setError('') }} className={inputCls} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Type</label>
            <select value={eventType} onChange={(e) => setEventType(e.target.value as EventType)} className={inputCls}>
              {EVENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Location (optional)</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="e.g. Central HS" className={inputCls} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Notes (optional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Bus leaves at 3pm" className={inputCls} />
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          onClick={handleAdd}
          disabled={adding || !name.trim() || !date}
          className="flex w-full items-center justify-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
        >
          {adding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add event
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          {upcoming.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted-foreground">No upcoming events. Add one above.</p>
          ) : (
            <div className="space-y-1.5">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Upcoming</p>
              <AnimatePresence>
                {upcoming.map((ev) => {
                  const p = ev.payload as CountdownPayload
                  const n = daysAway(p.event_date)
                  const soon = n <= 3
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`flex items-center justify-between rounded border px-3 py-2.5 ${soon ? 'border-primary/30 bg-primary/5' : 'border-border bg-surface-elevated'}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{p.event_name}</p>
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {shortDate(p.event_date)}{p.location ? ` · ${p.location}` : ''}
                        </p>
                        {p.notes && <p className="mt-0.5 text-[11px] text-muted-foreground">{p.notes}</p>}
                      </div>
                      <div className="ml-3 flex flex-shrink-0 items-center gap-2">
                        <span className={`whitespace-nowrap font-mono text-xs font-semibold ${soon ? 'text-primary' : 'text-muted-foreground'}`}>
                          {daysAwayLabel(n)}
                        </span>
                        <button
                          onClick={() => handleDelete(ev.id)}
                          disabled={deleting === ev.id}
                          className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                        >
                          {deleting === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                        </button>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}

          {past.length > 0 && (
            <div className="space-y-1.5">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="flex w-full items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                {showPast ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                Past ({past.length})
              </button>
              <AnimatePresence>
                {showPast && past.map((ev) => {
                  const p = ev.payload as CountdownPayload
                  return (
                    <motion.div
                      key={ev.id}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex items-center justify-between rounded border border-border/50 bg-surface-elevated/40 px-3 py-2 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-muted-foreground">{p.event_name}</p>
                        <p className="font-mono text-[10px] text-muted-foreground/70">{shortDate(p.event_date)}</p>
                      </div>
                      <button
                        onClick={() => handleDelete(ev.id)}
                        disabled={deleting === ev.id}
                        className="rounded p-1 text-muted-foreground hover:text-destructive disabled:opacity-40"
                      >
                        {deleting === ev.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
                      </button>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )}
        </>
      )}
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel title="Meet/Game Countdown" subtitle="Track upcoming events with live day counts" icon={icon} onClose={onClose}>
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell title="Meet/Game Countdown" subtitle="Track upcoming events with live day counts" icon={icon} onClose={onClose} width="w-[520px]">
      {body}
    </ModalShell>
  )
}
