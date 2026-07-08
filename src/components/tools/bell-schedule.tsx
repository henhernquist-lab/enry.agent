'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, Plus, Trash2, Loader2, Pencil } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { loadResources, saveResource, updateResource, type Resource, type BellSchedulePayload } from '@/lib/resources'

type Period = BellSchedulePayload['periods'][number]

function emptyPeriods(count: number): Period[] {
  return Array.from({ length: count }, (_, i) => ({ period: i + 1, class_name: '', start_time: '', end_time: '' }))
}

function toSeconds(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/)
  if (!m) return null
  return parseInt(m[1], 10) * 3600 + parseInt(m[2], 10) * 60
}

function nowSeconds(d: Date): number {
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds()
}

function fmtCountdown(secs: number): string {
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  const s = secs % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`
}

interface BellScheduleProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function BellSchedule({ onClose, mode = 'modal', onSave }: BellScheduleProps) {
  const [resource, setResource] = useState<Resource | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [periods, setPeriods] = useState<Period[]>(emptyPeriods(7))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [tick, setTick] = useState(() => new Date())

  useEffect(() => {
    loadResources('bell_schedule').then((r) => {
      const existing = r[0] ?? null
      setResource(existing)
      if (existing) setPeriods((existing.payload as BellSchedulePayload).periods)
      else setEditing(true)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const id = setInterval(() => setTick(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const nowSec = nowSeconds(tick)

  const sortedPeriods = useMemo(
    () => [...periods].filter((p) => toSeconds(p.start_time) !== null && toSeconds(p.end_time) !== null).sort((a, b) => (toSeconds(a.start_time) ?? 0) - (toSeconds(b.start_time) ?? 0)),
    [periods],
  )

  const currentPeriod = sortedPeriods.find((p) => {
    const s = toSeconds(p.start_time); const e = toSeconds(p.end_time)
    return s !== null && e !== null && nowSec >= s && nowSec < e
  }) ?? null

  const nextPeriod = sortedPeriods.find((p) => (toSeconds(p.start_time) ?? Infinity) > nowSec) ?? null
  const nextBoundary = currentPeriod
    ? toSeconds(currentPeriod.end_time)
    : nextPeriod
    ? toSeconds(nextPeriod.start_time)
    : null

  const handleFieldChange = (idx: number, field: keyof Period, value: string) => {
    setPeriods((prev) => prev.map((p, i) => (i === idx ? { ...p, [field]: field === 'period' ? Number(value) : value } : p)))
  }

  const handleAddPeriod = () => {
    setPeriods((prev) => [...prev, { period: prev.length + 1, class_name: '', start_time: '', end_time: '' }])
  }

  const handleRemovePeriod = (idx: number) => {
    setPeriods((prev) => prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, period: i + 1 })))
  }

  const handleSave = async () => {
    const valid = periods.filter((p) => p.class_name.trim() && toSeconds(p.start_time) !== null && toSeconds(p.end_time) !== null)
    if (valid.length === 0) { setError('Add at least one period with a name, start, and end time'); return }
    setError('')
    setSaving(true)
    try {
      const payload: BellSchedulePayload = { periods: valid }
      if (resource) {
        const updated = await updateResource(resource.id, 'bell_schedule', 'Bell Schedule', payload)
        if (updated) setResource(updated)
      } else {
        await saveResource('bell_schedule', 'Bell Schedule', payload)
        const r = await loadResources('bell_schedule')
        setResource(r[0] ?? null)
      }
      setEditing(false)
      onSave?.()
    } finally {
      setSaving(false)
    }
  }

  const icon = <Bell className="h-4 w-4 text-primary" />
  const inputCls = 'w-full rounded border border-border bg-surface-base px-2 py-1 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none'

  const body = loading ? (
    <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  ) : editing ? (
    <div className="space-y-3">
      <div className="space-y-1.5">
        {periods.map((p, i) => (
          <div key={i} className="grid grid-cols-[2.5rem_1fr_5rem_5rem_1.5rem] items-center gap-1.5">
            <span className="font-mono text-[10px] text-muted-foreground">P{p.period}</span>
            <input value={p.class_name} onChange={(e) => handleFieldChange(i, 'class_name', e.target.value)} placeholder="Class name" className={inputCls} />
            <input type="time" value={p.start_time} onChange={(e) => handleFieldChange(i, 'start_time', e.target.value)} className={inputCls} />
            <input type="time" value={p.end_time} onChange={(e) => handleFieldChange(i, 'end_time', e.target.value)} className={inputCls} />
            <button onClick={() => handleRemovePeriod(i)} className="rounded p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        ))}
      </div>
      <button onClick={handleAddPeriod} className="flex items-center gap-1 text-xs text-primary hover:underline">
        <Plus className="h-3 w-3" /> Add period
      </button>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex gap-2">
        {resource && (
          <button
            onClick={() => { setEditing(false); setPeriods((resource.payload as BellSchedulePayload).periods); setError('') }}
            className="flex-1 rounded border border-border bg-surface-elevated px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
        >
          {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Save schedule
        </button>
      </div>
    </div>
  ) : (
    <div className="space-y-3">
      {currentPeriod ? (
        <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2.5 text-center">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Now — Period {currentPeriod.period}</p>
          <p className="mt-0.5 text-sm font-semibold text-foreground">{currentPeriod.class_name}</p>
          {nextBoundary !== null && (
            <p className="mt-1 font-mono text-lg font-bold text-primary">{fmtCountdown(Math.max(nextBoundary - nowSec, 0))}</p>
          )}
        </div>
      ) : (
        <div className="rounded border border-border bg-surface-elevated px-3 py-2.5 text-center">
          <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Between periods</p>
          {nextBoundary !== null && (
            <p className="mt-1 font-mono text-lg font-bold text-foreground">{fmtCountdown(Math.max(nextBoundary - nowSec, 0))}</p>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded border border-border">
        <div className="divide-y divide-border/40">
          {sortedPeriods.map((p) => {
            const active = currentPeriod?.period === p.period
            return (
              <div key={p.period} className={`flex items-center justify-between px-3 py-2 ${active ? 'bg-primary/10' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">P{p.period}</span>
                  <span className={`text-xs ${active ? 'font-medium text-primary' : 'text-foreground'}`}>{p.class_name}</span>
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">{p.start_time}–{p.end_time}</span>
              </div>
            )
          })}
        </div>
      </div>

      <button
        onClick={() => setEditing(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded border border-border bg-surface-elevated px-3 py-1.5 text-xs text-muted-foreground hover:border-primary/40 hover:text-primary"
      >
        <Pencil className="h-3 w-3" /> Edit schedule
      </button>
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel title="Bell Schedule" subtitle="Current period and countdown to the next" icon={icon} onClose={onClose}>
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell title="Bell Schedule" subtitle="Current period and countdown to the next" icon={icon} onClose={onClose} width="w-[480px]">
      {body}
    </ModalShell>
  )
}
