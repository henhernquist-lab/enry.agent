'use client'

import { TerminalSquare } from 'lucide-react'

// Homepage launcher for the Live Terminal overlay — sits directly under Quick
// Notes. Purely a visible entry point: dispatches the same
// 'enry:open-terminal' event the command palette action uses, so the
// terminal's actual behavior (overlay, Esc to close, etc.) is untouched.
export function TerminalLauncher() {
  return (
    <button
      onClick={() => window.dispatchEvent(new Event('enry:open-terminal'))}
      className="flex w-full items-center justify-between rounded border border-border bg-surface-elevated/50 px-2.5 py-2 text-left transition-colors hover:border-primary/40 hover:bg-surface-elevated"
    >
      <span className="flex items-center gap-2">
        <TerminalSquare className="h-3.5 w-3.5 text-primary" />
        <span className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Live Terminal
        </span>
      </span>
      <kbd className="font-mono text-[9px] text-muted-foreground">Ctrl+`</kbd>
    </button>
  )
}
