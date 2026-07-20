'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { GitBranch, Send, Loader2, Star, Code2, FileText, X, MessageSquare, CheckCircle, Copy, Check } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { saveResource } from '@/lib/resources'

interface RepoInfo {
  name: string
  description: string
  stars: number
  language: string
  topics: string[]
  readme: string
  fileTree: string[]
}

interface Message { role: 'user' | 'assistant'; text: string }

type RepoMode = 'chat' | 'evaluate'

interface RepoScannerProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function RepoScanner({ onClose, mode = 'modal', onSave }: RepoScannerProps) {
  const [url, setUrl] = useState('')
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [repoMode, setRepoMode] = useState<RepoMode>('chat')
  const [messages, setMessages] = useState<Message[]>([])
  const [chatInput, setChatInput] = useState('')
  const [thinking, setThinking] = useState(false)

  // "Can I use this?" mode state
  const [useCase, setUseCase] = useState('')
  const [evalResult, setEvalResult] = useState<string | null>(null)
  const [evalError, setEvalError] = useState('')

  const handleFetch = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setFetching(true)
    setFetchError('')
    setRepo(null)
    setMessages([])
    setEvalResult(null)
    setEvalError('')
    try {
      const res = await fetch('/api/tools/fetch-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRepo(data)
      await saveResource('repo_scan', data.name, data).catch((e) => console.error('saveResource failed:', e))
      onSave?.()
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch repo')
    } finally {
      setFetching(false)
    }
  }

  const handleChat = async () => {
    if (!chatInput.trim() || !repo) return
    const userMsg = chatInput.trim()
    setChatInput('')
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }])
    setThinking(true)
    try {
      const context = `Repository: ${repo.name}\nDescription: ${repo.description}\nLanguage: ${repo.language}\nStars: ${repo.stars}\n\nFile structure (first 100 files):\n${repo.fileTree.slice(0, 100).join('\n')}\n\nREADME:\n${repo.readme}`
      const res = await fetch('/api/automations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system: `You are a code assistant helping analyze a GitHub repository. Here is the repo context:\n\n${context}`,
          prompt: userMsg,
        }),
      })
      const data = await res.json()
      if (data.error) {
        setMessages((prev) => [...prev, { role: 'assistant', text: `Error: ${data.error}` }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: data.text ?? 'No response.' }])
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error('repo chat failed:', detail)
      setMessages((prev) => [...prev, { role: 'assistant', text: `Chat failed: ${detail}. Check your network and try again.` }])
    } finally {
      setThinking(false)
    }
  }

  const handleEvaluate = async () => {
    if (!useCase.trim() || !repo) return
    setThinking(true)
    setEvalError('')
    setEvalResult(null)
    try {
      const res = await fetch('/api/tools/repo-analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo, useCase: useCase.trim() }),
      })
      const data = await res.json()
      if (data.error) {
        setEvalError(data.error)
      } else {
        setEvalResult(data.text)
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setEvalError(`Analysis failed: ${detail}`)
    } finally {
      setThinking(false)
    }
  }

  const icon = <GitBranch className="h-4 w-4 text-primary" />

  const body = (
    <div className="space-y-4">
      <div className="flex gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
          placeholder="https://github.com/owner/repo"
          className="flex-1 rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          onClick={handleFetch}
          disabled={fetching || !url.trim()}
          className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
        >
          {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
          Fetch
        </button>
        {repo && (
          <button onClick={() => { setRepo(null); setMessages([]); setEvalResult(null); setEvalError('') }} className="rounded p-2 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {fetchError && <p className="text-xs text-destructive">{fetchError}</p>}

      {repo && (
        <>
          <div className="rounded border border-primary/20 bg-primary/5 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-mono text-sm font-semibold text-foreground">{repo.name}</p>
                {repo.description && <p className="mt-0.5 text-xs text-muted-foreground">{repo.description}</p>}
              </div>
              <div className="flex flex-shrink-0 items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Star className="h-3 w-3" />{repo.stars}</span>
                {repo.language && <span className="flex items-center gap-1"><Code2 className="h-3 w-3" />{repo.language}</span>}
                <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{repo.fileTree.length} files</span>
              </div>
            </div>
            {repo.topics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {repo.topics.slice(0, 6).map((t) => (
                  <span key={t} className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">{t}</span>
                ))}
              </div>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 rounded border border-border bg-surface-elevated p-0.5">
            <button
              onClick={() => setRepoMode('chat')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                repoMode === 'chat' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare className="h-3 w-3" />
              Chat
            </button>
            <button
              onClick={() => setRepoMode('evaluate')}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                repoMode === 'evaluate' ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <CheckCircle className="h-3 w-3" />
              Can I use this?
            </button>
          </div>

          {/* Chat Mode */}
          {repoMode === 'chat' && (
            <div className="space-y-3">
              <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Chat about this repo</p>

              <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-hidden">
                <AnimatePresence>
                  {messages.map((msg, i) => (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                      className={`rounded border px-3 py-2 text-xs ${msg.role === 'user' ? 'border-primary/20 bg-primary/5 text-foreground' : 'border-border bg-surface-elevated text-foreground'}`}>
                      <span className="mr-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">{msg.role === 'user' ? 'you' : 'enry'}</span>
                      {msg.text}
                    </motion.div>
                  ))}
                </AnimatePresence>
                {thinking && (
                  <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> thinking...
                  </div>
                )}
                {messages.length === 0 && !thinking && (
                  <p className="py-2 text-xs text-muted-foreground">Ask anything about this repo — architecture, how to contribute, what it does, etc.</p>
                )}
              </div>

              <div className="flex gap-2">
                <input
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                  disabled={thinking}
                  placeholder="Ask something about the codebase…"
                  className="flex-1 rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleChat}
                  disabled={!chatInput.trim() || thinking}
                  className="rounded border border-primary/40 bg-primary/10 p-2 text-primary hover:bg-primary/20 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}

          {/* Evaluate Mode — "Can I use this?" */}
          {repoMode === 'evaluate' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <textarea
                  value={useCase}
                  onChange={(e) => setUseCase(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleEvaluate()
                    }
                  }}
                  disabled={thinking}
                  placeholder="What are you trying to build / use this for?"
                  rows={3}
                  className="flex-1 resize-none rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none disabled:opacity-50"
                />
                <button
                  onClick={handleEvaluate}
                  disabled={!useCase.trim() || thinking}
                  className="flex-shrink-0 self-end rounded border border-primary/40 bg-primary/10 p-2 text-primary hover:bg-primary/20 disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>

              {thinking && (
                <div className="flex items-center gap-1.5 py-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> analyzing repo against your use case...
                </div>
              )}

              {evalError && (
                <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                  {evalError}
                </div>
              )}

              {evalResult && (
                <div className="rounded border border-border bg-surface-elevated p-3 text-xs text-foreground">
                  <div className="whitespace-pre-wrap leading-relaxed">{evalResult}</div>
                </div>
              )}

              {!evalResult && !thinking && !evalError && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Describe what you're building and I'll tell you if this repo fits, how to integrate it, and how to set it up.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {!repo && !fetching && !fetchError && (
        <p className="py-6 text-center text-xs text-muted-foreground">Enter a GitHub repo URL above to get started.</p>
      )}
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel
        title="Repo Scanner"
        subtitle="Fetch a GitHub repo and chat about the code"
        icon={icon}
        onClose={onClose}
      >
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell
      title="Repo Scanner"
      subtitle="Fetch a GitHub repo and chat about the code"
      icon={icon}
      onClose={onClose}
      width="w-[640px]"
    >
      {body}
    </ModalShell>
  )
}
