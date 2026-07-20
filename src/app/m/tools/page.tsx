'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Grid3X3, Search, Brain, GitBranch, ExternalLink } from 'lucide-react'
import { BottomSheet } from '@/components/mobile/BottomSheet'

interface QuickAction {
  id: string
  label: string
  icon: typeof Search
  action: () => void
  description: string
}

export default function MobileToolsPage() {
  const [moreToolsOpen, setMoreToolsOpen] = useState(false)
  const [searchInput, setSearchInput] = useState('')
  const [searchResult, setSearchResult] = useState<string | null>(null)
  const [memoryQuery, setMemoryQuery] = useState('')
  const [memoryResult, setMemoryResult] = useState<string | null>(null)

  const handleWebSearch = async () => {
    if (!searchInput.trim()) return
    setSearchResult('Searching…')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Search the web for: ${searchInput}. Be concise — limit to 3 key findings.` }],
          model: 'deepseek/deepseek-v4-pro',
          focusMode: 'web_only',
        }),
      })
      if (!res.ok) { setSearchResult('Search failed'); return }
      // SSE streaming — accumulate for display
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let result = ''
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          result += decoder.decode(value, { stream: true })
        }
      }
      // Extract text from SSE format
      const textMatch = result.match(/"text":"([^"]+)"/g)
      if (textMatch) {
        setSearchResult(textMatch.map((m) => m.replace(/"text":"|"$/g, '').replace(/\\n/g, '\n')).join(''))
      } else {
        setSearchResult('No results')
      }
    } catch {
      setSearchResult('Search failed')
    }
  }

  const handleMemorySearch = async () => {
    if (!memoryQuery.trim()) return
    setMemoryResult('Searching memory…')
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Recall memories about: ${memoryQuery}. List what you find.` }],
          model: 'deepseek/deepseek-v4-pro',
          focusMode: 'memory_only',
        }),
      })
      if (!res.ok) { setMemoryResult('Search failed'); return }
      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let result = ''
      if (reader) {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          result += decoder.decode(value, { stream: true })
        }
      }
      const textMatch = result.match(/"text":"([^"]+)"/g)
      if (textMatch) {
        setMemoryResult(textMatch.map((m) => m.replace(/"text":"|"$/g, '').replace(/\\n/g, '\n')).join(''))
      } else {
        setMemoryResult('No memories found')
      }
    } catch {
      setMemoryResult('Search failed')
    }
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <header
        className="flex-shrink-0 border-b border-border bg-surface-secondary px-4 py-3"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)' }}
      >
        <div className="flex items-center gap-2">
          <Grid3X3 className="h-4 w-4 text-primary" />
          <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">Tools</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto scrollbar-hidden px-4 py-4">
        <div className="space-y-4">
          {/* Web Search */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl border border-border bg-surface-secondary p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <Search className="h-4 w-4 text-primary" />
              <span className="font-mono text-xs font-semibold text-foreground">Web Search</span>
            </div>
            <div className="flex gap-2">
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search the web…"
                className="flex-1 rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/30 focus:outline-none"
                style={{ minHeight: 44 }}
                onKeyDown={(e) => e.key === 'Enter' && handleWebSearch()}
              />
              <button
                onClick={handleWebSearch}
                className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20"
                style={{ minHeight: 44 }}
              >
                Go
              </button>
            </div>
            {searchResult && (
              <div className="mt-3 rounded border border-border bg-surface-elevated px-3 py-2">
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-foreground/80">{searchResult}</pre>
              </div>
            )}
          </motion.div>

          {/* Memory Search */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="rounded-xl border border-border bg-surface-secondary p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" />
              <span className="font-mono text-xs font-semibold text-foreground">Memory Search</span>
            </div>
            <div className="flex gap-2">
              <input
                value={memoryQuery}
                onChange={(e) => setMemoryQuery(e.target.value)}
                placeholder='What did I say about…'
                className="flex-1 rounded-lg border border-border bg-surface-elevated px-3 py-2 font-mono text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/30 focus:outline-none"
                style={{ minHeight: 44 }}
                onKeyDown={(e) => e.key === 'Enter' && handleMemorySearch()}
              />
              <button
                onClick={handleMemorySearch}
                className="rounded-lg border border-primary/30 bg-primary/10 px-4 py-2 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20"
                style={{ minHeight: 44 }}
              >
                Go
              </button>
            </div>
            {memoryResult && (
              <div className="mt-3 rounded border border-border bg-surface-elevated px-3 py-2">
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-foreground/80">{memoryResult}</pre>
              </div>
            )}
          </motion.div>

          {/* GitHub Quick-check */}
          <motion.a
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            href="/agent"
            className="flex items-center justify-between rounded-xl border border-border bg-surface-secondary p-4 transition-colors hover:border-primary/20"
            style={{ minHeight: 44 }}
          >
            <div className="flex items-center gap-2">
              <GitBranch className="h-4 w-4 text-primary" />
              <span className="font-mono text-xs font-semibold text-foreground">GitHub</span>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground" />
          </motion.a>

          {/* More tools button */}
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            onClick={() => setMoreToolsOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface-secondary p-4 transition-colors hover:border-primary/20"
            style={{ minHeight: 44 }}
          >
            <Grid3X3 className="h-4 w-4 text-muted-foreground" />
            <span className="font-mono text-xs text-muted-foreground">More tools</span>
          </motion.button>
        </div>
      </div>

      {/* More tools bottom sheet */}
      <BottomSheet open={moreToolsOpen} onClose={() => setMoreToolsOpen(false)} title="More tools" height="50dvh">
        <div className="divide-y divide-border/40 px-4">
          {[
            { label: 'Flashcard Generator', note: 'Open on desktop' },
            { label: 'Workout Logger', note: 'Open on desktop' },
            { label: 'Meal Logger', note: 'Open on desktop' },
            { label: 'Grade Calculator', note: 'Open on desktop' },
            { label: 'Habit Streaks', note: 'Open on desktop' },
            { label: 'Race Pace Calculator', note: 'Open on desktop' },
            { label: 'Daily Check-in', note: 'Open on desktop' },
            { label: 'Bell Schedule', note: 'Open on desktop' },
            { label: 'Chief of Staff', note: 'Open on desktop' },
            { label: 'The Aperture', note: 'Open on desktop' },
            { label: 'The Root Cause', note: 'Open on desktop' },
            { label: 'Ghost Mode', note: 'Open on desktop' },
            { label: 'Repos & Coding', note: 'Open on desktop' },
          ].map((tool) => (
            <div
              key={tool.label}
              className="flex items-center justify-between py-3"
              style={{ minHeight: 44 }}
            >
              <span className="font-mono text-[11px] text-foreground">{tool.label}</span>
              <span className="font-mono text-[9px] text-muted-foreground/50">{tool.note}</span>
            </div>
          ))}
        </div>
      </BottomSheet>
    </div>
  )
}
