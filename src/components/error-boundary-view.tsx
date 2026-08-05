'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { GolemInline } from '@/components/golem/golem-inline'
import type { ErrorSource } from '@/lib/error-log'

// The view every error boundary renders. One component so a route-level
// boundary can't drift from the app-level one.
//
// What it replaces: a bare platform 500 reading "This page couldn't load",
// with no app chrome, no retry, and nothing written down anywhere.

interface ErrorBoundaryViewProps {
  error: Error & { digest?: string }
  /** Next's boundary reset — re-renders the segment without a full reload. */
  reset: () => void
  /** Shown as the eyebrow; names the scope that failed. */
  label?: string
  source?: ErrorSource
}

export function ErrorBoundaryView({
  error,
  reset,
  label = 'error',
  source = 'server',
}: ErrorBoundaryViewProps) {
  const pathname = usePathname()
  const [reported, setReported] = useState<string | null>(null)

  useEffect(() => {
    // Console first, so the error survives even if the POST fails.
    console.error(`[boundary:${source}]`, error)

    let cancelled = false
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source,
        digest: error.digest,
        message: error.message,
        stack: error.stack,
        pathname,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { id?: string } | null) => {
        if (!cancelled && data?.id) setReported(data.id)
      })
      .catch(() => {
        /* reporting is best-effort — never re-throw inside a boundary */
      })

    return () => {
      cancelled = true
    }
  }, [error, pathname, source])

  // In production Next replaces the message with an opaque digest, so showing
  // the raw message only helps in dev. The digest is shown either way — it's
  // the handle that ties this screen to the server log and the error_log row.
  const showMessage = process.env.NODE_ENV !== 'production' && !!error.message

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-transparent px-6">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 grid-overlay opacity-20" />
      </div>

      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        <GolemInline state="error" size={132} bob={false} />

        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          {label}
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">
          Something cracked
        </h1>
        <p className="mt-3 max-w-sm font-mono text-[12px] leading-relaxed text-muted-foreground">
          This page threw on the way up. Golem caught it before it hit the floor.
        </p>

        {showMessage && (
          <pre className="mt-6 max-h-48 w-full overflow-auto rounded border border-destructive/30 bg-destructive/5 px-3 py-2 text-left font-mono text-[11px] leading-relaxed text-destructive">
            {error.message}
          </pre>
        )}

        {(error.digest || reported) && (
          <dl className="mt-4 flex flex-col gap-1 font-mono text-[10px] text-muted-foreground">
            {error.digest && (
              <div className="flex gap-2">
                <dt className="uppercase tracking-[0.2em]">digest</dt>
                <dd className="text-foreground/70">{error.digest}</dd>
              </div>
            )}
            {reported && (
              <div className="flex gap-2">
                <dt className="uppercase tracking-[0.2em]">logged</dt>
                <dd className="text-foreground/70">{reported}</dd>
              </div>
            )}
          </dl>
        )}

        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-[12px] text-primary transition-colors hover:bg-primary/20"
          >
            try again
          </button>
          <Link
            href="/"
            className="rounded border border-border px-4 py-2 font-mono text-[12px] text-muted-foreground transition-colors hover:text-foreground"
          >
            back to golem
          </Link>
        </div>
      </div>
    </div>
  )
}
