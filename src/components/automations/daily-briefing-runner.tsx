'use client'

import { useEffect, useState } from 'react'
import { DailyBriefingCard } from './daily-briefing-card'
import {
  loadBriefing,
  saveBriefing,
  dismissBriefing,
  parseBriefingText,
  todayKey,
  type DailyBriefing,
} from '@/lib/daily-briefing'

const BRIEFING_PROMPT = `Give Henry a short daily briefing in exactly 3 lines, no numbering or extra commentary:
Line 1: a one-sentence motivational quote (can be from a known figure or original).
Line 2: a quick, practical study tip he can apply today.
Line 3: a brief workout reminder/nudge for today.`

export function DailyBriefingRunner({ enabled }: { enabled: boolean }) {
  const [briefing, setBriefing] = useState<DailyBriefing | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return
    const existing = loadBriefing()
    if (existing) {
      setBriefing(existing)
      return
    }

    let cancelled = false
    setLoading(true)
    fetch('/api/automations/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: BRIEFING_PROMPT }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        if (data.error || !data.text) return
        const parsed = parseBriefingText(data.text)
        const fresh: DailyBriefing = {
          date: todayKey(),
          ...parsed,
          generatedAt: Date.now(),
          dismissed: false,
        }
        saveBriefing(fresh)
        setBriefing(fresh)
      })
      .catch((err) => console.error('daily briefing generation failed:', err))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <DailyBriefingCard
      briefing={briefing}
      loading={loading}
      onDismiss={() => {
        dismissBriefing()
        setBriefing((b) => (b ? { ...b, dismissed: true } : b))
      }}
    />
  )
}
