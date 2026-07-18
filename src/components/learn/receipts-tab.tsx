'use client'

import { useEffect, useState } from 'react'
import { FileText, Check, X, AlertTriangle, HelpCircle } from 'lucide-react'

interface Receipt {
  id: string
  claim_id: string
  claim_content: string
  message_snippet: string
  similarity: number
  resolved: boolean
  resolution?: 'affirmed' | 'reversed' | 'clarified' | 'dismissed'
  created_at: string
  resolved_at?: string
}

const RESOLUTION_LABELS: Record<string, { label: string; color: string }> = {
  affirmed: { label: 'Claim was right', color: 'text-primary' },
  reversed: { label: 'Message was right', color: 'text-accent' },
  clarified: { label: 'Not a contradiction', color: 'text-warning' },
  dismissed: { label: 'Dismissed', color: 'text-muted-foreground' },
}

export default function ReceiptsTab() {
  const [receipts, setReceipts] = useState<Receipt[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [resolving, setResolving] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/learn/receipts')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error)
        setReceipts(data.receipts ?? [])
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleResolve = async (eventId: string, resolution: string) => {
    setResolving(eventId)
    try {
      const res = await fetch('/api/learn/receipts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_id: eventId, resolution }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      // Update local state
      setReceipts((prev) =>
        prev.map((r) =>
          r.id === eventId ? { ...r, resolved: true, resolution: resolution as Receipt['resolution'], resolved_at: new Date().toISOString() } : r,
        ),
      )
    } catch {
      setError('Network error')
    } finally {
      setResolving(null)
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

  const unresolved = receipts.filter((r) => !r.resolved)
  const resolved = receipts.filter((r) => r.resolved)

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto max-w-[720px] space-y-6 px-8 py-6">
        {/* Stats */}
        <div className="flex gap-4 font-mono text-[10px] text-muted-foreground/40">
          <span>{receipts.length} total receipts</span>
          <span>{unresolved.length} pending</span>
          <span>{resolved.length} resolved</span>
        </div>

        {/* Unresolved */}
        {unresolved.length > 0 && (
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-warning/60 mb-3">
              <AlertTriangle className="h-3.5 w-3.5" /> Pending
            </div>
            <div className="space-y-3">
              {unresolved.map((r) => (
                <div key={r.id} className="rounded border border-warning/20 bg-warning/5 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning/60" />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[10px] uppercase tracking-wider text-warning/50">Prior claim</p>
                      <p className="mt-1 font-sans text-[12px] leading-relaxed text-foreground/80">{r.claim_content}</p>
                    </div>
                  </div>
                  <div className="border-l-2 border-foreground/10 pl-3">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40">You just said</p>
                    <p className="mt-1 font-sans text-[12px] leading-relaxed text-foreground/60">{r.message_snippet}</p>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleResolve(r.id, 'affirmed')} disabled={resolving === r.id}
                      className="rounded border border-primary/30 bg-primary/10 px-2.5 py-1 font-mono text-[10px] text-primary hover:bg-primary/20 disabled:opacity-40">
                      Claim was right
                    </button>
                    <button onClick={() => handleResolve(r.id, 'reversed')} disabled={resolving === r.id}
                      className="rounded border border-accent/30 bg-accent/10 px-2.5 py-1 font-mono text-[10px] text-accent hover:bg-accent/20 disabled:opacity-40">
                      I changed my mind
                    </button>
                    <button onClick={() => handleResolve(r.id, 'clarified')} disabled={resolving === r.id}
                      className="rounded border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40">
                      Not a contradiction
                    </button>
                    <button onClick={() => handleResolve(r.id, 'dismissed')} disabled={resolving === r.id}
                      className="rounded border border-border px-2.5 py-1 font-mono text-[10px] text-muted-foreground/50 hover:text-muted-foreground disabled:opacity-40">
                      Dismiss
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Resolved */}
        {resolved.length > 0 && (
          <div>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/40 mb-3">
              <Check className="h-3.5 w-3.5" /> Resolved
            </div>
            <div className="space-y-2">
              {resolved.map((r) => {
                const meta = r.resolution ? RESOLUTION_LABELS[r.resolution] : RESOLUTION_LABELS.dismissed
                return (
                  <div key={r.id} className="rounded border border-border bg-surface-secondary p-3 opacity-60">
                    <p className="font-sans text-[12px] leading-relaxed text-foreground/60 line-clamp-2">{r.claim_content}</p>
                    <div className="mt-1 flex gap-3 font-mono text-[10px] text-muted-foreground/30">
                      <span className={meta.color}>{meta.label}</span>
                      <span>{new Date(r.created_at).toLocaleDateString()}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {receipts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <HelpCircle className="h-5 w-5 text-muted-foreground/20" />
            <p className="font-mono text-[11px] text-muted-foreground/40 text-center max-w-xs">
              No contradictions surfaced yet. Receipts fires when you say something in chat that semantically contradicts a stored claim — like a receipt being slapped on the table.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
