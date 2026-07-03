'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Smartphone, Brain, GraduationCap, Dumbbell, Utensils, GitBranch, Target, Plus } from 'lucide-react'
import { SmsSummaries } from './sms-summaries'
import { FlashcardGenerator } from './flashcard-generator'
import { GradeCalculator } from './grade-calculator'
import { WorkoutLoggerTool } from './workout-logger'
import { MealLogger } from './meal-logger'
import { RepoScanner } from './repo-scanner'
import { HabitStreaks } from './habit-streaks'
import { GitHubTool } from './github'

type ToolId = 'sms' | 'flashcards' | 'grades' | 'workouts' | 'meals' | 'repo' | 'habits' | 'github'

interface Tool {
  id: ToolId
  icon: typeof Smartphone
  label: string
  desc: string
}

const TOOLS: Tool[] = [
  { id: 'sms',       icon: Smartphone,     label: 'SMS Summaries',       desc: 'Daily AI briefing texted to your phone' },
  { id: 'flashcards',icon: Brain,          label: 'Flashcard Generator', desc: 'Paste notes → AI-generated Anki cards' },
  { id: 'grades',    icon: GraduationCap,  label: 'Grade Calculator',    desc: 'What do you need on finals for target GPA?' },
  { id: 'workouts',  icon: Dumbbell,       label: 'Workout Logger',      desc: 'Track sets, reps, and weight over time' },
  { id: 'meals',     icon: Utensils,       label: 'Meal Logger',         desc: 'Plain-English logging with macro estimation' },
  { id: 'repo',      icon: GitBranch,      label: 'Repo Scanner',        desc: 'Fetch a GitHub repo and chat about the code' },
  { id: 'habits',    icon: Target,         label: 'Habit Streaks',       desc: 'Daily check-ins with streak tracking' },
  { id: 'github',    icon: GitBranch,      label: 'GitHub',              desc: 'Repos, issues, and project management' },
]

interface ToolsGridProps {
  open: boolean
  onClose: () => void
}

export function ToolsGrid({ open, onClose }: ToolsGridProps) {
  const [openTool, setOpenTool] = useState<ToolId | null>(null)

  const handleClose = () => {
    setOpenTool(null)
    onClose()
  }

  return (
    <>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 flex items-center justify-center bg-black/60"
            onClick={handleClose}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ type: 'spring', stiffness: 300, damping: 28 }}
              className="relative flex max-h-[85vh] w-[680px] flex-col rounded border border-border bg-surface-secondary shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border p-5">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Tools</h2>
                  <p className="text-xs text-muted-foreground">{TOOLS.length} available</p>
                </div>
                <button onClick={handleClose} className="rounded p-1.5 text-muted-foreground hover:bg-surface-elevated">
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Grid */}
              <div className="flex-1 overflow-y-auto p-5 scrollbar-hidden">
                <div className="grid grid-cols-3 gap-3">
                  {TOOLS.map((tool, i) => {
                    const Icon = tool.icon
                    return (
                      <motion.button
                        key={tool.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04 }}
                        onClick={() => setOpenTool(tool.id)}
                        className="group flex flex-col gap-2.5 rounded border border-border bg-surface-elevated p-4 text-left transition-colors hover:border-primary/40 hover:bg-surface-elevated/80"
                      >
                        <div className="flex h-8 w-8 items-center justify-center rounded border border-primary/20 bg-primary/10 transition-colors group-hover:border-primary/40 group-hover:bg-primary/15">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        <div>
                          <p className="font-mono text-xs font-semibold text-foreground">{tool.label}</p>
                          <p className="mt-0.5 text-[11px] text-muted-foreground">{tool.desc}</p>
                        </div>
                      </motion.button>
                    )
                  })}

                  {/* Add Tool placeholder */}
                  <motion.button
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: TOOLS.length * 0.04 }}
                    className="flex flex-col items-center justify-center gap-2 rounded border border-dashed border-border p-4 text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    <Plus className="h-5 w-5" />
                    <span className="font-mono text-[11px]">Add Tool</span>
                  </motion.button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tool panels render at z-50, on top of the z-40 grid */}
      <AnimatePresence>
        {openTool === 'sms'        && <SmsSummaries      onClose={() => setOpenTool(null)} />}
        {openTool === 'flashcards' && <FlashcardGenerator onClose={() => setOpenTool(null)} />}
        {openTool === 'grades'     && <GradeCalculator    onClose={() => setOpenTool(null)} />}
        {openTool === 'workouts'   && <WorkoutLoggerTool  onClose={() => setOpenTool(null)} />}
        {openTool === 'meals'      && <MealLogger         onClose={() => setOpenTool(null)} />}
        {openTool === 'repo'       && <RepoScanner        onClose={() => setOpenTool(null)} />}
        {openTool === 'habits'     && <HabitStreaks       onClose={() => setOpenTool(null)} />}
        {openTool === 'github'     && <GitHubTool         onClose={() => setOpenTool(null)} />}
      </AnimatePresence>
    </>
  )
}
