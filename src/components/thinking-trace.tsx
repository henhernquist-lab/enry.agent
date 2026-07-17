'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Brain } from 'lucide-react'
import type { ReasoningDepth } from '@/lib/reasoning-trace'

interface ThinkingTraceProps {
  reasoning: string | null
  depth: ReasoningDepth
  modelLabel?: string
  /** True when the model is still generating reasoning — enables live streaming visuals */
  isLive?: boolean
}

/**
 * Renders the model's reasoning/trace above its final answer. Three visual states:
 *
 *  1. Streaming (isLive=true) — auto-expanded, dim monospace with pulsing block
 *     cursor at the end, "Thinking…" label with subtle pulse on the Brain icon.
 *  2. Complete/collapsed (isLive=false, depth≠off) — a single header row showing
 *     "Reasoning" with model label and chevron. Click to expand.
 *  3. None (reasoning=null or depth='off') — renders nothing.
 *
 * Design: dark/mono, no glow, no neon, no gradient. Technical "backstage" feel.
 * Border-left indent marks it as separate from the final answer.
 */
export function ThinkingTrace({ reasoning, depth, modelLabel, isLive = false }: ThinkingTraceProps) {
  // null = user hasn't toggled yet; let auto-logic decide
  const [userExpanded, setUserExpanded] = useState<boolean | null>(null)

  if (!reasoning || depth === 'off') return null

  const isSummary = depth === 'summary'
  const displayText = isSummary
    ? (reasoning.length > 300 ? reasoning.slice(0, 300) + '\u2026' : reasoning)
    : reasoning
  const isTruncated = isSummary && reasoning.length > 300

  // Auto-expand while live, or if depth is 'full'. User click overrides.
  const expanded = userExpanded ?? (isLive || depth === 'full')

  return (
    <div className="mb-3 overflow-hidden rounded border border-muted-foreground/10 bg-surface-secondary/30 border-l-[3px] border-l-muted-foreground/20">
      {/* Header row — always visible when there's reasoning */}
      <button
        onClick={() => setUserExpanded(!expanded)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 text-left transition-colors hover:bg-surface-secondary/50"
      >
        <Brain
          className={`h-3 w-3 flex-shrink-0 ${
            isLive ? 'animate-pulse text-muted-foreground/60' : 'text-muted-foreground/40'
          }`}
        />
        <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
          {isLive ? 'Thinking\u2026' : 'Reasoning'}
        </span>
        {modelLabel && (
          <span className="font-mono text-[9px] text-muted-foreground/30">
            \u00b7 {modelLabel}
          </span>
        )}
        {isSummary && !isLive && (
          <span className="ml-1 rounded border border-muted-foreground/15 px-1 font-mono text-[8px] text-muted-foreground/40">
            condensed
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground/30 transition-transform duration-200 ${
            expanded ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Reasoning body — visible when expanded */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30 px-3 py-2">
              <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground/50">
                {displayText}
                {/* Streaming cursor — a subtle pulsing block that renders inline at end of text */}
                {isLive && (
                  <span className="ml-0.5 inline-block h-[13px] w-[6px] animate-pulse bg-muted-foreground/30 align-[-1px]" />
                )}
              </pre>
              {isTruncated && !expanded && (
                <p className="mt-1 font-mono text-[9px] text-muted-foreground/30">
                  Showing condensed trace — expand for full reasoning.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
