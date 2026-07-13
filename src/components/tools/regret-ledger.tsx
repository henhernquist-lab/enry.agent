'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, Plus, BookOpen, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import type { RegretEntry } from '@/lib/regret-ledger'

export function RegretLedger() {
  const { status } = useSession()
  const [entries, setEntries] = useState<RegretEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [reflectEntry, setReflectEntry] = useState<RegretEntry | null>(null)

  // Create form state
  const [decisionText, setDecisionText] = useState('')
  const [whyUncertain, setWhyUncertain] = useState('')
  const [alternative, setAlternative] = useState('')
  const [worry, setWorry] = useState('')
  const [intervalDays, setIntervalDays] = useState(30)
  const [submitting, setSubmitting] = useState(false)

  // Reflect form state
  const [reflectOutcome, setReflectOutcome] = useState<'held_up' | 'dissolved' | 'morphed'>('held_up')
  const [reflectText, setReflectText] = useState('')

  const fetchEntries = useCallback(async () => {
    if (status !== 'authenticated') return
    setLoading(true)
    try {
      const res = await fetch('/api/tools/regrets')
      const data = await res.json()
      setEntries(data.entries ?? [])
    } catch { setEntries([]) }
    setLoading(false)
  }, [status])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  const handleCreate = async () => {
    if (!decisionText.trim() || !whyUncertain.trim()) return
    setSubmitting(true)
    await fetch('/api/tools/regrets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        decision_text: decisionText,
        why_uncertain: whyUncertain,
        alternative_considered: alternative || undefined,
        worry: worry || undefined,
        resurface_interval_days: intervalDays,
      }),
    })
    setDecisionText(''); setWhyUncertain(''); setAlternative(''); setWorry(''); setIntervalDays(30)
    setShowCreate(false)
    setSubmitting(false)
    await fetchEntries()
  }

  const handleReflect = async () => {
    if (!reflectEntry || !reflectText.trim()) return
    setSubmitting(true)
    await fetch(`/api/tools/regrets/${reflectEntry.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reflect', outcome: reflectOutcome, reflection_text: reflectText }),
    })
    setReflectEntry(null)
    setReflectText('')
    setSubmitting(false)
    await fetchEntries()
  }

  const handleResolve = async (id: string) => {
    await fetch(`/api/tools/regrets/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'resolve' }),
    })
    await fetchEntries()
  }

  const pendingResurface = entries.filter(e => e.status === 'open' && new Date(e.resurface_at) <= new Date())

  const outcomeLabel = (o: string) => o === 'held_up' ? 'Regret held up' : o === 'dissolved' ? 'Regret dissolved' : 'Regret changed shape'

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <header className="sticky top-0 z-20 border-b border-border/40 bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-5">
          <Link href="/resources" className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3 w-3" />
            <span>[BACK]</span>
          </Link>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span>REGRET LEDGER</span>
            {!loading && <><span className="text-border">·</span><span>{entries.length} ENTRIES</span></>}
            {pendingResurface.length > 0 && <><span className="text-border">·</span><span className="text-primary">{pendingResurface.length} PENDING</span></>}
          </div>
          <div />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Regret Ledger</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              Log uncertain decisions. Revisit monthly. See if regrets hold up.
            </p>
          </div>
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="flex items-center gap-1.5 rounded-md border border-border/60 bg-surface-secondary px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-all hover:border-primary/30 hover:text-primary"
          >
            <Plus className="h-3.5 w-3.5" />
            LOG
          </button>
        </div>

        {/* Create form */}
        {showCreate && (
          <div className="mb-8 rounded-lg border border-border/40 bg-surface-secondary p-5">
            <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">[NEW ENTRY]</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-muted-foreground">Decision</label>
                <textarea
                  value={decisionText}
                  onChange={e => setDecisionText(e.target.value)}
                  className="w-full rounded border border-border/40 bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none"
                  rows={2}
                  placeholder="What decision are you uncertain about?"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-muted-foreground">Why uncertain?</label>
                <textarea
                  value={whyUncertain}
                  onChange={e => setWhyUncertain(e.target.value)}
                  className="w-full rounded border border-border/40 bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none"
                  rows={2}
                  placeholder="What makes you unsure about this choice?"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-muted-foreground">Alternative considered (optional)</label>
                <input
                  value={alternative}
                  onChange={e => setAlternative(e.target.value)}
                  className="w-full rounded border border-border/40 bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none"
                  placeholder="What was the other option?"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-muted-foreground">What are you worried you will regret? (optional)</label>
                <input
                  value={worry}
                  onChange={e => setWorry(e.target.value)}
                  className="w-full rounded border border-border/40 bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none"
                  placeholder="What specifically are you worried about?"
                />
              </div>
              <div>
                <label className="mb-1 block font-mono text-[10px] uppercase text-muted-foreground">Resurface interval</label>
                <select
                  value={intervalDays}
                  onChange={e => setIntervalDays(Number(e.target.value))}
                  className="rounded border border-border/40 bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground focus:border-primary/40 focus:outline-none"
                >
                  <option value={30}>30 days</option>
                  <option value={60}>60 days</option>
                  <option value={90}>90 days</option>
                  <option value={180}>180 days</option>
                </select>
              </div>
              <div className="flex gap-3">
                <button onClick={handleCreate} disabled={submitting || !decisionText.trim() || !whyUncertain.trim()}
                  className="rounded-md border border-primary/40 bg-primary/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary transition-all hover:bg-primary/20 disabled:opacity-30">
                  {submitting ? 'SAVING...' : 'SAVE ENTRY'}
                </button>
                <button onClick={() => setShowCreate(false)} className="rounded-md border border-border/40 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-all hover:border-border/60">
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Pending resurface alert */}
        {pendingResurface.length > 0 && (
          <div className="mb-6 rounded-lg border border-primary/30 bg-primary/[0.04] px-4 py-3">
            <p className="font-mono text-[10px] uppercase tracking-wider text-primary">
              [{pendingResurface.length} ENTR{pendingResurface.length === 1 ? 'Y' : 'IES'} READY FOR REFLECTION]
            </p>
          </div>
        )}

        {/* Entry list */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : entries.length === 0 ? (
          <div className="rounded-lg border border-border/40 bg-surface-secondary p-8 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">[EMPTY]</span>
            <p className="mt-3 text-sm text-muted-foreground">No regret entries yet. Log a decision you are uncertain about.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {entries.map((entry, i) => {
              const isPending = entry.status === 'open' && new Date(entry.resurface_at) <= new Date()
              return (
                <div key={entry.id} className={`rounded-lg border p-5 ${isPending ? 'border-primary/30 bg-primary/[0.03]' : 'border-border/40 bg-surface-secondary'}`}>
                  <div className="mb-1 flex items-center gap-2">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">
                      {new Date(entry.created_at).toLocaleDateString()}
                    </span>
                    <span className={`font-mono text-[9px] uppercase tracking-wider ${entry.status === 'resolved' ? 'text-muted-foreground/30' : isPending ? 'text-primary' : 'text-muted-foreground/50'}`}>
                      [{entry.status === 'resolved' ? 'RESOLVED' : isPending ? 'PENDING REFLECTION' : `RESURFACES ${new Date(entry.resurface_at).toLocaleDateString()}`}]
                    </span>
                  </div>

                  <h3 className="font-bold text-foreground">{entry.decision_text}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{entry.why_uncertain}</p>
                  {entry.alternative_considered && (
                    <p className="mt-1 text-xs text-muted-foreground/60">Alternative: {entry.alternative_considered}</p>
                  )}
                  {entry.worry && (
                    <p className="mt-1 text-xs text-muted-foreground/60">Worry: {entry.worry}</p>
                  )}

                  {/* Past reflections */}
                  {(entry.reflections ?? []).length > 0 && (
                    <div className="mt-3 border-t border-border/20 pt-3">
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/40">[REFLECTIONS]</span>
                      {(entry.reflections ?? []).map((r, j) => (
                        <div key={j} className="mt-1 pl-3 border-l border-border/30">
                          <span className="font-mono text-[9px] uppercase text-muted-foreground/50">{outcomeLabel(r.outcome)}</span>
                          <p className="text-xs text-muted-foreground">{r.reflection_text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  {entry.status === 'open' && (
                    <div className="mt-3 flex gap-3">
                      {isPending && (
                        <button onClick={() => setReflectEntry(entry)}
                          className="flex items-center gap-1 rounded border border-primary/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-primary transition-all hover:bg-primary/10">
                          <BookOpen className="h-3 w-3" /> Reflect now
                        </button>
                      )}
                      <button onClick={() => handleResolve(entry.id)}
                        className="rounded border border-border/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50 transition-all hover:border-border/60">
                        Resolve
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Reflection modal */}
        {reflectEntry && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6">
            <div className="w-full max-w-md rounded-lg border border-border/40 bg-surface-secondary p-5">
              <h3 className="mb-1 font-bold text-foreground">{reflectEntry.decision_text}</h3>
              <p className="mb-4 text-xs text-muted-foreground">Did the regret hold up, dissolve, or change shape?</p>

              <div className="mb-4 flex gap-2">
                {(['held_up', 'dissolved', 'morphed'] as const).map(o => (
                  <button key={o}
                    onClick={() => setReflectOutcome(o)}
                    className={`rounded px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
                      reflectOutcome === o
                        ? 'border-primary/40 bg-primary/10 text-primary'
                        : 'border border-border/40 text-muted-foreground hover:border-border/60'
                    }`}>
                    {o === 'held_up' ? 'Regret held up' : o === 'dissolved' ? 'Regret dissolved' : 'Morphed'}
                  </button>
                ))}
              </div>

              <textarea
                value={reflectText}
                onChange={e => setReflectText(e.target.value)}
                className="mb-4 w-full rounded border border-border/40 bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder:text-muted-foreground/30 focus:border-primary/40 focus:outline-none"
                rows={3}
                placeholder="What happened? How do you feel about this decision now?"
              />

              <div className="flex gap-3">
                <button onClick={handleReflect} disabled={submitting}
                  className="rounded-md border border-primary/40 bg-primary/10 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-primary transition-all hover:bg-primary/20 disabled:opacity-30">
                  {submitting ? 'SAVING...' : 'SAVE REFLECTION'}
                </button>
                <button onClick={() => setReflectEntry(null)}
                  className="rounded-md border border-border/40 px-4 py-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-all hover:border-border/60">
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
