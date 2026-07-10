'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Check, ChevronRight, Pencil, ArrowLeft, User, BookOpen, Dumbbell, Apple, Clock, Sliders, X, Loader2, AlertCircle } from 'lucide-react'
import type { UserProfile, PriorityKey } from '@/lib/user-profile'
import { createDefaultProfile, saveProfile } from '@/lib/user-profile'

interface OnboardingFlowProps {
  open: boolean
  onComplete: () => void
  onClose: () => void
  onSkip: () => void
}

// ─── Question definitions ────────────────────────────────────

interface Question {
  id: string
  category: string
  categoryIcon: React.ElementType
  question: string
  hint?: string
  type: 'text' | 'textarea' | 'select' | 'number' | 'time' | 'rank'
  key: keyof UserProfile | 'priorities'
  options?: { label: string; value: string }[]
  multiline?: boolean
  placeholder?: string
}

const QUESTIONS: Question[] = [
  // ── Identity ──
  { id: 'name', category: 'Identity', categoryIcon: User, question: 'What should I call you?', type: 'text', key: 'name', placeholder: 'Your name' },
  { id: 'grade', category: 'Identity', categoryIcon: User, question: 'What grade are you in?', type: 'text', key: 'grade', placeholder: 'e.g. 10th grade / Freshman / Senior' },

  // ── Academics ──
  { id: 'classes', category: 'Academics', categoryIcon: BookOpen, question: 'What classes are you taking this year?', type: 'textarea', key: 'classes', multiline: true, placeholder: 'e.g. AP Calculus, English, Chemistry, History...' },
  { id: 'helpSubjects', category: 'Academics', categoryIcon: BookOpen, question: 'What subjects do you want help with most?', type: 'textarea', key: 'helpSubjects', multiline: true, placeholder: 'e.g. Calculus, essay writing, physics problem sets' },
  { id: 'gpaGoal', category: 'Academics', categoryIcon: BookOpen, question: "What's your GPA goal?", type: 'text', key: 'gpaGoal', placeholder: 'e.g. 4.0 / 3.5 / Just pass everything' },

  // ── Athletics ──
  { id: 'sports', category: 'Athletics', categoryIcon: Dumbbell, question: 'What sports do you play?', type: 'text', key: 'sports', placeholder: 'e.g. Track, Football, Basketball, Swimming' },
  { id: 'currentPRs', category: 'Athletics', categoryIcon: Dumbbell, question: "What are your current PRs?", type: 'textarea', key: 'currentPRs', multiline: true, placeholder: "e.g. 200m: 23.72, bench: 205, mile: 5:20" },
  { id: 'targetPRs', category: 'Athletics', categoryIcon: Dumbbell, question: 'What are your target PRs this season?', type: 'textarea', key: 'targetPRs', multiline: true, placeholder: "e.g. 200m: 22.5, bench: 225, mile: 4:50" },
  { id: 'trainingDays', category: 'Athletics', categoryIcon: Dumbbell, question: 'How many days a week do you train?', type: 'number', key: 'trainingDays', placeholder: 'e.g. 5' },

  // ── Fitness & Nutrition ──
  { id: 'weightGoals', category: 'Fitness & Nutrition', categoryIcon: Apple, question: 'Current weight and goal weight?', type: 'text', key: 'weightGoals', placeholder: 'e.g. 160lbs → 175lbs' },
  { id: 'dietGoal', category: 'Fitness & Nutrition', categoryIcon: Apple, question: 'Are you bulking, cutting, or maintaining?', type: 'select', key: 'dietGoal', options: [
    { label: 'Bulking — gaining mass', value: 'bulking' },
    { label: 'Cutting — losing fat', value: 'cutting' },
    { label: 'Maintaining', value: 'maintaining' },
    { label: 'Not sure yet', value: '' },
  ]},
  { id: 'avoidedFoods', category: 'Fitness & Nutrition', categoryIcon: Apple, question: 'Any foods you avoid?', type: 'textarea', key: 'avoidedFoods', multiline: true, placeholder: 'e.g. Dairy, gluten, shellfish, nothing in particular' },
  { id: 'proteinTarget', category: 'Fitness & Nutrition', categoryIcon: Apple, question: 'Daily protein target in grams?', type: 'text', key: 'proteinTarget', hint: "Don't know? Try 1g per lb of bodyweight (e.g. 160g for 160lbs)", placeholder: 'e.g. 160' },

  // ── Productivity ──
  { id: 'wakeTime', category: 'Productivity', categoryIcon: Clock, question: 'What time do you usually wake up?', type: 'time', key: 'wakeTime', placeholder: 'e.g. 6:30 AM' },
  { id: 'practiceTime', category: 'Productivity', categoryIcon: Clock, question: 'What time is practice/training?', type: 'time', key: 'practiceTime', placeholder: 'e.g. 3:00 PM' },
  { id: 'homeworkTime', category: 'Productivity', categoryIcon: Clock, question: 'When do you usually do homework?', type: 'time', key: 'homeworkTime', placeholder: 'e.g. 7:00 PM — 9:00 PM' },
  { id: 'sleepGoal', category: 'Productivity', categoryIcon: Clock, question: 'How many hours of sleep do you aim for?', type: 'number', key: 'sleepGoal', placeholder: 'e.g. 8' },

  // ── Preferences ──
  { id: 'communicationStyle', category: 'Preferences', categoryIcon: Sliders, question: 'How do you want enry to talk to you?', type: 'select', key: 'communicationStyle', options: [
    { label: 'Direct and blunt — no sugarcoating', value: 'direct' },
    { label: 'Friendly and encouraging — hype me up', value: 'friendly' },
    { label: 'Somewhere in between', value: 'balanced' },
  ]},
]

