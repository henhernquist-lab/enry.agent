'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Loader2, Waypoints, AlertOctagon, ChevronDown } from 'lucide-react'
import { loadResources, type Resource, type RootCausePayload } from '@/lib/resources'
import { RootCauseInterview } from '@/components/root-cause/interview'
import { CausalChainView } from '@/components/root-cause/causal-chain'

const DOMAIN_LABEL: Record<RootCausePayload['domain'], string> = {
  training: 'Training',
  academic: 'Academic',
  project: 'Project',
  other: 'Other',
}

function RootCauseContent() {
  const { status } = useSession()
  const router = useRouter()
  const params = useSearchParams()
  const [items, setItems] = useState<Resource<RootCausePayload>[]>([])
  const [loading, setLoading] = useState(true)
  const [interviewing, setInterviewing] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // Auto-open the interview when arriving via the Cmd+K action / tool button.
  useEffect(() => {
    if (params.get('start') === '1') setInterviewing(true)
  }, [params])

  const load = () =>
    loadResources('root_cause')
      .then((rows) => setItems(rows as Resource<RootCausePayload>[]))
      .finally(() => setLoading(false))

  useEffect(() => {
    load()
  }, [])

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link href="/resources" className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Resources
          </Link>
          <div className="flex items-center gap-2">
            <Waypoints className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">the root cause</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">The Root Cause</h1>
            <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              5-whys investigations · grounded in your data
            </p>
          </div>
          <button
            onClick={() => setInterviewing(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/5 px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-red-400 transition-colors hover:border-red-500/50"
          >
            <AlertOctagon className="h-3.5 w-3.5" />
            Something went wrong
          </button>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No investigations yet. When something goes wrong, run one — every failure makes the next one faster to diagnose.</p>
        ) : (
          <div className="space-y-3">
            {items.map((item, i) => {
              const p = item.payload
              const open = expandedId === item.id
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.3) }}
                  className="rounded-lg border border-border bg-surface-secondary"
                >
                  <button onClick={() => setExpandedId(open ? null : item.id)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
                    <div className="min-w-0">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{DOMAIN_LABEL[p.domain]}</span>
                        <span className="font-mono text-[10px] text-muted-foreground">{p.failure_date}</span>
                      </div>
                      <p className="text-sm font-medium text-foreground">{p.failure_description}</p>
                      <p className="mt-1 line-clamp-1 text-xs text-muted-foreground">Root: {p.root_cause}</p>
                    </div>
                    <ChevronDown className={`mt-1 h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                  {open && (
                    <div className="border-t border-border/40 p-4">
                      <CausalChainView chain={p.causal_chain} rootCause={p.root_cause} preventions={p.preventions} />
                      {p.failure_signature?.description && (
                        <p className="mt-4 font-mono text-[10px] leading-relaxed text-muted-foreground">
                          <span className="uppercase tracking-wider">signature:</span> {p.failure_signature.description}
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </main>

      {interviewing && (
        <RootCauseInterview
          onExit={() => {
            setInterviewing(false)
            router.replace('/resources/root-cause')
          }}
          onSaved={() => load()}
        />
      )}
    </div>
  )
}

export default function RootCausePage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>}>
      <RootCauseContent />
    </Suspense>
  )
}
