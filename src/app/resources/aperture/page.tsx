'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { ArrowLeft, Aperture, Loader2, Check } from 'lucide-react'
import { loadResources, type Resource, type AperturePayload } from '@/lib/resources'

export default function ApertureArchivePage() {
  const { status } = useSession()
  const router = useRouter()
  const [items, setItems] = useState<Resource<AperturePayload>[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  useEffect(() => {
    loadResources('aperture')
      .then((rows) => setItems(rows as Resource<AperturePayload>[]))
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
            <Aperture className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">the aperture</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-8">
        <div className="mb-8">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">The Aperture</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            one question a day · an archive of your own thinking
          </p>
        </div>

        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions yet. The first one arrives tomorrow morning.</p>
        ) : (
          <div className="space-y-4">
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
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{p.date}</span>
                    {p.answer ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-primary">
                        <Check className="h-3 w-3" /> answered
                      </span>
                    ) : (
                      <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">unanswered</span>
                    )}
                  </div>
                  <p className="text-[15px] font-medium leading-snug text-foreground">{p.question}</p>
                  {p.answer && (
                    <p className="mt-3 border-l-2 border-primary/30 pl-3 text-sm leading-relaxed text-muted-foreground">{p.answer}</p>
                  )}
                  {p.context_used?.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1">
                      {p.context_used.map((c) => (
                        <span key={c} className="rounded border border-border bg-surface-base px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                          {c}
                        </span>
                      ))}
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