const PRIORITY_OPTIONS: { key: PriorityKey; label: string; mark: string }[] = [
  { key: 'grades', label: 'Grades', mark: 'G' },
  { key: 'athletics', label: 'Athletics', mark: 'A' },
  { key: 'projects', label: 'Building Projects', mark: 'P' },
  { key: 'social', label: 'Social Life', mark: 'S' },
]

// ─── Sub-components ──────────────────────────────────────────

function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current + 1) / (total + 1)) * 100 // +1 for summary step
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-mono text-muted-foreground">
          Step {current + 1} of {total + 1}
        </span>
        <span className="text-xs font-mono text-primary">{Math.round(pct)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-surface-elevated overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.4, ease: [0, 0, 0.2, 1] }}
        />
      </div>
    </div>
  )
}

function CategoryBadge({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -5 }}
      animate={{ opacity: 1, y: 0 }}
      className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs font-medium text-primary mb-6"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </motion.div>
  )
}

function QuestionInput({
  question,
  value,
  onChange,
  onSubmit,
}: {
  question: Question
  value: string
  onChange: (val: string) => void
  onSubmit: () => void
}) {
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    // Focus the input when question changes
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [question.id])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey && question.type !== 'textarea') {
      e.preventDefault()
      if (value.trim()) onSubmit()
    }
  }

  if (question.type === 'select' && question.options) {
    return (
      <div className="space-y-3">
        {question.options.map((opt) => (
          <motion.button
            key={opt.value}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.99 }}
            onClick={() => onChange(opt.value)}
            className={`w-full rounded-lg border px-4 py-3 text-left text-sm transition-all ${
              value === opt.value
                ? 'border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(0,255,102,0.1)]'
                : 'border-border bg-surface-elevated text-muted-foreground hover:border-primary/30 hover:text-foreground'
            }`}
          >
            {opt.label}
          </motion.button>
        ))}
      </div>
    )
  }

  if (question.multiline) {
    return (
      <textarea
        ref={inputRef as React.Ref<HTMLTextAreaElement>}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={question.placeholder}
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-surface-elevated px-4 py-3 text-lg text-foreground placeholder-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
      />
    )
  }

  return (
    <input
      ref={inputRef as React.Ref<HTMLInputElement>}
      type={question.type === 'number' ? 'text' : question.type === 'time' ? 'text' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={handleKeyDown}
      placeholder={question.placeholder}
      className="w-full rounded-lg border border-border bg-surface-elevated px-4 py-3 text-lg text-foreground placeholder-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
    />
  )
}

// ─── Priority Ranker ─────────────────────────────────────────

