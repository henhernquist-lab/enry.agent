'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import {
  ArrowLeft, FlaskConical, Lightbulb, GitPullRequest, BarChart3,
  Zap, Loader2, CheckCircle2, AlertTriangle, ChevronDown, ExternalLink,
  GitMerge, Dna, XCircle, Code, Sparkles, Moon, Play, Trash2, Plus,
  Clock, Timer, RefreshCw,
} from 'lucide-react'
import type { PromptRevisionRow, LabStats, EvolutionCandidate, OvernightIdeaRow, OvernightRunRow } from '@/lib/lab/types'
import { LiveWorkspace } from '@/components/live-workspace'

const SKILL_SLUGS = [
  'cartographer', 'ghost-hunter', 'bisector', 'build-vs-buy-vs-skip',
  'estimator', 'scope-cutter', 'failure-mode-mapper',
  'drive-devil-advocate', 'drive-assumption-excavator', 'drive-pre-mortem',
  'drive-interrogator', 'drive-eli-expert',
  'code-reviewer', 'code-council', 'simplifier', 'architect',
  'rubber-duck', 'explainer',
  'show-your-work', 'test-first', 'slow-down', 'prove-it-works',
  'first-principles', 'adversarial-coding', 'two-model-consensus',
  'codebase-grounded',
]

