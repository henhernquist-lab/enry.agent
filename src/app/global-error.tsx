'use client'

import { useEffect, useState } from 'react'

// Last-resort boundary: the root layout itself threw, so this replaces the
// whole document and has to supply its own <html> and <body>.
//
// Deliberately dependency-free — no Tailwind classes, no shared components,
// no design tokens. Everything the normal boundary leans on (globals.css, the
// theme variables, the Golem canvas) is loaded *by* the root layout, which is
// the thing that just failed. Inline styles are the only ones guaranteed to
// survive, so the Grimoire×Clay palette is written out literally here.

const CLAY = {
  bg: '#1a1614',
  panel: '#25201c',
  border: '#2d2824',
  text: '#f5f0e8',
  muted: '#a89880',
  primary: '#b8935a',
  danger: '#c44d4d',
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const [reported, setReported] = useState<string | null>(null)

  useEffect(() => {
    console.error('[boundary:global]', error)
    void fetch('/api/errors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'global',
        digest: error.digest,
        message: error.message,
        stack: error.stack,
        pathname: typeof window !== 'undefined' ? window.location.pathname : null,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { id?: string } | null) => {
        if (data?.id) setReported(data.id)
      })
      .catch(() => {
        /* best-effort; never re-throw from the last boundary standing */
      })
  }, [error])

  const mono = 'ui-monospace, SFMono-Regular, Menlo, monospace'

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: CLAY.bg,
          color: CLAY.text,
          fontFamily: mono,
          padding: '24px',
        }}
      >
        <main style={{ maxWidth: 460, width: '100%', textAlign: 'center' }}>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              letterSpacing: '0.3em',
              textTransform: 'uppercase',
              color: CLAY.primary,
            }}
          >
            fatal
          </p>
          <h1 style={{ margin: '10px 0 0', fontSize: 26, fontWeight: 700 }}>Golem fell over</h1>
          <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.7, color: CLAY.muted }}>
            The app failed before it could draw anything. Reloading usually clears it.
          </p>

          {process.env.NODE_ENV !== 'production' && error.message && (
            <pre
              style={{
                margin: '20px 0 0',
                padding: '10px 12px',
                maxHeight: 180,
                overflow: 'auto',
                textAlign: 'left',
                fontSize: 11,
                lineHeight: 1.6,
                color: CLAY.danger,
                background: 'rgba(196,77,77,0.07)',
                border: `1px solid ${CLAY.border}`,
                borderRadius: 4,
                whiteSpace: 'pre-wrap',
              }}
            >
              {error.message}
            </pre>
          )}

          {(error.digest || reported) && (
            <p style={{ margin: '14px 0 0', fontSize: 10, color: CLAY.muted }}>
              {error.digest && <>digest {error.digest}</>}
              {error.digest && reported && ' · '}
              {reported && <>logged {reported}</>}
            </p>
          )}

          <div
            style={{
              marginTop: 28,
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              flexWrap: 'wrap',
            }}
          >
            <button
              type="button"
              onClick={reset}
              style={{
                padding: '9px 16px',
                fontFamily: mono,
                fontSize: 12,
                color: CLAY.primary,
                background: 'rgba(184,147,90,0.1)',
                border: `1px solid ${CLAY.primary}66`,
                borderRadius: 4,
                cursor: 'pointer',
              }}
            >
              try again
            </button>
            <a
              href="/"
              style={{
                padding: '9px 16px',
                fontSize: 12,
                color: CLAY.muted,
                background: CLAY.panel,
                border: `1px solid ${CLAY.border}`,
                borderRadius: 4,
                textDecoration: 'none',
              }}
            >
              back to golem
            </a>
          </div>
        </main>
      </body>
    </html>
  )
}
