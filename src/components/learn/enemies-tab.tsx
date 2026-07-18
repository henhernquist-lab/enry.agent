'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Crosshair, Shield, Skull, Plus, Loader2 } from 'lucide-react'

interface ActiveEnemy {
  id: string
  content: string
  topic: string
  created_at: string
}

interface CaughtEnemy {
  id: string
  content: string
  topic: string
  created_at: string
  caught_at: string
}

interface DefendedEnemy {
  id: string
  content: string
  topic: string
  created_at: string
  defended_at: string
  answer_given: string
}

type View = 'active' | 'caught' | 'defended'

export default function EnemiesTab() {
  const [view, setView] = useState<View>('active')
  const [active, setActive] = useState<ActiveEnemy[]>([])
  const [caught, setCaught] = useState<CaughtEnemy[]>([])
  const [defended, setDefended] = useState<DefendedEnemy[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Add enemy form state
  const [adding, setAdding] = useState(false)
  const [enemyContent, setEnemyContent] = useState('')
  const [enemyTopic, setEnemyTopic] = useState('')
  const [addStatus, setAddStatus] = useState<string | null>(null)

  const fetchData = () => {
    Promise.all([
      fetch('/api/learn/enemies?action=active').then((r) => r.json()),
      fetch('/api/learn/enemies?action=caught').then((r) => r.json()),
      fetch('/api/learn/enemies?action=defended').then((r) => r.json()),
    ])
      .then(([a, c, d]) => {
        setActive(a.enemies ?? [])
        setCaught(c.enemies ?? [])
        setDefended(d.enemies ?? [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => { fetchData() }, [])

  const handleAddEnemy = async () => {
    if (!enemyContent.trim()) return
    setAddStatus(null)
    try {
      const res = await fetch('/api/learn/enemies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: enemyContent.trim(), topic: enemyTopic.trim() || 'general' }),
      })
      const data = await res.json()
      if (data.error) { setAddStatus(data.error); return }
      setAddStatus('Added! Blended into the next probe rotation.')
      setEnemyContent('')
      setEnemyTopic('')
      setAdding(false)
      fetchData()
    } catch {
      setAddStatus('Network error')
    }
  }

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

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[720px] space-y-6 px-8 py-6">
        {/* Add enemy form */}
        <AnimatePresence>
          {!adding ? (
            <motion.button
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              onClick={() => setAdding(true)}
              className="flex w-full items-center gap-2 rounded border border-dashed border-muted-foreground/20 bg-surface-secondary/50 p-4 text-left font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40 transition-colors hover:border-muted-foreground/40 hover:text-muted-foreground/60"
            >
              <Plus className="h-3.5 w-3.5" /> Add an enemy claim
            </motion.button>
          ) : (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
              className="rounded border border-border bg-surface-secondary p-4 space-y-3"
            >
              <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-warning/60">
                <Skull className="h-3.5 w-3.5" /> New Enemy Claim
              </div>
              <textarea
                value={enemyContent}
                onChange={(e) => setEnemyContent(e.target.value)}
                placeholder="A claim you believe is FALSE. It'll be blended silently into your probes."
                rows={3}
                className="w-full resize-none rounded border border-border bg-surface-base px-3 py-2 font-mono text-[12px] text-foreground placeholder-muted-foreground/30 focus:border-warning/30 focus:outline-none"
              />
              <input
                value={enemyTopic}
                onChange={(e) => setEnemyTopic(e.target.value)}
                placeholder="topic (optional)"
                className="w-full rounded border border-border bg-surface-base px-3 py-1.5 font-mono text-[11px] text-foreground placeholder-muted-foreground/30 focus:border-warning/30 focus:outline-none"
              />
              <div className="flex gap-2">
                <button onClick={handleAddEnemy} disabled={!enemyContent.trim()}
                  className="rounded bg-warning/10 border border-warning/30 px-3 py-1.5 font-mono text-[10px] text-warning hover:bg-warning/20 disabled:opacity-30">
                  Add
                </button>
                <button onClick={() => { setAdding(false); setAddStatus(null) }}
                  className="rounded border border-border px-3 py-1.5 font-mono text-[10px] text-muted-foreground hover:text-foreground">
                  Cancel
                </button>
              </div>
              {addStatus && (
                <p className="font-mono text-[10px] text-muted-foreground/60">{addStatus}</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* View selector */}
        <div className="flex gap-1 border-b border-border">
          {([['active', 'Active', active.length], ['caught', 'Caught', caught.length], ['defended', 'Missed', defended.length]] as const).map(([key, label, count]) => (
            <button key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-1.5 border-b-2 px-3 py-2 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                view === key ? 'border-warning text-warning' : 'border-transparent text-muted-foreground/50 hover:text-muted-foreground'
              }`}>
              {label}
              <span className="tabular-nums text-[9px] opacity-50">({count})</span>
            </button>
          ))}
        </div>

        {/* Active enemies */}
        {view === 'active' && (
          <div className="space-y-3">
            {active.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground/40">
                No active enemies. Click &quot;Add an enemy claim&quot; to plant a false claim in your probe rotation.
              </p>
            ) : (
              active.map((e) => (
                <div key={e.id} className="rounded border border-border bg-surface-secondary p-4 border-l-2 border-l-warning/30">
                  <div className="flex items-start gap-2">
                    <Crosshair className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning/50" />
                    <div>
                      <p className="font-sans text-[13px] leading-relaxed text-foreground/80">{e.content}</p>
                      <div className="mt-1 flex gap-3 font-mono text-[10px] text-muted-foreground/40">
                        <span>{e.topic}</span>
                        <span>added {new Date(e.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Caught enemies */}
        {view === 'caught' && (
          <div className="space-y-3">
            {caught.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground/40">No enemies caught yet. They&apos;re blended into your probes — answer one as false to catch it.</p>
            ) : (
              caught.map((e) => (
                <div key={e.id} className="rounded border border-border bg-surface-secondary p-4 border-l-2 border-l-primary/30">
                  <div className="flex items-start gap-2">
                    <Shield className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary/60" />
                    <div>
                      <p className="font-sans text-[13px] leading-relaxed text-foreground/80">{e.content}</p>
                      <div className="mt-1 flex gap-3 font-mono text-[10px] text-muted-foreground/40">
                        <span>{e.topic}</span>
                        <span className="text-primary/60">caught {new Date(e.caught_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Defended enemies — the ones that matter most */}
        {view === 'defended' && (
          <div className="space-y-3">
            {defended.length === 0 ? (
              <p className="font-mono text-[11px] text-muted-foreground/40">No missed enemies yet. You&apos;ve correctly identified all enemies so far — or none have been probed yet.</p>
            ) : (
              <>
                <div className="rounded border border-destructive/20 bg-destructive/5 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-destructive/60">
                    Claims you couldn&apos;t tell were false. These are the ones that matter.
                  </p>
                </div>
                {defended.map((e) => (
                  <div key={e.id} className="rounded border border-border bg-surface-secondary p-4 border-l-2 border-l-destructive/40">
                    <div className="flex items-start gap-2">
                      <Skull className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive/60" />
                      <div>
                        <p className="font-sans text-[13px] leading-relaxed text-foreground/80">{e.content}</p>
                        <div className="mt-1 flex gap-3 font-mono text-[10px] text-muted-foreground/40">
                          <span>{e.topic}</span>
                          <span className="text-destructive/60">defended on {new Date(e.defended_at).toLocaleDateString()}</span>
                        </div>
                        <p className="mt-1 font-mono text-[10px] text-muted-foreground/30 italic">
                          you answered: &quot;{e.answer_given}&quot;
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
