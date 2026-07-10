'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Maximize2 } from 'lucide-react'
import Link from 'next/link'
import { LiveTerminal } from './live-terminal'

// Floating terminal overlay — opens over any page via Ctrl+` or a custom
// 'enry:open-terminal' event (dispatched by the command palette). Esc closes.
export function TerminalOverlay() {
  const { status } = useSession()
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl+` toggles the overlay.
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    const onOpen = () => setOpen(true)
    window.addEventListener('keydown', onKey)
    window.addEventListener('enry:open-terminal', onOpen as EventListener)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('enry:open-terminal', onOpen as EventListener)
    }
  }, [])

  if (status !== 'authenticated') return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-end bg-black/40 p-4 sm:p-6"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
            className="flex h-[60vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between rounded-t-lg border border-b-0 border-border bg-surface-secondary px-3 py-1.5">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">terminal · Ctrl+` to toggle</span>
              <div className="flex items-center gap-2">
                <Link
                  href="/resources/terminal"
                  onClick={() => setOpen(false)}
                  className="text-muted-foreground transition-colors hover:text-foreground"
                  title="Open full terminal"
                >
                  <Maximize2 className="h-3.5 w-3.5" />
                </Link>
                <button onClick={() => setOpen(false)} className="text-muted-foreground transition-colors hover:text-foreground" aria-label="Close">
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <LiveTerminal />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
