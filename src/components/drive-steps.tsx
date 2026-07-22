'use client'

import { motion } from 'framer-motion'
import type { ComponentType } from 'react'
import {
  Search, FileText, Brain, Pencil, Check, GitCommit, GitPullRequest,
  Swords, FlaskConical, Wrench, XCircle, Loader2, Package,
} from 'lucide-react'

// A compact, live progress tracker for one Drive turn — the same clean
// labeled-step spirit Cruise already gets from live-workspace.tsx, but driven
// by Drive's own action chain (see src/app/agent/page.tsx exec()): classify ->
// reason -> write -> propose, plus apply / commit / PR. The active step spins,
// completed steps settle to a check, a failure shows a cross. Rendered as one
// ChatLine that gets updated in place as the turn advances, so it fills in
// live rather than after the fact.

export type DriveStepState = 'active' | 'done' | 'error'

export interface DriveStep {
  key: string
  label: string
  /** One of the icon keys below; unknown falls back to a wrench. */
  icon: string
  state: DriveStepState
}

const ICONS: Record<string, ComponentType<{ className?: string }>> = {
  analyze: Search,
  locate: FileText,
  reason: Brain,
  write: Pencil,
  plan: FileText,
  skill: Swords,
  test: FlaskConical,
  fix: Wrench,
  apply: Package,
  commit: GitCommit,
  pr: GitPullRequest,
  done: Check,
}

export function DriveSteps({ steps }: { steps: DriveStep[] }) {
  if (steps.length === 0) return null
  return (
    <div className="mb-3 overflow-hidden rounded border border-border bg-surface-secondary/40">
      {steps.map((step) => {
        const Icon = ICONS[step.icon] ?? Wrench
        return (
          <motion.div
            key={step.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            className="flex items-center gap-2 border-b border-border/40 px-3 py-1.5 last:border-b-0"
          >
            <span className="flex-shrink-0">
              {step.state === 'active' ? (
                <Loader2 className="h-3 w-3 animate-spin text-primary" />
              ) : step.state === 'error' ? (
                <XCircle className="h-3 w-3 text-destructive" />
              ) : (
                <Check className="h-3 w-3 text-primary" />
              )}
            </span>
            <Icon className={`h-3 w-3 flex-shrink-0 ${step.state === 'active' ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`font-mono text-[11px] ${step.state === 'active' ? 'text-foreground' : 'text-muted-foreground'}`}>
              {step.label}
            </span>
          </motion.div>
        )
      })}
    </div>
  )
}
