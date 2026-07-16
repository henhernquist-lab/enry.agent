'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Layers, ChevronDown, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface CompactionIndicatorProps {
  compacted: boolean
  summary?: string | null
  messageCount: number
  /** External toggle callback — when provided, component delegates expand/collapse to the parent (for Drive line collapsing). */
  onToggle?: () => void
  /** External expanded state — required when onToggle is provided. */
  externalExpanded?: boolean
}

export function CompactionIndicator({ compacted, summary, messageCount, onToggle, externalExpanded }: CompactionIndicatorProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const isExternal = typeof onToggle === 'function'
  const expanded = isExternal ? (externalExpanded ?? false) : internalExpanded

  const handleToggle = () => {
    if (isExternal) onToggle!()
    else setInternalExpanded((e) => !e)
  }

  if (!compacted) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mx-auto mb-4 max-w-3xl"
    >
      <button
        onClick={handleToggle}
        className="flex w-full items-center gap-2 rounded border border-border/50 bg-surface-elevated px-3 py-2 text-left transition-colors hover:border-primary/20 hover:bg-surface-secondary"
      >
        <Layers className="h-3.5 w-3.5 flex-shrink-0 text-muted-foreground" />
        <span className="flex-1 font-mono text-[10px] text-muted-foreground">
          {isExternal
            ? `Earlier context summarized to save space — click to ${expanded ? 'collapse' : 'show'} full history`
            : `Earlier context summarized to save space — click to ${expanded ? 'collapse' : 'view'} summary`
          }
        </span>
        <span className="flex-shrink-0 rounded bg-surface-base px-1.5 py-0.5 font-mono text-[9px] tabular-nums text-muted-foreground/60">
          {messageCount} msgs
        </span>
        {expanded ? (
          <ChevronDown className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3 w-3 flex-shrink-0 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {expanded && summary && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-b border border-t-0 border-border/50 bg-[#080808] px-4 py-3">
              <p className="font-mono text-[11px] leading-relaxed text-foreground/60 whitespace-pre-wrap">
                {summary}
              </p>
              <p className="mt-2 font-mono text-[9px] text-muted-foreground/40">
                Full history still accessible in the conversation above — scroll up to review.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
