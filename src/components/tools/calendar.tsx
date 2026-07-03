'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Calendar as CalendarIcon, Plus, Trash2, Loader2, AlertTriangle, Clock } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'

interface CalendarEvent {
  id: string
  title: string
  description?: string
  start_time: string
  end_time: string
  created_at: string
}

function formatEventTime(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatEventDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getDayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)

  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === tomorrow.toDateString()) return 'Tomorrow'
  return formatEventDate(iso)
}

export function CalendarTool({ onClose }: { onClose: () => void }) {
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)
  const [creating, setCreating] = useState(false)

  // Create form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startDate, setStartDate] = useState(() => {
    const d = new Date()
    return d.toISOString().slice(0, 10)
  })
  const [startTime, setStartTime] = useState(() => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 1)
    return d.toTimeString().slice(0, 5)
  })
  const [endDate, setEndDate] = useState(() => {
    const d = new Date()
    d.setHours(d.getHours() + 1)
    return d.toISOString().slice(0, 10)
  })
  const [endTime, setEndTime] = useState(() => {
    const d = new Date()
    d.setMinutes(0, 0, 0)
    d.setHours(d.getHours() + 2)
    return d.toTimeString().slice(0, 5)
  })

  const load = async () => {
    try {
      const res = await fetch('/api/calendar/events')
      if (res.status === 401 || res.status === 403) {
        setAuthError(true)
        setLoading(false)
        return
      }
      if (!res.ok) throw new Error('Failed to load events')
      const data = await res.json()
      setEvents(data.events ?? [])
    } catch (err) {
      console.error('load events failed:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleCreate = async () => {
    if (!title.trim()) return
    setCreating(true)
    try {
      const startIso = new Date(`${startDate}T${startTime}`).toISOString()
      const endIso = new Date(`${endDate}T${endTime}`).toISOString()
      await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, start_time: startIso, end_time: endIso }),
      })
      setTitle('')
      setDescription('')
      const now = new Date()
      now.setMinutes(0, 0, 0)
      now.setHours(now.getHours() + 1)
      setStartDate(now.toISOString().slice(0, 10))
      setStartTime(now.toTimeString().slice(0, 5))
      const later = new Date(now)
      later.setHours(later.getHours() + 1)
      setEndDate(later.toISOString().slice(0, 10))
      setEndTime(later.toTimeString().slice(0, 5))
      await load()
    } catch (err) {
      console.error('create event failed:', err)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (id: string) => {
    await fetch('/api/calendar/events', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    })
    await load()
  }

  // Group events by day
  const groupedEvents = events.reduce<Record<string, CalendarEvent[]>>((acc, evt) => {
    const day = getDayLabel(evt.start_time)
    if (!acc[day]) acc[day] = []
    acc[day].push(evt)
    return acc
  }, {})

  return (
    <ModalShell
      title="Calendar"
      subtitle="Upcoming events for the next 7 days"
      icon={<CalendarIcon className="h-4 w-4 text-primary" />}
      onClose={onClose}
      width="w-[560px]"
    >
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : authError ? (
        <div className="flex items-center gap-3 rounded border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" />
          <p className="text-xs text-warning">Please sign out and sign back in to connect your Google Calendar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Create form */}
          <div className="rounded border border-border bg-surface-elevated p-3">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Event title"
              className="mb-2 w-full rounded border border-border bg-surface-base px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
            />
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              className="mb-2 w-full rounded border border-border bg-surface-base px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
            />
            <div className="mb-2 grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">Start</label>
                <div className="flex gap-1.5">
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
                    className="flex-1 rounded border border-border bg-surface-base px-2 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none" />
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
                    className="flex-1 rounded border border-border bg-surface-base px-2 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">End</label>
                <div className="flex gap-1.5">
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
                    className="flex-1 rounded border border-border bg-surface-base px-2 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none" />
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
                    className="flex-1 rounded border border-border bg-surface-base px-2 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none" />
                </div>
              </div>
            </div>
            <button
              onClick={handleCreate}
              disabled={!title.trim() || creating}
              className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
            >
              {creating && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <Plus className="h-3 w-3" /> Add event
            </button>
          </div>

          {/* Events list */}
          {Object.keys(groupedEvents).length === 0 ? (
            <div className="py-8 text-center">
              <CalendarIcon className="mx-auto mb-2 h-6 w-6 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">No upcoming events</p>
              <p className="mt-1 text-[11px] text-muted-foreground/60">Add one above to get started.</p>
            </div>
          ) : (
            <AnimatePresence>
              {Object.entries(groupedEvents).map(([day, dayEvents]) => (
                <div key={day} className="space-y-1.5">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{day}</p>
                  {dayEvents.map((evt) => (
                    <motion.div
                      key={evt.id}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className="group flex items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-foreground">{evt.title}</p>
                        {evt.description && <p className="mt-0.5 truncate text-muted-foreground/70">{evt.description}</p>}
                      </div>
                      <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                        <span className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground">
                          <Clock className="h-2.5 w-2.5" />
                          {formatEventTime(evt.start_time)}
                        </span>
                        <button onClick={() => handleDelete(evt.id)} className="rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </div>
              ))}
            </AnimatePresence>
          )}
        </div>
      )}
    </ModalShell>
  )
}
