'use client'

import { useEffect, useRef } from 'react'
import type { Terminal as XTermTerminal } from '@xterm/xterm'
import type { FitAddon as XTermFitAddon } from '@xterm/addon-fit'
import { X } from 'lucide-react'
import '@xterm/xterm/css/xterm.css'

interface TerminalPaneProps {
  id: string
  cwd?: string
  onClose: () => void
}

/**
 * A real PTY-backed terminal pane. Mounts an xterm.js instance, streams PTY
 * output over SSE, and posts keystrokes back to /api/terminal/pty/[id]/input.
 *
 * The PTY session is owned by the parent (which created it and calls DELETE
 * on close). This component only connects the stream and renders output — on
 * unmount it disconnects SSE and disposes xterm, but does NOT kill the PTY,
 * so Strict Mode remounts and brief tab-aways resume via scrollback replay.
 */
export function TerminalPane({ id, cwd, onClose }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<XTermTerminal | null>(null)
  const fitRef = useRef<XTermFitAddon | null>(null)
  const closedRef = useRef(false)

  useEffect(() => {
    closedRef.current = false
    let disposed = false
    let cleanup: (() => void) | undefined

    // xterm touches window/document at import time — load it lazily so SSR
    // (and the initial client render) doesn't crash.
    void (async () => {
      const [{ Terminal }, { FitAddon }, { WebLinksAddon }] = await Promise.all([
        import('@xterm/xterm'),
        import('@xterm/addon-fit'),
        import('@xterm/addon-web-links'),
      ])
      if (disposed || !containerRef.current) return

      const term = new Terminal({
        cols: 80,
        rows: 24,
        cursorBlink: true,
        cursorStyle: 'bar',
        fontFamily: "'IBM Plex Mono', 'JetBrains Mono', 'Menlo', 'Monaco', 'Courier New', monospace",
        fontSize: 12,
        lineHeight: 1.2,
        allowProposedApi: true,
        scrollback: 5000,
        theme: {
          background: '#080808',
          foreground: '#e5e5e5',
          cursor: '#3a9e60',
          cursorAccent: '#080808',
          selectionBackground: 'rgba(58, 158, 96, 0.25)',
          selectionInactiveBackground: 'rgba(58, 158, 96, 0.12)',
          black: '#080808',
          red: '#ff4d4d',
          green: '#3a9e60',
          yellow: '#ffb800',
          blue: '#3b82c4',
          magenta: '#c45b9e',
          cyan: '#3bb4c4',
          white: '#e5e5e5',
          brightBlack: '#525252',
          brightRed: '#ff7a7a',
          brightGreen: '#5cc77f',
          brightYellow: '#ffcf4d',
          brightBlue: '#6aa6d6',
          brightMagenta: '#d67fb5',
          brightCyan: '#6acdd6',
          brightWhite: '#ffffff',
        },
      })
      const fit = new FitAddon()
      term.loadAddon(fit)
      term.loadAddon(new WebLinksAddon())
      term.open(containerRef.current)
      termRef.current = term
      fitRef.current = fit

      try {
        fit.fit()
      } catch {
        /* container not sized yet */
      }

      // Send initial size so the server PTY matches the rendered geometry.
      sendResize(id, term.cols, term.rows)

      // Keystrokes → PTY.
      const onDataDisp = term.onData((data) => {
        void sendInput(id, data)
      })

      // SSE: replay scrollback, then live output.
      const es = new EventSource(`/api/terminal/pty/${id}`, { withCredentials: true })
      es.addEventListener('output', (e) => {
        try {
          const text = JSON.parse((e as MessageEvent).data) as string
          term.write(text)
        } catch {
          /* malformed chunk */
        }
      })
      es.addEventListener('exit', () => {
        if (!disposed) {
          term.write('\r\n\x1b[90m[process exited]\x1b[0m\r\n')
        }
      })
      es.onerror = () => {
        // EventSource auto-reconnects; nothing to do here.
      }

      // Resize handling — debounce, since a split-layout reflow fires many.
      let resizeTimer: ReturnType<typeof setTimeout> | null = null
      const doFit = () => {
        if (disposed) return
        try {
          const before = `${term.cols}x${term.rows}`
          fit.fit()
          const after = `${term.cols}x${term.rows}`
          if (before !== after) sendResize(id, term.cols, term.rows)
        } catch {
          /* not laid out yet */
        }
      }
      const ro = new ResizeObserver(() => {
        if (resizeTimer) clearTimeout(resizeTimer)
        resizeTimer = setTimeout(doFit, 60)
      })
      ro.observe(containerRef.current)

      // Focus on mount + click.
      term.focus()
      const onClick = () => term.focus()
      containerRef.current.addEventListener('mousedown', onClick)

      cleanup = () => {
        onDataDisp.dispose()
        containerRef.current?.removeEventListener('mousedown', onClick)
        ro.disconnect()
        if (resizeTimer) clearTimeout(resizeTimer)
        es.close()
        term.dispose()
        termRef.current = null
        fitRef.current = null
      }
    })()

    return () => {
      disposed = true
      cleanup?.()
      cleanup = undefined
    }
  }, [id])

  const handleClose = () => {
    if (closedRef.current) return
    closedRef.current = true
    onClose()
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-md border border-border bg-[#080808]">
      <div className="flex items-center justify-between border-b border-border bg-surface-secondary px-2.5 py-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary/60" />
          <span className="truncate font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
            shell{cwd ? ` · ${cwd.replace(/^\/workspaces\/[^/]+/, '.')}` : ''}
          </span>
        </div>
        <button
          onClick={handleClose}
          title="Close terminal"
          className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 px-1 py-1" />
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────

async function sendInput(id: string, data: string) {
  try {
    await fetch(`/api/terminal/pty/${id}/input`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    })
  } catch {
    /* network blip — xterm still shows the keystroke locally via echo */
  }
}

async function sendResize(id: string, cols: number, rows: number) {
  try {
    await fetch(`/api/terminal/pty/${id}/resize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cols, rows }),
    })
  } catch {
    /* non-fatal */
  }
}
