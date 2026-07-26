'use client'

import { X, Clock } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export interface QueuedMessageItem {
  text: string
}

interface QueuedMessageBannerProps {
  items: QueuedMessageItem[]
  onRemove: (index: number) => void
}

export function QueuedMessageBanner({ items, onRemove }: QueuedMessageBannerProps) {
  if (items.length === 0) return null

  return (
    <AnimatePresence>
      <div className="space-y-1.5">
        {items.map((item, i) => (
          <motion.div
            key={`queued-${i}`}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-2 rounded border border-muted-foreground/10 bg-surface-secondary/40 px-3 py-2"
          >
            <Clock className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground/40" />
            <span className="flex-1 truncate font-mono text-[11px] text-muted-foreground/60">
              {item.text.length > 80 ? `${item.text.slice(0, 80)}…` : item.text}
            </span>
            <span className="flex-shrink-0 rounded border border-muted-foreground/10 bg-surface-elevated px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">
              Queued
            </span>
            <button
              onClick={() => onRemove(i)}
              className="flex-shrink-0 rounded p-0.5 text-muted-foreground/40 transition-colors hover:bg-surface-elevated hover:text-foreground"
              aria-label="Cancel queued message"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ))}
      </div>
    </AnimatePresence>
  )
}
