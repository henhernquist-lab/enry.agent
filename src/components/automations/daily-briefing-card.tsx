'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Sparkles, X, Quote, BookOpen, Dumbbell } from 'lucide-react'
import type { DailyBriefing } from '@/lib/daily-briefing'

interface DailyBriefingCardProps {
  briefing: DailyBriefing | null
  loading: boolean
  onDismiss: () => void
}

export function DailyBriefingCard({ briefing, loading, onDismiss }: DailyBriefingCardProps) {
  return (
    <AnimatePresence>
      {(loading || (briefing && !briefing.dismissed)) && (
        <motion.div
          initial={{ opacity: 0, y: -10, height: 0 }}
          animate={{ opacity: 1, y: 0, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          className="mx-auto mb-4 max-w-3xl overflow-hidden rounded border border-primary/30 bg-primary/5 px-4 py-3"
        >
          <div className="flex items-start gap-3">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="mb-1.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-primary">
                Daily Briefing
              </p>
              {loading ? (
                <p className="text-sm text-muted-foreground">Generating today&apos;s briefing...</p>
              ) : briefing ? (
                <div className="space-y-1.5 text-sm text-foreground">
                  <p className="flex items-start gap-1.5">
                    <Quote className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                    <span>{briefing.quote}</span>
                  </p>
                  {briefing.studyTip && (
                    <p className="flex items-start gap-1.5">
                      <BookOpen className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      <span>{briefing.studyTip}</span>
                    </p>
                  )}
                  {briefing.workoutReminder && (
                    <p className="flex items-start gap-1.5">
                      <Dumbbell className="mt-0.5 h-3 w-3 flex-shrink-0 text-muted-foreground" />
                      <span>{briefing.workoutReminder}</span>
                    </p>
                  )}
                </div>
              ) : null}
            </div>
            <button onClick={onDismiss} className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-surface-elevated">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
