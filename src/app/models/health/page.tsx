'use client'

import { useCallback, useEffect, useState } from 'react'
import { Loader2, RefreshCw } from 'lucide-react'
import { HealthCard } from '@/components/models/health-card'
import { HealthOverview } from '@/components/models/health-overview'
import type { ModelHealth } from '@/lib/model-intelligence'

export default function HealthPage() {
  const [healths, setHealths] = useState<ModelHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/models/health')
      if (res.ok) {
        const data = await res.json()
        setHealths(data.health ?? [])
      }
    } catch {
      /* keep last-known */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 30 seconds — future polling will update the backend
  // and this will reflect live data.
  useEffect(() => {
    const interval = setInterval(() => load(), 30_000)
    return () => clearInterval(interval)
  }, [load])

  const handleRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  return (
    <div>
      {/* Controls bar */}
      <div className="mb-6 flex items-center justify-between">
        <p className="font-mono text-xs text-muted-foreground">
          {loading ? 'Loading…' : `${healths.length} models monitored`}
        </p>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-elevated px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-40"
        >
          {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          Refresh
        </button>
      </div>

      {loading ? (
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Overview summary */}
          <HealthOverview healths={healths} />

          {/* Cards grid */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {healths.map((health, index) => (
              <HealthCard key={health.modelId} health={health} index={index} />
            ))}
          </div>

          {/* Auto-refresh note */}
          <p className="mt-6 font-mono text-[10px] text-muted-foreground/50">
            Auto-refreshes every 30s · Status indicators update in real time when health monitoring is active
          </p>
        </>
      )}
    </div>
  )
}
