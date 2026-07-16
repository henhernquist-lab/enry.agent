'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { ThumbsUp, ThumbsDown, MessageSquareWarning, Check } from 'lucide-react'

type FeedbackState = 'helpful' | 'missed' | 'corrected' | null

interface SkillFeedbackBarProps {
  invocationId?: string
  skillName?: string
}

export function SkillFeedbackBar({ invocationId, skillName }: SkillFeedbackBarProps) {
  const [feedback, setFeedback] = useState<FeedbackState>(null)
  const [submitting, setSubmitting] = useState(false)

  if (!invocationId) return null

  const submit = async (value: FeedbackState) => {
    if (!value || feedback === value) return
    setSubmitting(true)
    try {
      await fetch('/api/lab/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invocation_id: invocationId, feedback: value }),
      })
      setFeedback(value)
    } finally {
      setSubmitting(false)
    }
  }

  const baseClass =
    'flex items-center gap-1.5 rounded border px-2 py-1 font-mono text-[10px] transition-colors'

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-2 flex flex-wrap items-center gap-2"
    >
      <span className="text-[10px] text-muted-foreground">
        {skillName ? `${skillName} · ` : ''}Was this output useful?
      </span>
      <button
        onClick={() => submit('helpful')}
        disabled={submitting || feedback !== null}
        className={`${baseClass} ${
          feedback === 'helpful'
            ? 'border-primary/40 bg-primary/10 text-primary'
            : 'border-border bg-surface-elevated text-muted-foreground hover:border-primary/30 hover:text-primary'
        }`}
      >
        {feedback === 'helpful' ? <Check className="h-3 w-3" /> : <ThumbsUp className="h-3 w-3" />}
        Helpful
      </button>
      <button
        onClick={() => submit('missed')}
        disabled={submitting || feedback !== null}
        className={`${baseClass} ${
          feedback === 'missed'
            ? 'border-destructive/40 bg-destructive/10 text-destructive'
            : 'border-border bg-surface-elevated text-muted-foreground hover:border-destructive/30 hover:text-destructive'
        }`}
      >
        {feedback === 'missed' ? <Check className="h-3 w-3" /> : <ThumbsDown className="h-3 w-3" />}
        Missed
      </button>
      <button
        onClick={() => submit('corrected')}
        disabled={submitting || feedback !== null}
        className={`${baseClass} ${
          feedback === 'corrected'
            ? 'border-warning/40 bg-warning/10 text-warning'
            : 'border-border bg-surface-elevated text-muted-foreground hover:border-warning/30 hover:text-warning'
        }`}
      >
        {feedback === 'corrected' ? <Check className="h-3 w-3" /> : <MessageSquareWarning className="h-3 w-3" />}
        I corrected it
      </button>
    </motion.div>
  )
}
