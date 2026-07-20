'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Terminal as XTermTerminal } from '@xterm/xterm'
import type { FitAddon as XTermFitAddon } from '@xterm/addon-fit'
import { X, Sparkles, Loader2, ChevronDown } from 'lucide-react'
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

  // ─── "Explain last command" ────────────────────────────────────────
  // lineBufferRef reconstructs the command line from the keystroke stream
  // that's already flowing through term.onData → the PTY. It is NOT a second
  // history tracker — it's derived from the same input path, purely so the
  // "Explain" button knows what the last-submitted command was.
  const lineBufferRef = useRef('')
  const [lastCommand, setLastCommand] = useState('')
  const [explainOpen, setExplainOpen] = useState(false)
  const [explaining, setExplaining] = useState(false)
  const [explanation, setExplanation] = useState('')
  const [explainError, setExplainError] = useState<string | null>(null)

  const explain = useCallback(async () => {
    if (!lastCommand || explaining) return
    setExplainOpen(true)
    setExplaining(true)
    setExplanation('')
    setExplainError(null)
    try {
      const res = await fetch('/api/terminal/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: lastCommand }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}))
        setExplainError(err?.error ?? `Explain failed (${res.status})`)
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        setExplanation((prev) => prev + decoder.decode(value, { stream: true }))
      }
    } catch (e) {
      setExplainError(e instanceof Error ? e.message : 'Explain request failed')
    } finally {
      setExplaining(false)
    }
  }, [lastCommand, explaining])

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

      // Keystrokes → PTY. Also reconstruct the current command line from the
      // same stream so "Explain" knows the last-submitted command. Best-effort:
      // handles typing, backspace, Ctrl-U/Ctrl-C; bails on escape/arrow
      // sequences (we don't model mid-line cursor edits), which is fine for the
      // "type a command, hit enter, explain it" flow this targets.
      const onDataDisp = term.onData((data) => {
        void sendInput(id, data)
        for (const ch of data) {
          if (ch === '\r' || ch === '\n') {
            const cmd = lineBufferRef.current.trim()
            lineBufferRef.current = ''
            if (cmd) setLastCommand(cmd)
          } else if (ch === '\x7f' || ch === '\b') {
            lineBufferRef.current = lineBufferRef.current.slice(0, -1)
          } else if (ch === '\x15' || ch === '\x03') {
            lineBufferRef.current = '' // Ctrl-U (kill line) / Ctrl-C (abandon)
          } else if (ch === '\x1b') {
            break // escape / CSI sequence (arrows, etc.)
          } else if (ch >= ' ') {
            lineBufferRef.current += ch
          }
        }
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
        <div className="flex flex-shrink-0 items-center gap-1">
          <button
            onClick={explain}
            disabled={!lastCommand || explaining}
            title={lastCommand ? `Explain last command: ${lastCommand}` : 'Run a command first, then explain it'}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/70 transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-not-allowed disabled:opacity-30"
          >
            {explaining ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Explain
          </button>
          <button
            onClick={handleClose}
            title="Close terminal"
            className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:bg-destructive/10 hover:text-destructive"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="min-h-0 flex-1 px-1 py-1" />

      {/* On-demand, Feynman-style explanation of the last command. Inline and
          collapsible so it never disrupts the terminal's own flow. */}
      {explainOpen && (
        <div className="flex max-h-[45%] min-h-0 flex-col border-t border-primary/20 bg-surface-base">
          <div className="flex flex-shrink-0 items-center justify-between border-b border-border/60 px-2.5 py-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <Sparkles className="h-3 w-3 flex-shrink-0 text-primary" />
              <span className="font-mono text-[9px] uppercase tracking-wider text-primary/80">Explain</span>
              {lastCommand && (
                <code className="truncate font-mono text-[10px] text-muted-foreground/80">{lastCommand}</code>
              )}
            </div>
            <button
              onClick={() => setExplainOpen(false)}
              title="Collapse explanation"
              className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-muted-foreground/60 transition-colors hover:text-foreground"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-hidden px-3 py-2">
            {explainError ? (
              <p className="font-mono text-[10px] text-destructive">{explainError}</p>
            ) : (
              <p className="whitespace-pre-wrap font-sans text-[11px] leading-relaxed text-foreground/90">
                {explanation}
                {explaining && <span className="ml-0.5 inline-block h-3 w-1.5 animate-pulse bg-primary/70 align-middle" />}
              </p>
            )}
          </div>
        </div>
      )}
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
