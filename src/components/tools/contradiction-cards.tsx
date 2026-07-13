'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from 'next-auth/react'
import { Loader2, ScanSearch, X, Eye, ArrowLeft } from 'lucide-react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import type { ContradictionEntry } from '@/lib/contradictions'

export function ContradictionCards() {
  const { status } = useSession()
  const [contradictions, setContradictions] = useState<ContradictionEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)

  const fetchContradictions = useCallback(async () => {
    if (status !== 'authenticated') return
    setLoading(true)
    try {
      const res = await fetch('/api/tools/contradictions')
      const data = await res.json()
      setContradictions(data.contradictions ?? [])
    } catch { setContradictions([]) }
    setLoading(false)
  }, [status])

  useEffect(() => { fetchContradictions() }, [fetchContradictions])

  const handleScan = async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch('/api/tools/contradictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'scan' }),
      })
      const data = await res.json()
      setScanResult(data.message ?? `Found ${data.created ?? 0} contradictions`)
      await fetchContradictions()
    } catch {
      setScanResult('Scan failed — try again')
    }
    setScanning(false)
  }

  const handleDismiss = async (id: string) => {
    await fetch('/api/tools/contradictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'dismiss', id }),
    })
    setContradictions(prev => prev.map(c => c.id === id ? { ...c, status: 'dismissed' as const } : c))
  }

  const handleReflect = async (id: string) => {
    await fetch('/api/tools/contradictions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reflected', id }),
    })
    setContradictions(prev => prev.map(c => c.id === id ? { ...c, status: 'reflected' as const } : c))
  }

  const openContradictions = contradictions.filter(c => c.status === 'open')
  const resolvedContradictions = contradictions.filter(c => c.status !== 'open')

  if (status === 'loading') {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      {/* Header */}
      <header className="sticky top-0 z-20 border-b border-border/40 bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-5">
          <Link href="/resources" className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3 w-3" />
            <span>[BACK]</span>
          </Link>
          <div className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            <span>CONTRADICTION FINDER</span>
            {!loading && <><span className="text-border">·</span><span>{openContradictions.length} OPEN</span></>}
          </div>
          <div />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Contradiction Finder</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
            Surface beliefs or claims you made that contradict each other over time
          </p>
        </div>

        {/* Scan button */}
        <div className="mb-10">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-2 rounded-md border border-border/60 bg-surface-secondary px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-all hover:border-primary/30 hover:text-primary disabled:opacity-50"
          >
            {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
            {scanning ? 'Scanning...' : 'Scan for Contradictions'}
          </button>
          {scanResult && (
            <p className="mt-2 font-mono text-[10px] text-muted-foreground">{scanResult}</p>
          )}
        </div>

        {/* Contradiction cards */}
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : openContradictions.length === 0 ? (
          <div className="rounded-lg border border-border/40 bg-surface-secondary p-8 text-center">
            <span className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">
              [EMPTY]
            </span>
            <p className="mt-3 text-sm text-muted-foreground">
              {contradictions.length === 0
                ? 'No contradictions found yet. Click "Scan" to analyze your notes.'
                : 'No open contradictions.'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {openContradictions.map((c, i) => (
              <motion.div
                key={c.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-lg border border-border/40 bg-surface-secondary p-5"
              >
                <p className="mb-3 text-sm leading-relaxed text-foreground">{c.summary}</p>

                {/* Entry snippets */}
                <div className="mb-4 space-y-2">
                  {c.entries_referenced.map((ref, j) => (
                    <div key={j} className="rounded border border-border/30 bg-surface-elevated px-3 py-2">
                      <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
                        {ref.type} · {ref.title}
                      </div>
                      <p className="font-mono text-[10px] leading-relaxed text-muted-foreground">
                        {ref.snippet}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleReflect(c.id)}
                    className="flex items-center gap-1 rounded border border-border/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-all hover:border-primary/40 hover:text-primary"
                  >
                    <Eye className="h-3 w-3" />
                    Reflect
                  </button>
                  <button
                    onClick={() => handleDismiss(c.id)}
                    className="flex items-center gap-1 rounded border border-border/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50 transition-all hover:border-border/60 hover:text-muted-foreground"
                  >
                    <X className="h-3 w-3" />
                    Dismiss
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Resolved section */}
        {resolvedContradictions.length > 0 && (
          <div className="mt-12">
            <h2 className="mb-4 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground/40">
              [RESOLVED: {resolvedContradictions.length}]
            </h2>
            <div className="space-y-2">
              {resolvedContradictions.map(c => (
                <div key={c.id} className="rounded border border-border/20 bg-surface-secondary/50 px-4 py-3 opacity-60">
                  <p className="text-xs text-muted-foreground">{c.summary}</p>
                  <span className="mt-1 inline-block font-mono text-[9px] uppercase text-muted-foreground/40">
                    {c.status === 'dismissed' ? '[DISMISSED]' : '[REFLECTED]'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
