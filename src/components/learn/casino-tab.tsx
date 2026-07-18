'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Coins, TrendingUp, TrendingDown, Target, BarChart3 } from 'lucide-react'

interface Bet {
  claim_id: string
  content: string
  confidence: number
  amount: number
  was_correct: boolean | null
  payout: number | null
  placed_at: string
  resolved_at: string | null
}

interface CalibrationBucket {
  confidence: number
  total: number
  correct: number
}

export default function CasinoTab() {
  const [balance, setBalance] = useState<number | null>(null)
  const [bets, setBets] = useState<Bet[]>([])
  const [calibration, setCalibration] = useState<CalibrationBucket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      fetch('/api/learn/casino?action=balance').then((r) => r.json()),
      fetch('/api/learn/casino?action=bets').then((r) => r.json()),
      fetch('/api/learn/casino?action=calibration').then((r) => r.json()),
    ])
      .then(([bData, betsData, calData]) => {
        if (bData.error) throw new Error(bData.error)
        setBalance(bData.balance ?? 0)
        setBets(betsData.bets ?? [])
        setCalibration(calData.calibration ?? [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="font-mono text-[11px] text-muted-foreground/40">loading…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="font-mono text-[12px] text-destructive">{error}</div>
      </div>
    )
  }

  const resolved = bets.filter((b) => b.resolved_at !== null)
  const pending = bets.filter((b) => b.resolved_at === null)
  const wins = resolved.filter((b) => b.was_correct)
  const losses = resolved.filter((b) => b.was_correct === false)
  const overconfident = losses.filter((b) => b.confidence >= 4)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[720px] space-y-6 px-8 py-6">
        {/* Balance */}
        <div className="rounded border border-border bg-surface-secondary p-5">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
            <Coins className="h-3.5 w-3.5" /> Balance
          </div>
          <motion.div
            key={balance}
            initial={{ scale: 1.2, opacity: 0.5 }}
            animate={{ scale: 1, opacity: 1 }}
            className="mt-1 font-mono text-[32px] font-bold tabular-nums tracking-tight text-foreground"
          >
            {(balance ?? 0) >= 0 ? '+' : ''}{balance ?? 0}
          </motion.div>
          <div className="mt-2 flex gap-4 font-mono text-[10px] text-muted-foreground/40">
            <span>{resolved.length} bets resolved</span>
            <span>{wins.length}W / {losses.length}L</span>
            <span>{pending.length} pending</span>
          </div>
        </div>

        {/* Calibration curve */}
        {calibration.length > 0 && (
          <div className="rounded border border-border bg-surface-secondary p-5">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
              <Target className="h-3.5 w-3.5" /> Calibration
            </div>
            <div className="mt-3 space-y-2">
              {calibration.map((b) => {
                const rate = b.total > 0 ? (b.correct / b.total) * 100 : 0
                const expected = b.confidence * 20 // 20% per step from 1-5
                const calibrated = Math.abs(rate - expected) < 15
                return (
                  <div key={b.confidence} className="flex items-center gap-3">
                    <span className="w-4 font-mono text-[11px] tabular-nums text-muted-foreground/60">{b.confidence}</span>
                    <div className="flex-1 h-2 rounded-full bg-surface-base overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${calibrated ? 'bg-primary/60' : 'bg-warning/60'}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <span className="w-12 text-right font-mono text-[10px] tabular-nums text-muted-foreground/40">
                      {b.correct}/{b.total}
                    </span>
                  </div>
                )
              })}
            </div>
            <div className="mt-2 font-mono text-[9px] text-muted-foreground/30">
              Bars show % correct at each confidence level. Green = calibrated, yellow = off.
            </div>
          </div>
        )}

        {/* Overconfident leaderboard */}
        {overconfident.length > 0 && (
          <div className="rounded border border-border bg-surface-secondary p-5">
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-destructive/60">
              <BarChart3 className="h-3.5 w-3.5" /> Worst Overconfident Calls
            </div>
            <div className="mt-3 space-y-2">
              {overconfident.map((b, i) => (
                <div key={b.claim_id + i} className="border-l-2 border-destructive/30 pl-3">
                  <p className="font-mono text-[11px] leading-relaxed text-foreground/80 line-clamp-2">{b.content}</p>
                  <div className="mt-0.5 flex gap-3 font-mono text-[10px] text-muted-foreground/40">
                    <span>confidence {b.confidence}/5</span>
                    <span className="text-destructive/50">{b.payout}pts</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent bets */}
        <div className="rounded border border-border bg-surface-secondary p-5">
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
            <TrendingUp className="h-3.5 w-3.5" /> Recent Bets
          </div>
          {resolved.length === 0 && pending.length === 0 ? (
            <p className="mt-3 font-mono text-[11px] text-muted-foreground/40">
              No bets yet. Every probe answer gets a confidence wager — answer a probe to see your first bet.
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {bets.slice(0, 15).map((b, i) => (
                <div key={b.claim_id + i} className="flex items-start gap-2">
                  {b.resolved_at ? (
                    b.was_correct ? (
                      <TrendingUp className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/60" />
                    ) : (
                      <TrendingDown className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive/60" />
                    )
                  ) : (
                    <div className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 rounded-full border border-muted-foreground/20" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-sans text-[12px] leading-relaxed text-foreground/70 line-clamp-2">{b.content}</p>
                    <div className="mt-0.5 flex gap-3 font-mono text-[10px] text-muted-foreground/40">
                      <span>×{b.confidence}</span>
                      <span>${b.amount}</span>
                      {b.payout !== null && (
                        <span className={b.payout >= 0 ? 'text-primary/60' : 'text-destructive/60'}>
                          {b.payout >= 0 ? '+' : ''}{b.payout}
                        </span>
                      )}
                      {b.resolved_at === null && <span className="text-warning/60">pending</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
