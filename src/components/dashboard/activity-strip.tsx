'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/card'
import type { RecentActivity } from '@/lib/usage/activity'

const MODE_LABELS: Record<string, string> = {
  chat: 'Chat',
  drive: 'Drive',
  cruise: 'Cruise',
  learn: 'Learn',
  lab: 'Lab',
}

function relativeTime(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export function ActivityStrip() {
  const [activity, setActivity] = useState<RecentActivity | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch('/api/activity/recent')
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => { if (!cancelled && data) setActivity(data) })
        .catch(() => { /* keep last-known */ })
        .finally(() => { if (!cancelled) setLoading(false) })
    }
    load()
    const id = setInterval(load, 30_000)
    return () => { cancelled = true; clearInterval(id) }
  }, [])

  const isLive = activity?.isActive ?? false

  return (
    <Card padding="lg" className="h-full">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          {isLive && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${isLive ? 'bg-primary' : 'bg-muted-foreground/40'}`} />
        </span>
        <h3 className="text-sm font-semibold text-foreground">{isLive ? 'Live activity' : 'Last activity'}</h3>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : !activity?.at ? (
        <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-xs text-muted-foreground">{isLive ? 'Current mode' : 'Last mode'}</p>
            <p className="text-lg font-semibold text-foreground">{activity.mode ? MODE_LABELS[activity.mode] ?? activity.mode : '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">{activity.modelLabel ?? 'Unknown model'}</p>
            <p className="max-w-[16rem] text-sm text-foreground">{relativeTime(activity.at)}</p>
          </div>
        </div>
      )}
    </Card>
  )
}
