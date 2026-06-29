'use client'

import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { Timer, Play, Pause, RotateCcw, Flame, HelpCircle, Eye } from 'lucide-react'
import { ModalShell } from './modal-shell'
import {
  loadSessions,
  startSession,
  completeSession,
  discardSession,
  calculateStreak,
  type StudySession,
} from '@/lib/study-timer'

const DURATIONS = [15, 25, 45, 60]

function parseQuiz(text: string): { question: string; answer: string } | null {
  const qMatch = text.match(/Q:\s*(.+)/i)
  const aMatch = text.match(/A:\s*(.+)/i)
  if (!qMatch) return null
  return { question: qMatch[1].trim(), answer: aMatch?.[1]?.trim() ?? 'No answer generated.' }
}

function formatClock(totalSec: number): string {
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function StudyTimerPanel({ onClose }: { onClose: () => void }) {
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [subject, setSubject] = useState('')
  const [durationMin, setDurationMin] = useState(25)
  const [phase, setPhase] = useState<'idle' | 'running' | 'paused' | 'completed'>('idle')
  const [remainingSec, setRemainingSec] = useState(25 * 60)
  const [quiz, setQuiz] = useState<{ question: string; answer: string } | null>(null)
  const [showAnswer, setShowAnswer] = useState(false)
  const [generatingQuiz, setGeneratingQuiz] = useState(false)
  const sessionIdRef = useRef<string | null>(null)

  useEffect(() => {
    setSessions(loadSessions())
  }, [])

  useEffect(() => {
    if (phase !== 'running') return
    const interval = setInterval(() => {
      setRemainingSec((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          handleComplete()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  const handleStart = () => {
    if (!subject.trim()) return
    const session = startSession(subject.trim(), durationMin)
    sessionIdRef.current = session.id
    setRemainingSec(durationMin * 60)
    setPhase('running')
    setQuiz(null)
    setShowAnswer(false)
  }

  const handlePause = () => setPhase((p) => (p === 'running' ? 'paused' : 'running'))

  const handleReset = () => {
    if (sessionIdRef.current) discardSession(sessionIdRef.current)
    sessionIdRef.current = null
    setPhase('idle')
    setRemainingSec(durationMin * 60)
    setQuiz(null)
    setSessions(loadSessions())
  }

  const handleComplete = async () => {
    setPhase('completed')
    const id = sessionIdRef.current
    if (!id) return
    setGeneratingQuiz(true)
    try {
      const res = await fetch('/api/automations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Generate one short quiz question (and its concise answer) to test recall on this subject: "${subject}". Respond in exactly this format:\nQ: <question>\nA: <answer>`,
        }),
      })
      const data = await res.json()
      const parsed = data.text ? parseQuiz(data.text) : null
      completeSession(id, parsed)
      setQuiz(parsed)
    } catch (error) {
      console.error('quiz generation failed:', error)
      completeSession(id, null)
    } finally {
      setGeneratingQuiz(false)
      setSessions(loadSessions())
      sessionIdRef.current = null
    }
  }

  const streak = calculateStreak(sessions)
  const completedSessions = sessions.filter((s) => s.completedAt)

  return (
    <ModalShell title="Smart Study Timer" subtitle="Pomodoro with recall quizzes" icon={<Timer className="h-4 w-4 text-primary" />} onClose={onClose}>
      <div className="mb-4 flex items-center justify-between rounded border border-border bg-surface-elevated px-3 py-2">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-warning" />
          <span className="text-sm text-foreground">{streak} day streak</span>
        </div>
        <span className="font-mono text-xs text-muted-foreground">{completedSessions.length} sessions completed</span>
      </div>

      {phase === 'idle' && (
        <div className="space-y-3">
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="What are you studying?"
            className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
          />
          <div className="flex gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d}
                onClick={() => {
                  setDurationMin(d)
                  setRemainingSec(d * 60)
                }}
                className={`flex-1 rounded border px-2 py-1.5 text-xs transition-colors ${
                  durationMin === d ? 'border-primary/40 bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                {d}m
              </button>
            ))}
          </div>
          <button
            onClick={handleStart}
            disabled={!subject.trim()}
            className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            Start session
          </button>
        </div>
      )}

      {(phase === 'running' || phase === 'paused') && (
        <div className="flex flex-col items-center gap-4 py-4">
          <p className="text-sm text-muted-foreground">{subject}</p>
          <motion.p
            key={remainingSec}
            initial={{ scale: 1 }}
            animate={{ scale: [1, 1.02, 1] }}
            transition={{ duration: 0.3 }}
            className="font-mono text-5xl font-semibold text-foreground"
          >
            {formatClock(remainingSec)}
          </motion.p>
          <div className="flex gap-2">
            <button
              onClick={handlePause}
              className="flex items-center gap-1.5 rounded border border-border bg-surface-elevated px-4 py-2 text-sm text-foreground hover:border-primary/40 hover:text-primary"
            >
              {phase === 'running' ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              {phase === 'running' ? 'Pause' : 'Resume'}
            </button>
            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 rounded border border-border bg-surface-elevated px-4 py-2 text-sm text-muted-foreground hover:border-destructive/40 hover:text-destructive"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>
          </div>
        </div>
      )}

      {phase === 'completed' && (
        <div className="space-y-3">
          <div className="rounded border border-primary/30 bg-primary/5 p-3 text-center text-sm text-foreground">
            Session complete — {durationMin} min on {subject}
          </div>
          {generatingQuiz ? (
            <p className="text-center text-xs text-muted-foreground">Generating a quiz question...</p>
          ) : quiz ? (
            <div className="rounded border border-warning/20 bg-warning/5 p-3">
              <div className="mb-1.5 flex items-center gap-1.5">
                <HelpCircle className="h-3.5 w-3.5 text-warning" />
                <span className="text-xs font-medium text-foreground">{quiz.question}</span>
              </div>
              {showAnswer ? (
                <p className="text-xs text-muted-foreground">{quiz.answer}</p>
              ) : (
                <button
                  onClick={() => setShowAnswer(true)}
                  className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  <Eye className="h-3 w-3" />
                  Show answer
                </button>
              )}
            </div>
          ) : null}
          <button
            onClick={() => {
              setPhase('idle')
              setSubject('')
              setQuiz(null)
            }}
            className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground hover:border-primary/40 hover:text-primary"
          >
            Start another session
          </button>
        </div>
      )}
    </ModalShell>
  )
}
