'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Briefcase, Loader2, AlertTriangle, Check } from 'lucide-react'
import { loadResources, type Resource, type BriefingPayload } from '@/lib/resources'

const SEVERITY_STYLES: Record<'low' | 'medium' | 'high', string> = {
  low: 'border-border text-muted-foreground',
  medium: 'border-warning/40 text-warning',
  high: 'border-red-500/40 text-red-400',
}

export default function BriefingArchivePage() {
  const { status } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<Resource<BriefingPayload>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    loadResources('briefing')
      .then((rows) => setItems(rows as Resource<BriefingPayload>[]))
      .finally(() => setLoading(false))
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
            <Briefcase className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">chief of staff</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Daily Briefings</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            cross-tool observations · past mornings
          </p>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No briefings yet. The first one generates tomorrow morning.</p>
        ) : (
          <div className="space-y-5">
            {items.map((item, i) => {
              const p = item.payload
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.04, 0.4) }}
                  className="rounded-lg border border-border bg-surface-secondary p-5"
                >
                  <div className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{p.date}</div>

                  <div className="space-y-3">
                    {p.observations.map((obs, j) => (
                      <div key={j} className="space-y-1.5">
                        <p className="text-sm leading-relaxed text-foreground/90">{obs.text}</p>
                        {obs.sources.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {obs.sources.map((s) => (
                              <span key={s} className="rounded border border-border bg-surface-base px-1.5 py-0.5 font-mono text-[9px] lowercase text-muted-foreground">
                                {s}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {p.suggested_actions.length > 0 && (
                    <div className="mt-4 border-t border-border/40 pt-3">
                      <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground">Suggested actions</p>
                      <div className="space-y-1.5">
                        {p.suggested_actions.map((a, k) => (
                          <div key={k} className="flex items-start gap-2">
                            <span className={`mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded border ${a.completed ? 'border-primary bg-primary/20 text-primary' : 'border-border text-transparent'}`}>
                              <Check className="h-2.5 w-2.5" />
                            </span>
                            <span className={`text-sm ${a.completed ? 'text-muted-foreground line-through' : 'text-foreground/90'}`}>{a.text}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {p.flag && (
                    <div className={`mt-4 flex items-start gap-2 rounded-md border px-3 py-2 ${SEVERITY_STYLES[p.flag.severity]}`}>
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                      <span className="text-xs leading-relaxed">{p.flag.text}</span>
                    </div>
                  )}
                </motion.div>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
