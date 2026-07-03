'use client'

import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { ModalShell } from './modal-shell'
import { loadBriefing, saveBriefing, parseBriefingText, todayKey, type DailyBriefing } from '@/lib/daily-briefing'

const BRIEFING_PROMPT = `Give Henry a short daily briefing in exactly 3 lines, no numbering or extra commentary:
Line 1: a one-sentence motivational quote (can be from a known figure or original).
Line 2: a quick, practical study tip he can apply today.
Line 3: a brief workout reminder/nudge for today.`

export function DailyBriefingPanel({ onClose }: { onClose: () => void }) {
  const [briefing, setBriefing] = useState<DailyBriefing | null>(() => loadBriefing())
  const [loading, setLoading] = useState(false)

  const handleRegenerate = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/automations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: BRIEFING_PROMPT }),
      })
      const data = await res.json()
      if (data.error || !data.text) return
      const parsed = parseBriefingText(data.text)
      const fresh: DailyBriefing = { date: todayKey(), ...parsed, generatedAt: Date.now(), dismissed: false }
      saveBriefing(fresh)
      setBriefing(fresh)
    } catch (error) {
      console.error('briefing regenerate failed:', error)
    } finally {
      setLoading(false)
    }
  }

  return (
    <ModalShell title="Daily Briefing" subtitle="Generated once per day" onClose={onClose}>
      {loading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">Generating...</p>
      ) : briefing ? (
        <div className="space-y-2.5 rounded border border-border bg-surface-elevated p-3 text-sm text-foreground">
          <p className="flex items-start gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 mt-1">[Q]</span>
            <span>{briefing.quote}</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 mt-1">[S]</span>
            <span>{briefing.studyTip}</span>
          </p>
          <p className="flex items-start gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground shrink-0 mt-1">[W]</span>
            <span>{briefing.workoutReminder}</span>
          </p>
        </div>
      ) : (
        <p className="py-6 text-center text-xs text-muted-foreground">No briefing generated yet today.</p>
      )}
      <button
        onClick={handleRegenerate}
        disabled={loading}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-50"
      >
        <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        Regenerate
      </button>
    </ModalShell>
  )
}
