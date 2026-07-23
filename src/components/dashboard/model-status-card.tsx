'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card } from '@/components/card'
import { MODEL_LIST, isModelConfigured } from '@/lib/nim'
import type { ModelStatus, ModelStatusRecord } from '@/lib/model-status'
import { STATUS_LABELS, STATUS_DOT } from '@/lib/model-status'

interface ModelWithStatus {
  id: string
  label: string
  configured: boolean
  status: ModelStatus
  note?: string
}

export function ModelStatusCard() {
  const [records, setRecords] = useState<Record<string, ModelStatusRecord>>({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<string | null>(null)
  const [note, setNote] = useState('')

  const fetchStatuses = useCallback(async () => {
    try {
      const res = await fetch('/api/model-status')
      const data = await res.json()
      const map: Record<string, ModelStatusRecord> = {}
      for (const s of (data.statuses ?? []) as ModelStatusRecord[]) {
        map[s.model_id] = s
      }
      setRecords(map)
    } catch (e) {
      console.error('[model-status] fetch failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatuses()
  }, [fetchStatuses])

  const updateStatus = useCallback(async (modelId: string, status: ModelStatus) => {
    const current = records[modelId]
    const optimistic: ModelStatusRecord = {
      ...(current ?? { id: '', user_id: '', model_id: modelId, note: null, updated_at: new Date().toISOString() }),
      model_id: modelId,
      status,
      note: note.trim() || current?.note || null,
      updated_at: new Date().toISOString(),
    }
    setRecords((prev) => ({ ...prev, [modelId]: optimistic }))

    try {
      const res = await fetch('/api/model-status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId,
          status,
          note: note.trim() || current?.note || undefined,
        }),
      })
      if (!res.ok) throw new Error(await res.text())
      const data = await res.json()
      setRecords((prev) => ({ ...prev, [data.status.model_id]: data.status as ModelStatusRecord }))
    } catch (e) {
      console.error('[model-status] update failed:', e)
    }
    setEditing(null)
  }, [records, note])

  const models: ModelWithStatus[] = MODEL_LIST.map((m) => ({
    id: m.id,
    label: m.label,
    configured: isModelConfigured(m.id),
    status: records[m.id]?.status ?? (isModelConfigured(m.id) ? 'live' : 'down'),
    note: records[m.id]?.note ?? undefined,
  }))

  const liveCount = models.filter((m) => m.status === 'live').length

  return (
    <Card padding="lg" className="h-full">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Router status</h3>
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {liveCount}/{models.length} live
        </span>
      </div>
      <ul className="space-y-2">
        {models.map((m) => (
          <li
            key={m.id}
            className="group relative flex items-center justify-between gap-2 rounded-md p-1.5 text-xs hover:bg-surface-elevated"
          >
            <span className="truncate text-foreground">{m.label}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setEditing(m.id)
                  setNote(m.note ?? '')
                }}
                className="flex items-center gap-1.5 rounded px-1.5 py-0.5 text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground"
                title={m.note ? `${STATUS_LABELS[m.status]}: ${m.note}` : `Set status for ${m.label}`}
                disabled={loading}
              >
                <span className={`h-2 w-2 rounded-full ${STATUS_DOT[m.status]}`} />
                <span className="text-[10px]">{STATUS_LABELS[m.status]}</span>
              </button>
            </div>

            {editing === m.id && (
              <div className="absolute right-0 top-full z-20 mt-1 w-64 rounded-md border border-border bg-surface-secondary p-2 shadow-xl">
                <p className="mb-2 text-xs font-medium text-foreground">{m.label}</p>
                <div className="mb-2 flex gap-1">
                  {(['live', 'degraded', 'down'] as ModelStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => updateStatus(m.id, s)}
                      className={`flex-1 rounded px-2 py-1 text-[10px] font-medium capitalize transition-colors ${
                        m.status === s
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-surface-elevated text-foreground hover:bg-surface-secondary'
                      }`}
                    >
                      {STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Optional note (e.g. quota exhausted)"
                  className="w-full rounded border border-border bg-surface-elevated px-2 py-1 text-xs text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
                  maxLength={200}
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="rounded px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Card>
  )
}