function PriorityRanker({
  priorities,
  onChange,
}: {
  priorities: Record<PriorityKey, number>
  onChange: (p: Record<PriorityKey, number>) => void
}) {
  const sorted = [...PRIORITY_OPTIONS].sort((a, b) => priorities[a.key] - priorities[b.key])

  const moveUp = (key: PriorityKey) => {
    const idx = sorted.findIndex((s) => s.key === key)
    if (idx === 0) return
    const newPriorities = { ...priorities }
    const currentRank = newPriorities[key]
    const swapKey = sorted[idx - 1].key
    newPriorities[key] = newPriorities[swapKey]
    newPriorities[swapKey] = currentRank
    onChange(newPriorities)
  }

  const moveDown = (key: PriorityKey) => {
    const idx = sorted.findIndex((s) => s.key === key)
    if (idx === sorted.length - 1) return
    const newPriorities = { ...priorities }
    const currentRank = newPriorities[key]
    const swapKey = sorted[idx + 1].key
    newPriorities[key] = newPriorities[swapKey]
    newPriorities[swapKey] = currentRank
    onChange(newPriorities)
  }

  return (
    <div className="space-y-2">
      {sorted.map((item, idx) => (
        <motion.div
          key={item.key}
          layout
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center gap-3 rounded-lg border border-border bg-surface-elevated px-4 py-3"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
            {idx + 1}
          </div>
          <span className="flex-1 text-sm text-foreground">
            {item.label}
          </span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => moveUp(item.key)}
              disabled={idx === 0}
              className="rounded p-1 text-muted-foreground hover:bg-surface-secondary hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4 rotate-[-90deg]" />
            </button>
            <button
              onClick={() => moveDown(item.key)}
              disabled={idx === sorted.length - 1}
              className="rounded p-1 text-muted-foreground hover:bg-surface-secondary hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <ChevronRight className="h-4 w-4 rotate-[90deg]" />
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

// ─── Summary Card ────────────────────────────────────────────

function SummaryCard({
  profile,
  onEdit,
  onConfirm,
  saving,
  saveError,
}: {
  profile: UserProfile
  onEdit: (key: keyof UserProfile | 'priorities') => void
  onConfirm: () => void
  saving: boolean
  saveError: boolean
}) {
  const sections: { title: string; icon: React.ElementType; fields: { label: string; value: string; key: keyof UserProfile | 'priorities' }[] }[] = [
    {
      title: 'Identity', icon: User, fields: [
        { label: 'Name', value: profile.name, key: 'name' },
        { label: 'Grade', value: profile.grade, key: 'grade' },
      ],
    },
    {
      title: 'Academics', icon: BookOpen, fields: [
        { label: 'Classes', value: profile.classes, key: 'classes' },
        { label: 'Need help with', value: profile.helpSubjects, key: 'helpSubjects' },
        { label: 'GPA Goal', value: profile.gpaGoal, key: 'gpaGoal' },
      ],
    },
    {
      title: 'Athletics', icon: Dumbbell, fields: [
        { label: 'Sports', value: profile.sports, key: 'sports' },
        { label: 'Current PRs', value: profile.currentPRs, key: 'currentPRs' },
        { label: 'Target PRs', value: profile.targetPRs, key: 'targetPRs' },
        { label: 'Training days', value: profile.trainingDays, key: 'trainingDays' },
      ],
    },
    {
      title: 'Fitness & Nutrition', icon: Apple, fields: [
        { label: 'Weight goals', value: profile.weightGoals, key: 'weightGoals' },
        { label: 'Diet phase', value: profile.dietGoal || 'Not set', key: 'dietGoal' },
        { label: 'Avoided foods', value: profile.avoidedFoods || 'None', key: 'avoidedFoods' },
        { label: 'Protein target', value: profile.proteinTarget ? `${profile.proteinTarget}g` : 'Not set', key: 'proteinTarget' },
      ],
    },
    {
      title: 'Productivity', icon: Clock, fields: [
        { label: 'Wakes up at', value: profile.wakeTime, key: 'wakeTime' },
        { label: 'Practice at', value: profile.practiceTime, key: 'practiceTime' },
        { label: 'Homework time', value: profile.homeworkTime, key: 'homeworkTime' },
        { label: 'Sleep goal', value: profile.sleepGoal ? `${profile.sleepGoal}h` : 'Not set', key: 'sleepGoal' },
      ],
    },
    {
      title: 'Preferences', icon: Sliders, fields: [
        { label: 'Style', value: profile.communicationStyle === 'direct' ? 'Direct & blunt' : profile.communicationStyle === 'friendly' ? 'Friendly & encouraging' : 'Balanced', key: 'communicationStyle' },
        { label: 'Priorities', value: 'Tap to adjust ranking', key: 'priorities' },
      ],
    },
  ]

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full"
    >
      <div className="mb-6 text-center">
        <h2 className="text-2xl font-bold text-foreground font-display">All Set, {profile.name}!</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Here&apos;s what I know about you. Tap any field to edit.
        </p>
      </div>

      <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1 scrollbar-hidden">
        {sections.map((section) => (
          <div key={section.title} className="rounded-lg border border-border bg-surface-secondary p-4">
            <div className="flex items-center gap-2 mb-3">
              <section.icon className="h-4 w-4 text-primary" />
              <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">{section.title}</h3>
            </div>
            <div className="space-y-2">
              {section.fields.map((field) => (
                <div key={field.key} className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">{field.label}</p>
                    <p className="text-sm text-foreground truncate">{field.value || <span className="italic text-muted-foreground">Not set</span>}</p>
                  </div>
                  <button
                    onClick={() => onEdit(field.key)}
                    className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-surface-elevated hover:text-primary transition-colors"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-6 space-y-3">
        {saveError && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-xs text-destructive"
          >
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            <span>Failed to save — check your connection and try again.</span>
          </motion.div>
        )}
        <motion.button
          whileHover={saving ? {} : { scale: 1.01 }}
          whileTap={saving ? {} : { scale: 0.99 }}
          onClick={onConfirm}
          disabled={saving}
          className={`w-full rounded-lg border px-6 py-3 text-sm font-semibold transition-all ${
            saveError
              ? 'border-destructive/60 bg-destructive/10 text-destructive hover:bg-destructive/20'
              : 'border-primary bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-[0_0_20px_rgba(0,255,102,0.2)]'
          } disabled:opacity-70`}
        >
          <span className="flex items-center justify-center gap-2">
            {saving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : saveError ? (
              <>
                <AlertCircle className="h-4 w-4" />
                Retry
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                Looks Good — Start Using enry
              </>
            )}
          </span>
        </motion.button>
      </div>
    </motion.div>
  )
}

// ─── Main Onboarding Flow ────────────────────────────────────

export function OnboardingFlow({ open, onComplete, onClose, onSkip }: OnboardingFlowProps) {
  const [step, setStep] = useState(0)
  const [profile, setProfile] = useState<UserProfile>(createDefaultProfile())
  const [direction, setDirection] = useState(1) // 1 = forward, -1 = backward
  const [editingField, setEditingField] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(false)

  const currentQuestion = QUESTIONS[step]
  const isPriorityStep = step === QUESTIONS.length // Last step is priority ranking
  const isSummaryStep = step === QUESTIONS.length + 1 // After priority, show summary
  const totalSteps = QUESTIONS.length + 2 // questions + priorities + summary

  const currentValue = currentQuestion
    ? (profile[currentQuestion.key as keyof UserProfile] as string) ?? ''
    : ''

  const handleChange = useCallback(
    (val: string) => {
      if (!currentQuestion) return
      setProfile((prev) => ({ ...prev, [currentQuestion.key as keyof UserProfile]: val as never }))
    },
    [currentQuestion],
  )

  const handlePriorityChange = useCallback((priorities: Record<PriorityKey, number>) => {
    setProfile((prev) => ({ ...prev, priorities }))
  }, [])

  const goNext = useCallback(() => {
    if (step < QUESTIONS.length) {
      setDirection(1)
      setStep((s) => s + 1)
    } else if (step === QUESTIONS.length) {
      // After priorities, go to summary
      setDirection(1)
      setStep((s) => s + 1)
    }
  }, [step])

  const goBack = useCallback(() => {
    if (step > 0) {
      setDirection(-1)
      setStep((s) => s - 1)
    }
  }, [step])

  const handleEdit = useCallback((key: string) => {
    // Find which step this field belongs to
    const qIdx = QUESTIONS.findIndex((q) => q.key === key)
    if (key === 'priorities') {
      setDirection(1)
      setStep(QUESTIONS.length) // Go to priority step
      setEditingField(null)
      return
    }
    if (qIdx >= 0) {
      setDirection(1)
      setStep(qIdx)
      setEditingField(null)
    }
  }, [])

  const handleConfirm = useCallback(async () => {
    setSaving(true)
    setSaveError(false)
    const completed = {
      ...profile,
      setupComplete: true,
      setupDate: Date.now(),
    }
    console.log('[onboarding] Completing setup — saving profile:', completed.name)
    const ok = await saveProfile(completed)
    if (!ok) {
      console.error('[onboarding] Failed to save completed profile — keeping modal open for retry')
      setSaving(false)
      setSaveError(true)
      return // Don't close modal — user can retry
    }
    console.log('[onboarding] Profile saved successfully on completion')
    onComplete()
  }, [profile, onComplete])

  const canAdvance = currentQuestion
    ? (currentQuestion.type === 'select' ? true : currentValue.trim().length > 0)
    : true

  // Reset when opened
  useEffect(() => {
    if (open) {
      // Defer state resets to avoid synchronous setState calls inside effect
      setTimeout(() => {
        setStep(0)
        setDirection(1)
        setProfile(createDefaultProfile())
        setEditingField(null)
        setSaving(false)
        setSaveError(false)
      }, 0)
    }
  }, [open])

  if (!open) return null

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 300 : -300,
      opacity: 0,
    }),
    center: {
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      x: direction > 0 ? -300 : 300,
      opacity: 0,
    }),
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        className="relative w-full max-w-lg mx-4"
      >
        {/* Close button — only on summary */}
        {isSummaryStep && (
          <button
            onClick={onClose}
            className="absolute -top-10 right-0 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        )}

        {/* Skip button — on every non-summary step */}
        {!isSummaryStep && (
          <button
            onClick={onSkip}
            className="absolute -top-10 right-0 text-sm text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
          >
            <X className="h-3.5 w-3.5" />
            Skip setup
          </button>
        )}

        <div className="rounded-xl border border-border bg-surface-secondary p-6 shadow-2xl">
          {/* Progress Bar */}
          {!isSummaryStep && (
            <ProgressBar current={step} total={QUESTIONS.length + 1} />
          )}

          {/* Back button */}
          {step > 0 && !isSummaryStep && (
            <button
              onClick={goBack}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-4"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back
            </button>
          )}

          {/* Question screens */}
          <AnimatePresence mode="wait" custom={direction}>
            {!isSummaryStep && !isPriorityStep && currentQuestion && (
              <motion.div
                key={currentQuestion.id}
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <CategoryBadge icon={currentQuestion.categoryIcon} label={currentQuestion.category} />

                <h2 className="mb-2 text-xl font-bold text-foreground font-display">
                  {currentQuestion.question}
                </h2>

                {currentQuestion.hint && (
                  <p className="mb-4 text-xs text-muted-foreground italic">
                    {currentQuestion.hint}
                  </p>
                )}

                <div className="mt-4">
                  <QuestionInput
                    question={currentQuestion}
                    value={currentValue}
                    onChange={handleChange}
                    onSubmit={goNext}
                  />
                </div>

                <div className="mt-6 flex justify-end">
                  <motion.button
                    whileHover={canAdvance ? { scale: 1.02 } : {}}
                    whileTap={canAdvance ? { scale: 0.98 } : {}}
                    onClick={goNext}
                    disabled={!canAdvance}
                    className={`flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-medium transition-all ${
                      canAdvance
                        ? 'border border-primary bg-primary text-primary-foreground hover:shadow-[0_0_15px_rgba(0,255,102,0.15)]'
                        : 'border border-border bg-surface-elevated text-muted-foreground cursor-not-allowed'
                    }`}
                  >
                    {step === QUESTIONS.length + 1 ? 'Finish' : 'Continue'}
                    <ChevronRight className="h-4 w-4" />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Priority Ranking Step */}
            {isPriorityStep && (
              <motion.div
                key="priorities"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.25, ease: 'easeInOut' }}
              >
                <CategoryBadge icon={Sliders} label="Preferences" />

                <h2 className="mb-1 text-xl font-bold text-foreground font-display">
                  What&apos;s most important to you right now?
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Arrange these in order of priority. #1 = most important.
                </p>

                <PriorityRanker
                  priorities={profile.priorities}
                  onChange={handlePriorityChange}
                />

                <div className="mt-6 flex justify-end">
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={goNext}
                    className="flex items-center gap-2 rounded-lg border border-primary bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:shadow-[0_0_15px_rgba(0,255,102,0.15)]"
                  >
                    See Summary
                    <ChevronRight className="h-4 w-4" />
                  </motion.button>
                </div>
              </motion.div>
            )}

            {/* Summary Card */}
            {isSummaryStep && (
              <motion.div
                key="summary"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ duration: 0.3, ease: [0.2, 0, 0, 1] }}
              >
                <SummaryCard
                  profile={profile}
                  onEdit={handleEdit}
                  onConfirm={handleConfirm}
                  saving={saving}
                  saveError={saveError}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  )
}
