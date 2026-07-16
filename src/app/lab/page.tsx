'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, FlaskConical, Lightbulb, GitPullRequest, BarChart3 } from 'lucide-react'
import type { PromptRevisionRow, LabStats } from '@/lib/lab/types'

export default function LabPage() {
  const [stats, setStats] = useState<LabStats | null>(null)
  const [revisions, setRevisions] = useState<PromptRevisionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/lab/stats')
      .then((r) => r.json())
      .then((d) => setStats(d.stats ?? null))
      .catch(() => setStats(null))

    fetch('/api/lab/revisions')
      .then((r) => r.json())
      .then((d) => setRevisions(d.revisions ?? []))
      .finally(() => setLoading(false))
  }, [])

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
                  <span className="rounded bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-warning">
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
