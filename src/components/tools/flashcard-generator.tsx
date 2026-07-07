'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Brain, ChevronLeft, ChevronRight, RotateCcw, Loader2 } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { saveResource } from '@/lib/resources'

interface Flashcard {
  question: string
  answer: string
}

function parseFlashcards(text: string): Flashcard[] {
  const cards: Flashcard[] = []
  const blocks = text.split(/\n\s*\n/).filter(Boolean)
  for (const block of blocks) {
    const qMatch = block.match(/Q:\s*(.+)/i)
    const aMatch = block.match(/A:\s*(.+)/i)
    if (qMatch && aMatch) {
      cards.push({ question: qMatch[1].trim(), answer: aMatch[1].trim() })
    }
  }
  return cards
}

interface FlashcardGeneratorProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function FlashcardGenerator({ onClose, mode = 'modal', onSave }: FlashcardGeneratorProps) {
  const [notes, setNotes] = useState('')
  const [cards, setCards] = useState<Flashcard[]>([])
  const [generating, setGenerating] = useState(false)
  const [current, setCurrent] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [error, setError] = useState('')

  const handleGenerate = async () => {
    const text = notes.trim()
    if (!text) return
    setGenerating(true)
    setError('')
    setCards([])
    setCurrent(0)
    setFlipped(false)
    try {
      const res = await fetch('/api/automations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Create 6–10 Anki-style flashcards from these notes. Each card must be on its own paragraph with exactly this format:\nQ: <question>\nA: <answer>\n\nNotes:\n${text}`,
        }),
      })
      const data = await res.json()
      if (data.error || !data.text) throw new Error(data.error ?? 'No response')
      const parsed = parseFlashcards(data.text)
      if (parsed.length === 0) throw new Error('Could not parse flashcards from response')
      setCards(parsed)
      await saveResource('flashcards', text.slice(0, 80), { notes: text, cards: parsed }).catch((e) => console.error('saveResource failed:', e))
      onSave?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setGenerating(false)
    }
  }

  const card = cards[current]

  const icon = <Brain className="h-4 w-4 text-primary" />

  const body = cards.length === 0 ? (
    <div className="space-y-4">
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Paste your notes here…"
        rows={10}
        className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 resize-none"
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        onClick={handleGenerate}
        disabled={generating || !notes.trim()}
        className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {generating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Generating cards...
          </>
        ) : (
          <>
            <Brain className="h-4 w-4" />
            Generate Flashcards
          </>
        )}
      </button>
    </div>
  ) : (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">
          {current + 1} / {cards.length}
        </span>
        <button
          onClick={() => { setCards([]); setNotes('') }}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
        >
          <RotateCcw className="h-3 w-3" />
          New cards
        </button>
      </div>

      <div
        className="relative h-48 cursor-pointer select-none"
        style={{ perspective: 1000 }}
        onClick={() => setFlipped((f) => !f)}
      >
        <AnimatePresence mode="wait">
          {!flipped ? (
            <motion.div
              key="question"
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex flex-col items-center justify-center rounded border border-border bg-surface-elevated p-6 text-center"
            >
              <span className="mb-3 font-mono text-[10px] uppercase tracking-wider text-primary">Question</span>
              <p className="text-sm text-foreground">{card.question}</p>
              <p className="mt-4 text-[10px] text-muted-foreground">tap to reveal answer</p>
            </motion.div>
          ) : (
            <motion.div
              key="answer"
              initial={{ rotateY: 90, opacity: 0 }}
              animate={{ rotateY: 0, opacity: 1 }}
              exit={{ rotateY: -90, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 flex flex-col items-center justify-center rounded border border-primary/30 bg-primary/5 p-6 text-center"
            >
              <span className="mb-3 font-mono text-[10px] uppercase tracking-wider text-primary">Answer</span>
              <p className="text-sm text-foreground">{card.answer}</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => { setCurrent((c) => Math.max(0, c - 1)); setFlipped(false) }}
          disabled={current === 0}
          className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>
        <button
          onClick={() => { setCurrent((c) => Math.min(cards.length - 1, c + 1)); setFlipped(false) }}
          disabled={current === cards.length - 1}
          className="flex flex-1 items-center justify-center gap-1.5 rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground hover:border-primary/40 hover:text-primary disabled:opacity-40"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel
        title="Flashcard Generator"
        subtitle="Paste notes → AI generates Anki-style cards"
        icon={icon}
        onClose={onClose}
      >
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell
      title="Flashcard Generator"
      subtitle="Paste notes → AI generates Anki-style cards"
      icon={icon}
      onClose={onClose}
      width="w-[540px]"
    >
      {body}
    </ModalShell>
  )
}
