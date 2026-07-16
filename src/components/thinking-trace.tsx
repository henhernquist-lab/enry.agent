'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Brain } from 'lucide-react'
import type { ReasoningDepth } from '@/lib/reasoning-trace'

interface ThinkingTraceProps {
  reasoning: string | null
  depth: ReasoningDepth
  modelLabel?: string
}

/**
 * Renders the model's reasoning/trace above its final answer. Visually
 * distinct — dimmed, monospace, collapsible. Matches the existing
 * "thinking" trace aesthetic used elsewhere in enry.agent.
 */
export function ThinkingTrace({ reasoning, depth, modelLabel }: ThinkingTraceProps) {
  const [expanded, setExpanded] = useState(false)

  if (!reasoning || depth === 'off') return null

  const isSummary = depth === 'summary'
  const displayText = isSummary
    ? (reasoning.length > 300 ? reasoning.slice(0, 300) + '…' : reasoning)
    : reasoning
  const isTruncated = isSummary && reasoning.length > 300

  return (
    <div className="mb-3 overflow-hidden rounded border border-muted-foreground/15 bg-surface-secondary/50">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-surface-secondary"
      >
        <Brain className="h-3 w-3 text-muted-foreground/50" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">            Reasoning
        </span>
        {modelLabel && (
          <span className="font-mono text-[9px] text-muted-foreground/40">
            · {modelLabel}
          </span>
        )}
        {isSummary && (
          <span className="ml-1 rounded border border-muted-foreground/20 px-1 font-mono text-[8px] text-muted-foreground/50">
            condensed
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground/40 transition-transform ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>
      <AnimatePresence initial={false}>
        {(expanded || depth === 'full') && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/40 px-3 py-2">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground/70">
                {displayText}
              </pre>
              {isTruncated && !expanded && (
                <p className="mt-1 font-mono text-[9px] text-muted-foreground/40">
                  Showing condensed trace — expand above for full reasoning.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      {/* In "full" mode, auto-expand — but keep the toggle for collapsing */}
      {depth === 'full' && !expanded && (
        <div className="border-t border-border/40 px-3 py-2">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground/70">
            {displayText}
          </pre>
        </div>
      )}
    </div>
  )
}
