'use client'

import { useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { ChevronRight, Check, Minus, ArrowDown, X } from 'lucide-react'
import { getRoutingProfile } from '@/lib/router/profiles'
import type { RoutingDecision, RouterReason } from '@/lib/router/types'

function ReasonRow({ reason }: { reason: RouterReason }) {
  return (
    <div className="flex items-start gap-1.5">
      {reason.positive ? (
        <Check className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
      ) : (
        <Minus className="mt-0.5 h-3 w-3 flex-shrink-0 text-warning" />
      )}
      <span className="font-mono text-[10px] leading-relaxed text-muted-foreground">{reason.text}</span>
    </div>
  )
}

function FallbackChain({ decision }: { decision: RoutingDecision }) {
  if (decision.fallbacks.length === 0) return null
  const items = [
    { label: decision.selectedModelLabel, reason: 'Primary selection', primary: true },
    ...decision.fallbacks.map((f) => ({ label: f.modelLabel, reason: f.reason, primary: false })),
  ]
  return (
    <div>
      <p className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Fallback Chain
      </p>
      <div className="space-y-1">
        {items.map((item, i) => (
          <div key={i}>
            <div className="flex items-center gap-2">
              <span
                className={`font-mono text-[11px] ${item.primary ? 'font-medium text-primary' : 'text-foreground'}`}
              >
                {item.label}
              </span>
              {!item.primary && (
                <span className="font-mono text-[9px] text-muted-foreground/60">fallback</span>
              )}
            </div>
            <p className="ml-4 font-mono text-[9px] leading-relaxed text-muted-foreground/70">{item.reason}</p>
            {i < items.length - 1 && <ArrowDown className="my-0.5 ml-1 h-3 w-3 text-muted-foreground/40" />}
          </div>
        ))}
      </div>
    </div>
  )
}

export interface RouterExplanationProps {
  decision: RoutingDecision
  /** Controlled expand state. If omitted, the component manages it internally. */
  expanded?: boolean
  onExpandedChange?: (expanded: boolean) => void
  onDismiss?: () => void
  className?: string
}

export function RouterExplanation({
  decision,
  expanded,
  onExpandedChange,
  onDismiss,
  className = '',
}: RouterExplanationProps) {
  const [internalExpanded, setInternalExpanded] = useState(false)
  const reduceMotion = useReducedMotion()
  const isExpanded = expanded ?? internalExpanded
  const toggle = () => {
    const next = !isExpanded
    if (onExpandedChange) onExpandedChange(next)
    else setInternalExpanded(next)
  }

  const profile = getRoutingProfile(decision.profileId)
  const ProfileIcon = profile.icon

  return (
    <div className={`rounded border border-primary/20 bg-primary/[0.04] ${className}`}>
      {/* Collapsed summary — always visible. Click toggles detail. */}
      <button
        onClick={toggle}
        className="flex w-full items-center gap-2 px-3 py-1.5 text-left"
      >
        <ProfileIcon className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
        <span className="font-mono text-[10px] text-muted-foreground">
          Why this route?
        </span>
        <span className="font-mono text-[10px] font-medium text-primary">{profile.label}</span>
        <span className="font-mono text-[10px] text-muted-foreground/50">·</span>
        <span className="truncate font-mono text-[10px] text-foreground">{decision.selectedModelLabel}</span>
        <motion.span
          animate={{ rotate: isExpanded ? 90 : 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.18, ease: [0.2, 0, 0, 1] }}
          className="ml-auto flex-shrink-0"
        >
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </motion.span>
        {onDismiss && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onDismiss() }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); onDismiss() } }}
            className="flex-shrink-0 rounded p-0.5 text-muted-foreground/50 transition-colors hover:bg-surface-elevated hover:text-foreground"
            aria-label="Hide route explanation"
          >
            <X className="h-3 w-3" />
          </span>
        )}
      </button>

      {/* Expanded detail — ChatGPT-reasoning-disclosure feel. */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="detail"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
            exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
            transition={{ duration: 0.22, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-primary/15 px-3 py-2.5">
              <div>
                <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected Profile
                </p>
                <div className="mb-1.5 flex items-center gap-1.5">
                  <ProfileIcon className="h-3 w-3 text-primary" />
                  <span className="font-mono text-[11px] font-medium text-foreground">{profile.label}</span>
                  <span className="font-mono text-[9px] text-muted-foreground/50">
                    · {decision.complexity} task
                    {decision.effort ? ` · ${decision.effort}` : ''}
                    {decision.think ? ` · ${decision.think}` : ''}
                  </span>
                </div>
                {decision.profileReasons.length > 0 && (
                  <div className="space-y-1">
                    {decision.profileReasons.map((r, i) => (
                      <ReasonRow key={i} reason={r} />
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Selected Model — <span className="text-foreground">{decision.selectedModelLabel}</span>
                </p>
                {decision.modelReasons.length > 0 ? (
                  <div className="space-y-1">
                    {decision.modelReasons.map((r, i) => (
                      <ReasonRow key={i} reason={r} />
                    ))}
                  </div>
                ) : (
                  <p className="font-mono text-[10px] text-muted-foreground/60">No metadata available.</p>
                )}
              </div>

              <FallbackChain decision={decision} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
