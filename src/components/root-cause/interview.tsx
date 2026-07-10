'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Loader2, X, ArrowRight, Check, ThumbsDown, PenLine, Flag, History } from 'lucide-react'
import type { EvidencePack, InterviewMessage, InterviewTurn, SignatureMatch } from '@/lib/root-cause'
import type { CausalLayer, RootCausePayload } from '@/lib/resources'
import type { FailureDomain } from '@/lib/synthesis'
import { EvidenceCard, EvidenceList } from './evidence-card'
import { CausalChainView } from './causal-chain'

type Phase = 'setup' | 'matched' | 'interview' | 'synthesis' | 'saved'

const DOMAINS: { value: FailureDomain; label: string }[] = [
  { value: 'training', label: 'Training' },
  { value: 'academic', label: 'Academic' },
  { value: 'project', label: 'Project' },
  { value: 'other', label: 'Other' },
]

interface InterviewProps {
  onExit: () => void
  onSaved: () => void
  initialDescription?: string
}

export function RootCauseInterview({ onExit, onSaved, initialDescription = '' }: InterviewProps) {
  const [phase, setPhase] = useState<Phase>('setup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [description, setDescription] = useState(initialDescription)
  const [failureDate, setFailureDate] = useState(new Date().toISOString().slice(0, 10))
  const [domain, setDomain] = useState<FailureDomain>('training')

  const [evidence, setEvidence] = useState<EvidencePack | null>(null)
  const [signatureDescription, setSignatureDescription] = useState('')
  const [matches, setMatches] = useState<SignatureMatch[]>([])

  const [turn, setTurn] = useState<InterviewTurn | null>(null)
  const [history, setHistory] = useState<InterviewMessage[]>([])
  const [acceptedChain, setAcceptedChain] = useState<CausalLayer[]>([])
  const [currentLayer, setCurrentLayer] = useState(1)

  // Final synthesis result
  const [finalChain, setFinalChain] = useState<CausalLayer[]>([])
  const [rootCause, setRootCause] = useState('')
  const [preventions, setPreventions] = useState<string[]>([])

  // Henry's response inputs
  const [rejectMode, setRejectMode] = useState(false)
  const [proposeMode, setProposeMode] = useState(false)
  const [responseText, setResponseText] = useState('')

  const recordEnryTurn = (t: InterviewTurn): InterviewMessage[] => {
    let content = ''
    if (t.phase === 'probe') content = `${t.candidate_cause} — ${t.question_to_henry}`
    else if (t.phase === 'pushback') content = `${t.response_to_henry}${t.candidate_cause ? ` (alternative: ${t.candidate_cause})` : ''}`
    const msg: InterviewMessage = { role: 'enry', content }
    return content ? [...history, msg] : history
  }

  const handleStart = async () => {
    if (!description.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/root-cause/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ failure_description: description.trim(), failure_date: failureDate, domain }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to start')
        return
      }
      setEvidence(data.evidence)
      setSignatureDescription(data.signature_description ?? '')
      setMatches(data.matches ?? [])
      setTurn(data.first_turn ?? null)
      if ((data.matches ?? []).length > 0) setPhase('matched')
      else setPhase('interview')
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  // Advance the interview. `henryMessage` is Henry's response; `advance` whether
  // to move to the next why-layer; `force` to jump to synthesis.
  const nextTurn = async (henryMessage: string, advance: boolean, force = false, newlyAccepted?: CausalLayer) => {
    if (!evidence) return
    setBusy(true)
    setError(null)
    setRejectMode(false)
    setProposeMode(false)
    setResponseText('')

    // Fold the current enry turn + Henry's reply into history.
    const withEnry = turn ? recordEnryTurn(turn) : history
    const updatedHistory: InterviewMessage[] = [...withEnry, { role: 'henry', content: henryMessage }]
    const updatedChain = newlyAccepted ? [...acceptedChain, newlyAccepted] : acceptedChain
    const nextLayer = advance ? currentLayer + 1 : currentLayer

    try {
      const res = await fetch('/api/root-cause/turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failure_description: description.trim(),
          failure_date: failureDate,
          domain,
          evidence_text: evidence.text,
          current_layer: nextLayer,
          accepted_chain: updatedChain.map((c) => ({ layer: c.layer, cause: c.cause })),
          history: updatedHistory,
          force_synthesis: force,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Interview failed')
        return
      }

      setHistory(updatedHistory)
      setAcceptedChain(updatedChain)
      setCurrentLayer(nextLayer)

      const t = data.turn as InterviewTurn
      setTurn(t)

      if (t.phase === 'synthesis') {
        const chain = updatedChain.length
          ? updatedChain
          : t.causal_chain.map((l) => ({ ...l, accepted_by_user: true }))
        setFinalChain(chain)
        setRootCause(t.root_cause)
        setPreventions(t.preventions)
        setPhase('synthesis')
      }
    } catch {
      setError('Network error')
    } finally {
      setBusy(false)
    }
  }

  const candidateOf = (t: InterviewTurn | null): string =>
    t && (t.phase === 'probe' || t.phase === 'pushback') ? t.candidate_cause : ''

  const handleAccept = () => {
    if (!turn || (turn.phase !== 'probe' && turn.phase !== 'pushback')) return
    const layer: CausalLayer = {
      layer: currentLayer,
      cause: turn.candidate_cause,
      evidence: turn.evidence,
      accepted_by_user: true,
    }
    if (currentLayer >= 5) {
      nextTurn(`Accepted: ${turn.candidate_cause}`, true, true, layer)
    } else {
      nextTurn(`Accepted: ${turn.candidate_cause}`, true, false, layer)
    }
  }

  const handleReject = () => {
    if (!responseText.trim()) return
    nextTurn(`Rejected. ${responseText.trim()}`, false)
  }

  const handlePropose = () => {
    if (!responseText.trim()) return
    nextTurn(`I think the cause is: ${responseText.trim()}`, false)
  }

  const handleThatsTheRoot = () => {
    const cand = candidateOf(turn)
    nextTurn(cand ? `That's the root: ${cand}` : "That's the root.", false, true)
  }

  const handleSave = async () => {
    setBusy(true)
    try {
      const res = await fetch('/api/root-cause/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          failure_description: description.trim(),
          failure_date: failureDate,
          domain,
          causal_chain: finalChain,
          root_cause: rootCause,
          preventions,
          signature_description: signatureDescription,
        } satisfies Partial<RootCausePayload> & { signature_description: string }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error ?? 'Save failed')
        return
      }
      setPhase('saved')
      onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-base">
      {/* Minimal top bar — distraction-free */}
      <div className="flex items-center justify-between border-b border-border px-6 py-3">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">The Root Cause</span>
        {phase !== 'setup' && phase !== 'synthesis' && phase !== 'saved' && (
          <span className="font-mono text-[10px] text-muted-foreground">layer {Math.min(currentLayer, 5)} / 5</span>
        )}
        <button onClick={onExit} className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Exit">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-6 py-10">
          {error && <p className="mb-4 rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-400">{error}</p>}

          {/* ─── SETUP ─── */}
          {phase === 'setup' && (
            <div className="space-y-5">
              <div>
                <h1 className="font-display text-xl font-bold tracking-tight text-foreground">Something went wrong.</h1>
                <p className="mt-1 text-sm text-muted-foreground">Describe the failure in one sentence. enry will investigate it against your real logged data.</p>
              </div>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. I ran a 58 in the 400 when I was trained for 54."
                className="min-h-[80px] w-full resize-none rounded-md border border-border bg-surface-secondary p-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
              />
              <div className="flex flex-wrap gap-4">
                <div>
                  <label className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">When</label>
                  <input
                    type="date"
                    value={failureDate}
                    onChange={(e) => setFailureDate(e.target.value)}
                    className="rounded-md border border-border bg-surface-secondary px-3 py-1.5 text-sm text-foreground focus:border-primary/50 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="mb-1 block font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Domain</label>
                  <div className="flex gap-1.5">
                    {DOMAINS.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setDomain(d.value)}
                        className={`rounded-md border px-3 py-1.5 font-mono text-[11px] transition-colors ${
                          domain === d.value ? 'border-primary/50 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={handleStart}
                disabled={busy || !description.trim()}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-surface-base transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowRight className="h-3.5 w-3.5" />}
                Begin investigation
              </button>
            </div>
          )}

          {/* ─── MATCHED (pattern hit before interview) ─── */}
          {phase === 'matched' && (
            <div className="space-y-5">
              <div className="flex items-center gap-2">
                <History className="h-4 w-4 text-warning" />
                <span className="font-mono text-[10px] uppercase tracking-wider text-warning">Seen this shape before</span>
              </div>
              {matches.map((m) => (
                <div key={m.id} className="rounded-lg border border-warning/40 bg-warning/5 p-4">
                  <p className="text-sm text-foreground">
                    This looks like the same shape as <span className="font-medium">&ldquo;{m.title}&rdquo;</span> from {m.failureDate}.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Root cause then: <span className="text-foreground/90">{m.rootCause}</span>
                  </p>
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">similarity {(m.similarity * 100).toFixed(0)}%</p>
                </div>
              ))}
              <div className="flex gap-3">
                <button
                  onClick={() => setPhase('interview')}
                  className="rounded-md bg-primary px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-surface-base transition-opacity hover:opacity-90"
                >
                  Still investigate
                </button>
                <button onClick={onExit} className="rounded-md border border-border px-5 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
                  That&apos;s it — close
                </button>
              </div>
            </div>
          )}

          {/* ─── INTERVIEW ─── */}
          {phase === 'interview' && turn && (turn.phase === 'probe' || turn.phase === 'pushback') && (
            <motion.div key={history.length} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
              {/* Evidence context (collapsed set of cards from the pack) */}
              {evidence && evidence.cards.length > 0 && currentLayer === 1 && (
                <div className="space-y-1.5">
                  <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Evidence from the 3 weeks before</p>
                  <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    {evidence.cards.map((c, i) => (
                      <EvidenceCard key={i} card={c} />
                    ))}
                  </div>
                </div>
              )}

              <div className="rounded-lg border border-border bg-surface-secondary p-5">
                {turn.phase === 'pushback' && (
                  <p className="mb-3 text-sm leading-relaxed text-foreground/90">{turn.response_to_henry}</p>
                )}
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Candidate cause · layer {currentLayer}</p>
                <p className="mt-1.5 text-[15px] font-medium leading-snug text-foreground">{turn.candidate_cause}</p>
                {turn.evidence.length > 0 && (
                  <div className="mt-3">
                    <EvidenceList items={turn.evidence} />
                  </div>
                )}
                {turn.phase === 'probe' && (
                  <p className="mt-3 border-t border-border/40 pt-3 text-sm text-muted-foreground">{turn.question_to_henry}</p>
                )}
              </div>

              {/* Henry's response controls */}
              {!rejectMode && !proposeMode ? (
                <div className="flex flex-wrap gap-2">
                  <button onClick={handleAccept} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-surface-base transition-opacity hover:opacity-90 disabled:opacity-40">
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                    Accept
                  </button>
                  <button onClick={() => { setRejectMode(true); setResponseText('') }} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
                    <ThumbsDown className="h-3 w-3" /> Reject
                  </button>
                  <button onClick={() => { setProposeMode(true); setResponseText('') }} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
                    <PenLine className="h-3 w-3" /> Different cause
                  </button>
                  <button onClick={handleThatsTheRoot} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
                    <Flag className="h-3 w-3" /> That&apos;s the root
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <textarea
                    autoFocus
                    value={responseText}
                    onChange={(e) => setResponseText(e.target.value)}
                    placeholder={rejectMode ? 'Why doesn’t this cause fit?' : 'What do you think the cause was?'}
                    className="min-h-[64px] w-full resize-none rounded-md border border-border bg-surface-secondary p-3 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-primary/50 focus:outline-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={rejectMode ? handleReject : handlePropose}
                      disabled={busy || !responseText.trim()}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-surface-base transition-opacity hover:opacity-90 disabled:opacity-40"
                    >
                      {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                      Send
                    </button>
                    <button onClick={() => { setRejectMode(false); setProposeMode(false) }} className="rounded-md border border-border px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {phase === 'interview' && busy && !turn && (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          )}

          {/* ─── SYNTHESIS ─── */}
          {phase === 'synthesis' && (
            <div className="space-y-6">
              <AnimatePresence>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <h1 className="mb-1 font-display text-xl font-bold tracking-tight text-foreground">The causal chain</h1>
                  <p className="mb-5 text-sm text-muted-foreground">{description}</p>
                  <CausalChainView chain={finalChain} rootCause={rootCause} preventions={preventions} />
                </motion.div>
              </AnimatePresence>
              <div className="flex gap-3">
                <button onClick={handleSave} disabled={busy} className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-surface-base transition-opacity hover:opacity-90 disabled:opacity-40">
                  {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Save root cause
                </button>
                <button onClick={onExit} className="rounded-md border border-border px-5 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
                  Discard
                </button>
              </div>
            </div>
          )}

          {phase === 'saved' && (
            <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15">
                <Check className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm text-foreground">Saved. This failure&apos;s signature is now on file — the next one that looks like it will surface this.</p>
              <button onClick={onExit} className="mt-2 rounded-md border border-border px-5 py-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground">
                Close
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
