'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, Check, X, Loader2 } from 'lucide-react'
import type { PromptRevisionRow } from '@/lib/lab/types'

export default function RevisionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [revision, setRevision] = useState<PromptRevisionRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [acting, setActing] = useState(false)

  useEffect(() => {
    fetch('/api/lab/revisions')
      .then((r) => r.json())
      .then((d) => {
        const found = (d.revisions ?? []).find((rev: PromptRevisionRow) => rev.id === id)
        setRevision(found ?? null)
        setLoading(false)
      })
  }, [id])

  const handleApprove = async () => {
    setActing(true)
    try {
      await fetch('/api/lab/revisions/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_id: id }),
      })
      router.push('/lab')
    } finally {
      setActing(false)
    }
  }

  const handleReject = async () => {
    setActing(true)
    try {
      await fetch('/api/lab/revisions/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision_id: id }),
      })
      router.push('/lab')
    } finally {
      setActing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!revision) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-muted-foreground">Revision not found.</p>
        <Link href="/lab" className="mt-2 inline-block text-sm text-primary hover:underline">← Back to Lab</Link>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <header className="mb-6 flex items-center gap-3">
        <Link href="/lab" className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Lab
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">Prompt Revision</span>
      </header>

      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="mb-1 text-xl font-semibold tracking-tight">{revision.skill_slug}</h1>
          <p className="max-w-2xl text-sm text-muted-foreground">{revision.reasoning}</p>
        </div>
        <span className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider ${
          revision.status === 'proposed' ? 'bg-warning/10 text-warning' :
          revision.status === 'approved' ? 'bg-primary/10 text-primary' :
          'bg-destructive/10 text-destructive'
        }`}>
          {revision.status}
        </span>
      </div>

      {revision.status === 'proposed' && (
        <div className="mb-6 flex items-center gap-3">
          <button onClick={handleApprove} disabled={acting}
            className="flex items-center gap-1.5 rounded border border-primary/30 bg-primary/10 px-4 py-2 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-50">
            <Check className="h-3.5 w-3.5" /> Approve & activate
          </button>
          <button onClick={handleReject} disabled={acting}
            className="flex items-center gap-1.5 rounded border border-border bg-surface-elevated px-4 py-2 font-mono text-[11px] text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive disabled:opacity-50">
            <X className="h-3.5 w-3.5" /> Reject
          </button>
        </div>
      )}

      <div className="space-y-4">
        <DiffSection title="Old prompt" text={revision.old_prompt} type="old" />
        <DiffSection title="Proposed prompt" text={revision.proposed_prompt} type="new" />
      </div>
    </div>
  )
}

function DiffSection({ title, text, type }: { title: string; text: string; type: 'old' | 'new' }) {
  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded border border-border bg-surface-secondary">
      <div className="border-b border-border px-4 py-2">
        <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{title}</h3>
      </div>
      <pre className={`max-h-96 overflow-auto p-4 font-mono text-[11px] leading-relaxed whitespace-pre-wrap ${
        type === 'new' ? 'text-primary/90' : 'text-muted-foreground'
      }`}>
        {text}
      </pre>
    </motion.div>
  )
}
