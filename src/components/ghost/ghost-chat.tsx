'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Save, Loader2, Hourglass } from 'lucide-react'
import { saveResource, type GhostConversationPayload, type GhostMessage } from '@/lib/resources'
import type { GhostWindowSelection } from './window-picker'

// The conversation view. Deliberately NOT the normal enry chat: amber
// "temporal" accents instead of the green primary, a persistent banner naming
// the window, serif-adjacent quiet framing. Talking to a reconstruction should
// feel different from talking to the agent.

export function GhostChat({ window: win, onExit }: { window: GhostWindowSelection; onExit: () => void }) {
  const [messages, setMessages] = useState<GhostMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [saved, setSaved] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || streaming) return
    setInput('')
    setSaved(false)
    const history: GhostMessage[] = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'ghost', content: '' }])
    setStreaming(true)

    try {
      const res = await fetch('/api/ghost/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          window: { start: win.start, end: win.end, label: win.label },
          messages: history,
        }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'request failed' }))
        setMessages([...history, { role: 'ghost', content: `[${err.error ?? 'request failed'}]` }])
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        const current = acc
        setMessages([...history, { role: 'ghost', content: current }])
      }
    } catch {
      setMessages([...history, { role: 'ghost', content: '[connection lost]' }])
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }, [input, messages, streaming, win])

  const save = useCallback(async () => {
    if (messages.length === 0) return
    const payload: GhostConversationPayload = {
      window_start: win.start,
      window_end: win.end,
      window_label: win.label,
      messages,
      corpus_resource_ids: win.corpusResourceIds.slice(0, 200),
      created_at: new Date().toISOString(),
    }
    await saveResource('ghost_conversation', `Ghost — ${win.label}`, payload)
    setSaved(true)
  }, [messages, win])

  return (
    <div className="flex h-full flex-col">
      {/* Persistent temporal banner */}
      <div className="flex items-center justify-between border-b border-warning/25 bg-warning/5 px-4 py-2">
        <button onClick={onExit} className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> window
        </button>
        <div className="flex items-center gap-2">
          <Hourglass className="h-3.5 w-3.5 text-warning" />
          <span className="font-mono text-[11px] text-warning">
            Talking to Henry — {win.label} <span className="text-warning/60">({win.start} → {win.end})</span>
          </span>
        </div>
        <button
          onClick={save}
          disabled={messages.length === 0 || saved}
          className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
        >
          <Save className="h-3.5 w-3.5" /> {saved ? 'saved' : 'save'}
        </button>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="mx-auto max-w-md pt-10 text-center">
            <p className="text-sm text-muted-foreground">
              This is a reconstruction of you from {win.label}, built from {win.voiceSampleCount > 0 ? 'your own writing and' : ''} what you logged then.
              He doesn&apos;t know anything after {win.end}.
            </p>
            <p className="mt-2 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">a mirror, not a séance</p>
          </div>
        )}
        {messages.map((m, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] whitespace-pre-wrap rounded-lg px-3.5 py-2.5 text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'border border-border bg-surface-elevated text-foreground'
                  : 'border border-warning/25 bg-warning/5 text-foreground/90'
              }`}
            >
              {m.role === 'ghost' && (
                <div className="mb-1 font-mono text-[9px] uppercase tracking-wider text-warning/70">henry · {win.label}</div>
              )}
              {m.content || (streaming && i === messages.length - 1 ? <Loader2 className="h-3.5 w-3.5 animate-spin text-warning/70" /> : m.content)}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Input */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            rows={1}
            placeholder={`Say something to yourself in ${win.label}…`}
            className="max-h-32 flex-1 resize-none rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-warning/40 focus:outline-none"
          />
          <button
            onClick={send}
            disabled={streaming || !input.trim()}
            className="rounded border border-warning/50 bg-warning/10 px-3 py-2 font-mono text-xs text-warning transition-colors hover:bg-warning/20 disabled:opacity-40"
          >
            {streaming ? <Loader2 className="h-4 w-4 animate-spin" /> : 'send'}
          </button>
        </div>
      </div>
    </div>
  )
}