export default function LabPage() {
  const [stats, setStats] = useState<LabStats | null>(null)
  const [revisions, setRevisions] = useState<PromptRevisionRow[]>([])
  const [loading, setLoading] = useState(true)

  // Review-trigger state
  const [reviewSkill, setReviewSkill] = useState<string | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewRunning, setReviewRunning] = useState(false)
  const [reviewResult, setReviewResult] = useState<PromptRevisionRow | null>(null)
  const [reviewError, setReviewError] = useState<string | null>(null)

  // Evolution state
  const [evolvePrompt, setEvolvePrompt] = useState('')
  const [evolveRunning, setEvolveRunning] = useState(false)
  const [evolveResult, setEvolveResult] = useState<{
    id: string
    status: string
    candidates: EvolutionCandidate[]
    hybrid_output: string | null
    trait_breakdown: Record<string, string> | null
    similarity_scores: Record<string, number> | null
    hybrid_genuine: boolean | null
    reasoning?: string
    run_time_ms: number
    error?: string
  } | null>(null)
  const [evolveError, setEvolveError] = useState<string | null>(null)

  // Overnight R&D state
  const [overnightIdeas, setOvernightIdeas] = useState<OvernightIdeaRow[]>([])
  const [overnightLoading, setOvernightLoading] = useState(true)
  const [overnightDispatchingId, setOvernightDispatchingId] = useState<string | null>(null)
  const [overnightError, setOvernightError] = useState<string | null>(null)
  // Track the active run ID for live workspace polling
  const [activeOvernightRunId, setActiveOvernightRunId] = useState<string | null>(null)

  const loadOvernightData = () => {
    fetch('/api/lab/overnight/ideas')
      .then((r) => r.json())
      .then((d) => setOvernightIdeas(d.ideas ?? []))
      .catch(() => setOvernightIdeas([]))
      .finally(() => setOvernightLoading(false))
  }

  const loadData = () => {
    fetch('/api/lab/stats')
      .then((r) => r.json())
      .then((d) => setStats(d.stats ?? null))
      .catch(() => setStats(null))

    fetch('/api/lab/revisions')
      .then((r) => r.json())
      .then((d) => setRevisions(d.revisions ?? []))
      .finally(() => setLoading(false))

    loadOvernightData()
  }

  useEffect(() => { loadData() }, [])

  const runReview = async () => {
    if (!reviewSkill) return
    setReviewRunning(true)
    setReviewError(null)
    setReviewResult(null)
    try {
      const res = await fetch('/api/lab/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ skill_slug: reviewSkill }),
      })
      const data = await res.json()
      if (!res.ok) {
        setReviewError(data.error ?? 'Review failed')
        return
      }
      setReviewResult(data.revision as PromptRevisionRow)
      loadData()
    } catch (e) {
      setReviewError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setReviewRunning(false)
    }
  }

  const runEvolution = async () => {
    if (!evolvePrompt.trim()) return
    setEvolveRunning(true)
    setEvolveError(null)
    setEvolveResult(null)
    try {
      const res = await fetch('/api/lab/evolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: evolvePrompt }),
      })
      const data = await res.json()
      if (!res.ok) {
        setEvolveError(data.error ?? 'Evolution run failed')
        return
      }
      setEvolveResult(data.run)
    } catch (e) {
      setEvolveError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setEvolveRunning(false)
    }
  }

  const handleOvernightDispatch = async (ideaId: string) => {
    setOvernightDispatchingId(ideaId)
    setOvernightError(null)
    try {
      const res = await fetch('/api/lab/overnight/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea_id: ideaId }),
      })
      const data = await res.json()
      if (!res.ok) {
        setOvernightError(data.error ?? 'Dispatch failed')
        return
      }
      // Track the run ID so the LiveWorkspace can poll for steps
      if (data.run?.id) setActiveOvernightRunId(data.run.id)
      loadOvernightData()
    } catch (e) {
      setOvernightError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setOvernightDispatchingId(null)
    }
  }

  const handleOvernightDelete = async (ideaId: string) => {
    try {
      await fetch(`/api/lab/overnight/ideas?id=${ideaId}`, { method: 'DELETE' })
      loadOvernightData()
    } catch {}
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Home
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">Enry Lab</span>
      </header>

      <div className="mb-10">
        <h1 className="mb-2 flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <FlaskConical className="h-6 w-6 text-primary" />
          Enry Lab
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Experimental features: skill prompt improvement, evolutionary code generation, and overnight R&D.
        </p>
      </div>

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={BarChart3} label="Total invocations" value={stats?.totalInvocations ?? 0} loading={loading} />
        <StatCard icon={Lightbulb} label="Feedback rate" value={`${stats?.feedbackRate ?? 0}%`} loading={loading} />
        <StatCard icon={GitPullRequest} label="Proposed revisions" value={stats?.proposedRevisions ?? 0} loading={loading} />
        <StatCard icon={GitPullRequest} label="Approved revisions" value={stats?.approvedRevisions ?? 0} loading={loading} />
      </div>

      {/* ── Section 1: Evolutionary Code Generation ── */}
      <section className="mb-10">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <GitMerge className="h-3.5 w-3.5" /> Evolutionary Code Generation
          </span>
        </h2>
        <div className="rounded border border-border bg-surface-secondary p-4">
          <p className="mb-3 font-mono text-[11px] text-muted-foreground">
            3 models generate solutions in parallel. A judge extracts the best trait from each and synthesizes a hybrid.
            Levenshtein similarity check verifies the hybrid is genuinely new — not just a relabeled winner.
          </p>
          <div className="flex items-start gap-3">
            <textarea
              value={evolvePrompt}
              onChange={(e) => setEvolvePrompt(e.target.value)}
              placeholder="Describe a coding problem — e.g. 'Write a rate limiter in TypeScript' or 'Refactor the auth middleware to handle token expiry'"
              rows={3}
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              disabled={evolveRunning}
              className="flex-1 resize-none rounded border border-border bg-surface-elevated px-3 py-2 font-mono text-[12px] leading-relaxed text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none disabled:opacity-40"
            />
            <button
              onClick={runEvolution}
              disabled={evolveRunning || !evolvePrompt.trim()}
              className="flex flex-shrink-0 items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
            >
              {evolveRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Dna className="h-3.5 w-3.5" />}
              {evolveRunning ? 'Running evolution…' : 'Run evolution'}
            </button>
          </div>
          <div className="mt-2 flex items-center gap-3 font-mono text-[9px] text-muted-foreground/50">
            <span className="flex items-center gap-1"><Code className="h-2.5 w-2.5" /> DeepSeek V4 Pro</span>
            <span className="flex items-center gap-1"><Code className="h-2.5 w-2.5" /> MiniMax M3</span>
            <span className="flex items-center gap-1"><Code className="h-2.5 w-2.5" /> Qwen 3.5 397B</span>
            <span className="text-muted-foreground/30">→ judge → hybrid</span>
          </div>

          {evolveRunning && (
            <div className="mt-4 flex items-center gap-2 rounded border border-border bg-surface-elevated p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="font-mono text-[11px] text-muted-foreground">
                Generating 3 independent solutions in parallel, then judging and synthesizing…
              </span>
            </div>
          )}

          {evolveError && (
            <div className="mt-4 flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
              <span className="font-mono text-[11px] text-warning">{evolveError}</span>
            </div>
          )}

          {evolveResult && (
            <div className="mt-4 space-y-4">
              <div className={`flex items-center gap-2 rounded border px-3 py-2 ${
                evolveResult.status === 'completed' ? 'border-primary/20 bg-primary/5' :
                evolveResult.status === 'degenerate' ? 'border-warning/20 bg-warning/5' :
                evolveResult.status === 'all_failed' ? 'border-destructive/20 bg-destructive/5' :
                'border-border bg-surface-elevated'
              }`}>
                {evolveResult.status === 'completed' ? (
                  <><CheckCircle2 className="h-4 w-4 text-primary" /><span className="font-mono text-[11px] font-semibold text-primary">Hybrid synthesized — genuine</span></>
                ) : evolveResult.status === 'degenerate' ? (
                  <><AlertTriangle className="h-4 w-4 text-warning" /><span className="font-mono text-[11px] font-semibold text-warning">Degenerate synthesis — hybrid too similar to a candidate</span></>
                ) : evolveResult.status === 'all_failed' ? (
                  <><XCircle className="h-4 w-4 text-destructive" /><span className="font-mono text-[11px] font-semibold text-destructive">All 3 models failed</span></>
                ) : (
                  <><XCircle className="h-4 w-4 text-muted-foreground" /><span className="font-mono text-[11px] font-semibold text-muted-foreground">Error: {evolveResult.error}</span></>
                )}
                <span className="ml-auto font-mono text-[9px] text-muted-foreground">{evolveResult.run_time_ms}ms</span>
              </div>

              {evolveResult.candidates.length > 0 && (
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Candidates</p>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {evolveResult.candidates.map((c, i) => (
                      <motion.div key={c.model} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}
                        className={`rounded border p-3 ${c.status === 'ok' ? 'border-border bg-surface-elevated' : 'border-destructive/20 bg-destructive/5'}`}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="font-mono text-[10px] font-semibold text-foreground">{c.model_label}</span>
                          <span className={`rounded px-1 py-0.5 font-mono text-[8px] uppercase ${c.status === 'ok' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'}`}>
                            {c.status}{c.error ? ` — ${c.error}` : ''}
                          </span>
                        </div>
                        <pre className="max-h-32 overflow-auto rounded bg-[#080808] p-2 font-mono text-[9px] leading-relaxed text-foreground/60 whitespace-pre-wrap">
                          {c.output ? (c.output.length > 600 ? c.output.slice(0, 600) + '\n…' : c.output) : '(empty)'}
                        </pre>
                        {evolveResult.similarity_scores?.[c.model_label] != null && (
                          <div className="mt-1.5 flex items-center gap-1 font-mono text-[9px]">
                            <span className="text-muted-foreground/50">Similarity to hybrid:</span>
                            <span className={evolveResult.similarity_scores[c.model_label] > 0.85 ? 'text-destructive' : 'text-primary'}>
                              {(evolveResult.similarity_scores[c.model_label] * 100).toFixed(0)}%
                            </span>
                          </div>
                        )}
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {evolveResult.trait_breakdown && Object.keys(evolveResult.trait_breakdown).length > 0 && (
                <div>
                  <p className="mb-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Trait Breakdown</p>
                  <div className="space-y-1.5">
                    {Object.entries(evolveResult.trait_breakdown).map(([model, trait]) => (
                      <div key={model} className="flex items-start gap-2 rounded border border-border bg-surface-elevated p-2">
                        <Sparkles className="mt-0.5 h-3 w-3 flex-shrink-0 text-warning" />
                        <div>
                          <span className="font-mono text-[10px] font-semibold text-foreground">{model}:</span>{' '}
                          <span className="font-mono text-[10px] text-muted-foreground">{trait}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {evolveResult.reasoning && (
                <div>
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Judge reasoning</p>
                  <p className="font-mono text-[11px] leading-relaxed text-foreground/80">{evolveResult.reasoning}</p>
                </div>
              )}

              {evolveResult.hybrid_output && (
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Hybrid Output</p>
                    {evolveResult.hybrid_genuine === true && (
                      <span className="rounded bg-primary/10 px-1.5 py-0.5 font-mono text-[8px] text-primary">GENUINE SYNTHESIS</span>
                    )}
                    {evolveResult.hybrid_genuine === false && (
                      <span className="rounded bg-warning/10 px-1.5 py-0.5 font-mono text-[8px] text-warning">MAY BE DEGENERATE</span>
                    )}
                  </div>
                  <pre className="max-h-64 overflow-auto rounded border border-border bg-surface-elevated p-3 font-mono text-[10px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                    {evolveResult.hybrid_output}
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      {/* ── Section 2: Overnight R&D ── */}
      <section className="mb-10">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Moon className="h-3.5 w-3.5" /> Overnight Autonomous R&D
          </span>
        </h2>
        <div className="rounded border border-border bg-surface-secondary p-4">
          <p className="mb-3 font-mono text-[11px] text-muted-foreground">
            Park ideas here. Dispatch them to disposable scratch repos in the{' '}
            <code className="rounded bg-surface-elevated px-1 py-0.5 text-[10px]">enry-lab-experiments</code> org.
            The runner explores, tests, and reports back. <strong>Never touches real repos.</strong>
          </p>

          <OvernightIdeaForm onCreated={loadOvernightData} />

          {overnightError && (
            <div className="mt-3 flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
              <span className="font-mono text-[11px] text-warning">{overnightError}</span>
            </div>
          )}

          {/* Live Workspace — shown when an overnight run is dispatching or active */}
          <div className="mt-3">
            <LiveWorkspace
              pollUrl={activeOvernightRunId ? `/api/lab/overnight/live-steps?run_id=${activeOvernightRunId}` : null}
              controlUrl={activeOvernightRunId ? '/api/lab/overnight/control' : null}
              controlId={activeOvernightRunId}
              hidden={!activeOvernightRunId}
              onFinished={(status) => {
                console.log(`[lab] overnight run finished: ${status}`)
                loadOvernightData()
              }}
            />
          </div>

          {overnightLoading ? (
            <p className="mt-3 text-[11px] text-muted-foreground">Loading ideas…</p>
          ) : overnightIdeas.length === 0 ? (
            <div className="mt-3 rounded border border-dashed border-border p-6 text-center">
              <p className="text-sm text-muted-foreground">No ideas parked yet.</p>
              <p className="mt-1 text-xs text-muted-foreground/60">
                Add an idea above to create a disposable scratch-repo experiment.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2">
              {overnightIdeas.map((idea) => (
                <motion.div
                  key={idea.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start justify-between gap-3 rounded border border-border bg-surface-elevated p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[11px] font-semibold text-foreground truncate">{idea.title}</span>
                      <span className={`flex-shrink-0 rounded px-1.5 py-0.5 font-mono text-[8px] uppercase ${
                        idea.status === 'queued' ? 'bg-muted/20 text-muted-foreground' :
                        idea.status === 'running' ? 'bg-primary/10 text-primary' :
                        idea.status === 'completed' ? 'bg-primary/10 text-primary' :
                        idea.status === 'dead_end' ? 'bg-destructive/10 text-destructive' :
                        'bg-destructive/10 text-destructive'
                      }`}>
                        {idea.status === 'dead_end' ? 'dead end' : idea.status}
                      </span>
                      {idea.verdict && (
                        <span className={`rounded px-1 py-0.5 font-mono text-[8px] uppercase ${
                          idea.verdict === 'worth_pursuing' ? 'bg-primary/10 text-primary' : 'bg-destructive/10 text-destructive'
                        }`}>
                          {idea.verdict.replace('_', ' ')}
                        </span>
                      )}
                    </div>
                    {idea.description && idea.description !== idea.title && (
                      <p className="mt-0.5 font-mono text-[10px] text-muted-foreground truncate">{idea.description}</p>
                    )}
                    {idea.morning_note && (
                      <p className="mt-1 rounded bg-[#080808] p-2 font-mono text-[9px] leading-relaxed text-foreground/60 whitespace-pre-wrap">
                        {idea.morning_note.length > 200 ? idea.morning_note.slice(0, 200) + '…' : idea.morning_note}
                      </p>
                    )}
                    <div className="mt-1.5 flex items-center gap-2 font-mono text-[8px] text-muted-foreground/50">
                      <span>repo: {idea.scratch_repo_owner}/{idea.scratch_repo_name}</span>
                      {idea.latest_run_id && <span>run: {idea.latest_run_id.slice(0, 8)}</span>}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-1">
                    {idea.status === 'queued' && (
                      <button
                        onClick={() => handleOvernightDispatch(idea.id)}
                        disabled={overnightDispatchingId === idea.id}
                        className="rounded border border-primary/30 bg-primary/10 p-1.5 text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
                        title="Dispatch to scratch repo"
                      >
                        {overnightDispatchingId === idea.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Play className="h-3.5 w-3.5" />
                        )}
                      </button>
                    )}
                    <button
                      onClick={() => handleOvernightDelete(idea.id)}
                      className="rounded border border-border p-1.5 text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive"
                      title="Delete idea"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── Section 3: Run Review ── */}
      <section className="mb-10">
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Run Review Pass
        </h2>
        <div className="rounded border border-border bg-surface-secondary p-4">
          <p className="mb-3 font-mono text-[11px] text-muted-foreground">
            Analyze a skill's invocation history and propose a better system prompt.
            Requires invocations with negative feedback signals (missed/corrected).
          </p>
          <div className="flex items-center gap-3">
            <div className="relative">
              <button onClick={() => setReviewOpen((o) => !o)} disabled={reviewRunning}
                className="flex items-center gap-1.5 rounded border border-border bg-surface-elevated px-3 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:border-primary/40 disabled:opacity-50">
                {reviewSkill ?? 'Select skill'}
                <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${reviewOpen ? 'rotate-180' : ''}`} />
              </button>
              {reviewOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded border border-border bg-surface-elevated shadow-lg">
                  {SKILL_SLUGS.map((s) => (
                    <button key={s} onClick={() => { setReviewSkill(s); setReviewOpen(false); setReviewResult(null); setReviewError(null) }}
                      className={`flex w-full px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-surface-secondary ${s === reviewSkill ? 'text-primary' : 'text-foreground'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={runReview} disabled={reviewRunning || !reviewSkill}
              className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40">
              {reviewRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5" />}
              {reviewRunning ? 'Running review…' : 'Run review'}
            </button>
          </div>

          {reviewRunning && (
            <div className="mt-4 flex items-center gap-2 rounded border border-border bg-surface-elevated p-3">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              <span className="font-mono text-[11px] text-muted-foreground">
                Analyzing invocation history and generating proposed prompt via DeepSeek V4 Pro…
              </span>
            </div>
          )}

          {reviewError && (
            <div className="mt-4 flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-3 py-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-warning" />
              <span className="font-mono text-[11px] text-warning">{reviewError}</span>
            </div>
          )}

          {reviewResult && (
            <div className="mt-4 rounded border border-primary/20 bg-primary/5 p-4">
              <div className="mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="font-mono text-[11px] font-semibold text-primary">Revision proposed</span>
              </div>
              <div className="mb-3">
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Reasoning</p>
                <p className="font-mono text-[11px] leading-relaxed text-foreground/90">{reviewResult.reasoning}</p>
              </div>
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Proposed prompt</p>
                <pre className="max-h-48 overflow-auto rounded border border-border bg-surface-elevated p-3 font-mono text-[10px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                  {reviewResult.proposed_prompt}
                </pre>
              </div>
              <div className="mt-3">
                <Link
                  href={`/lab/revisions/${reviewResult.id}`}
                  className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20"
                >
                  Review full diff <ExternalLink className="h-3 w-3" />
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ── Section 4: Proposed Prompt Revisions ── */}
      <section>
        <h2 className="mb-4 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Proposed Prompt Revisions
        </h2>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : revisions.length === 0 ? (
          <div className="rounded border border-dashed border-border p-8 text-center">
            <p className="text-sm text-muted-foreground">No proposed revisions yet.</p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              Run skills and leave feedback. The review pass will propose prompt improvements here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {revisions.map((rev) => (
              <motion.div
                key={rev.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded border border-border bg-surface-secondary p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="font-mono text-xs uppercase tracking-wider text-primary">{rev.skill_slug}</span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider ${
                    rev.status === 'approved' ? 'bg-primary/10 text-primary' :
                    rev.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                    'bg-warning/10 text-warning'
                  }`}>
                    {rev.status}
                  </span>
                </div>
                <p className="mb-3 text-sm text-foreground">{rev.reasoning}</p>
                <Link
                  href={`/lab/revisions/${rev.id}`}
                  className="inline-flex items-center gap-1 rounded border border-border bg-surface-elevated px-3 py-1.5 font-mono text-[11px] text-foreground transition-colors hover:border-primary/40 hover:text-primary"
                >
                  Review diff
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── Overnight R&D subcomponents ────────────────────────────────────────────

function OvernightIdeaForm({ onCreated }: { onCreated: () => void }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [repoName, setRepoName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const handleCreate = async () => {
    if (!title.trim() || !repoName.trim()) return
    setCreating(true)
    setError(null)
    try {
      const res = await fetch('/api/lab/overnight/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: (description.trim() || title.trim()),
          scratch_repo_owner: 'enry-lab-experiments',
          scratch_repo_name: repoName.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 50),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'Failed to create idea')
        return
      }
      setTitle('')
      setDescription('')
      setRepoName('')
      setExpanded(false)
      onCreated()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setCreating(false)
    }
  }

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex items-center gap-1.5 rounded border border-dashed border-border bg-surface-elevated px-3 py-2 font-mono text-[11px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
      >
        <Plus className="h-3.5 w-3.5" /> Add an idea
      </button>
    )
  }

  return (
    <div className="rounded border border-border bg-surface-elevated p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 space-y-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Idea title (e.g. 'Test a Rust-powered CLI parser')"
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            disabled={creating}
            className="w-full rounded border border-border bg-[#080808] px-2 py-1.5 font-mono text-[11px] text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none disabled:opacity-40"
          />
          <div className="flex items-center gap-2">
            <span className="font-mono text-[9px] text-muted-foreground/50 flex-shrink-0">enry-lab-experiments/</span>
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="scratch-repo-name"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              disabled={creating}
              className="flex-1 rounded border border-border bg-[#080808] px-2 py-1.5 font-mono text-[11px] text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none disabled:opacity-40"
            />
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            disabled={creating}
            className="w-full resize-none rounded border border-border bg-[#080808] px-2 py-1.5 font-mono text-[11px] leading-relaxed text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none disabled:opacity-40"
          />
        </div>
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            onClick={handleCreate}
            disabled={creating || !title.trim() || !repoName.trim()}
            className="flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2.5 py-1.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
          >
            {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
            {creating ? 'Creating…' : 'Create'}
          </button>
          <button
            onClick={() => setExpanded(false)}
            disabled={creating}
            className="rounded p-1.5 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
          >
            <XCircle className="h-4 w-4" />
          </button>
        </div>
      </div>
      {error && (
        <div className="mt-2 flex items-start gap-1.5 rounded bg-destructive/5 px-2 py-1.5">
          <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0 text-destructive" />
          <span className="font-mono text-[9px] text-destructive">{error}</span>
        </div>
      )}
    </div>
  )
}

function OvernightIdeaList({
  ideas, loading, onDispatch, onDelete, dispatchingId,
}: {
  ideas: OvernightIdeaRow[]
  loading: boolean
  onDispatch: (id: string) => void
  onDelete: (id: string) => void
  dispatchingId: string | null
}) {
  // This component's rendering is handled inline in the main page to keep things simple.
  // The list is rendered directly above in the main return.
  return null
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ElementType
  label: string
  value: string | number
  loading: boolean
}) {
  return (
    <div className="rounded border border-border bg-surface-secondary p-4">
      <div className="mb-2 flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="text-2xl font-semibold tabular-nums">
        {loading ? <span className="text-muted-foreground/30">—</span> : value}
      </div>
    </div>
  )
}
