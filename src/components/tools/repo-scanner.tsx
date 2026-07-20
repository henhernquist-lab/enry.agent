'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  GitBranch, Send, Loader2, Star, Code2, FileText, X,
  MessageSquare, CheckCircle, Sparkles, Lightbulb, Puzzle,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
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

interface Message {
  role: 'user' | 'assistant'
  text: string
}

type RepoMode = 'chat' | 'evaluate'

interface RepoScannerProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

const DEFAULT_PROMPTS = [
  { text: 'Give me a quick summary of this codebase', icon: Sparkles, label: 'Summary' },
  { text: 'Give me the prompt to build this', icon: Lightbulb, label: 'Build Prompt' },
  { text: 'How can I integrate this into my project', icon: Puzzle, label: 'Integration' },
]

const MD_CLASSES = [
  'prose-custom', 'text-xs', 'leading-relaxed',
  '[&_p]:my-1', '[&_p:first-child]:mt-0', '[&_p:last-child]:mb-0',
  '[&_ul]:my-1', '[&_ol]:my-1', '[&_li]:my-0.5',
  '[&_h1]:my-2', '[&_h2]:my-1.5', '[&_h3]:my-1', '[&_h4]:my-1',
  '[&_pre]:my-2', '[&_pre]:rounded', '[&_pre]:border', '[&_pre]:border-border',
  '[&_pre]:bg-surface-secondary', '[&_pre]:p-2.5', '[&_pre]:text-[11px]', '[&_pre]:leading-relaxed',
  '[&_code]:rounded', '[&_code]:bg-surface-secondary/60', '[&_code]:px-1', '[&_code]:py-0.5',
  '[&_code]:font-mono', '[&_code]:text-[11px]',
  '[&_pre_code]:bg-transparent', '[&_pre_code]:p-0',
  '[&_a]:text-primary', '[&_a]:underline', '[&_a]:underline-offset-2', '[&_a:hover]:opacity-80',
  '[&_blockquote]:my-1', '[&_blockquote]:border-l-2', '[&_blockquote]:border-primary/30',
  '[&_blockquote]:pl-2.5', '[&_blockquote]:italic', '[&_blockquote]:text-muted-foreground',
  '[&_hr]:my-2', '[&_hr]:border-border',
  '[&_table]:my-2', '[&_table]:w-full', '[&_table]:border-collapse',
  '[&_th]:border', '[&_th]:border-border', '[&_th]:px-2', '[&_th]:py-1',
  '[&_th]:text-left', '[&_th]:text-[10px]', '[&_th]:uppercase', '[&_th]:tracking-wider',
  '[&_th]:text-muted-foreground',
  '[&_td]:border', '[&_td]:border-border', '[&_td]:px-2', '[&_td]:py-1',
  '[&_tr:nth-child(even)]:bg-surface-secondary/40',
].join(' ')

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className={MD_CLASSES}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  )
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
  const [hasSentCustom, setHasSentCustom] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLInputElement>(null)

  const [useCase, setUseCase] = useState('')
  const [evalResult, setEvalResult] = useState<string | null>(null)
  const [evalError, setEvalError] = useState('')

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, thinking])

  const buildContext = useCallback((r: RepoInfo): string => {
    const fileList = r.fileTree.slice(0, 100).join('\n')
    return (
      'Repository: ' + r.name + '\n' +
      'Description: ' + r.description + '\n' +
      'Language: ' + r.language + '\n' +
      'Stars: ' + r.stars + '\n\n' +
      'File structure (first 100 files):\n' + fileList + '\n\n' +
      'README:\n' + r.readme
    )
  }, [])

  const sendMessage = useCallback(async (text: string) => {
    if (!repo) return
    setMessages((prev) => [...prev, { role: 'user', text }])
    setChatInput('')
    setThinking(true)
    try {
      const context = buildContext(repo)
      const system = 'You are a code assistant helping analyze a GitHub repository. Here is the repo context:\n\n' + context
      const res = await fetch('/api/automations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, prompt: text }),
      })
      const data = await res.json()
      if (data.error) {
        setMessages((prev) => [...prev, { role: 'assistant', text: 'Error: ' + data.error }])
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: data.text ?? 'No response.' }])
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      console.error('repo chat failed:', detail)
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', text: 'Chat failed: ' + detail + '. Check your network and try again.' },
      ])
    } finally {
      setThinking(false)
    }
  }, [repo, buildContext])

  const handleFetch = useCallback(async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setFetching(true)
    setFetchError('')
    setRepo(null)
    setMessages([])
    setHasSentCustom(false)
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
      setTimeout(() => chatInputRef.current?.focus(), 100)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch repo')
    } finally {
      setFetching(false)
    }
  }, [url, onSave])

  const handleChat = useCallback(async () => {
    if (!chatInput.trim() || !repo) return
    setHasSentCustom(true)
    await sendMessage(chatInput.trim())
  }, [chatInput, repo, sendMessage])

  const handlePromptClick = useCallback(async (prompt: string) => {
    setHasSentCustom(true)
    await sendMessage(prompt)
  }, [sendMessage])

  const handleEvaluate = useCallback(async () => {
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
      setEvalError('Analysis failed: ' + detail)
    } finally {
      setThinking(false)
    }
  }, [useCase, repo])

  const showPromptChips = repo && repoMode === 'chat' && messages.length === 0 && !thinking && !hasSentCustom

  const icon = <GitBranch className="h-4 w-4 text-primary" />

  const body = (
    <div className="space-y-3 sm:space-y-4">
      {/* URL input row */}
      <div className="flex gap-1.5 sm:gap-2">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
          placeholder="https://github.com/owner/repo"
          className="flex-1 rounded border border-border bg-surface-elevated px-2.5 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          onClick={handleFetch}
          disabled={fetching || !url.trim()}
          className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-2.5 py-2 text-xs font-medium text-primary transition-all hover:bg-primary/20 active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100"
        >
          {fetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
          <span className="hidden sm:inline">Fetch</span>
        </button>
        {repo && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={() => {
              setRepo(null)
              setMessages([])
              setHasSentCustom(false)
              setEvalResult(null)
              setEvalError('')
            }}
            className="rounded p-2 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </motion.button>
        )}
      </div>

      {fetchError && (
        <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="text-xs text-destructive">
          {fetchError}
        </motion.p>
      )}

      {repo && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
          {/* Repo card */}
          <div className="rounded-lg border border-primary/20 bg-primary/[0.04] p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-semibold text-foreground">{repo.name}</p>
                {repo.description && (
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{repo.description}</p>
                )}
              </div>
              <div className="flex flex-shrink-0 flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Star className="h-3 w-3" />{repo.stars}</span>
                {repo.language && <span className="flex items-center gap-1"><Code2 className="h-3 w-3" />{repo.language}</span>}
                <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{repo.fileTree.length}</span>
              </div>
            </div>
            {repo.topics.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">
                {repo.topics.slice(0, 6).map((t) => (
                  <span key={t} className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                    {t}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Mode toggle */}
          <div className="flex gap-1 rounded-lg border border-border bg-surface-elevated p-0.5">
            <button
              onClick={() => setRepoMode('chat')}
              className={
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ' +
                (repoMode === 'chat' ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground')
              }
            >
              <MessageSquare className="h-3 w-3" />
              Chat
            </button>
            <button
              onClick={() => setRepoMode('evaluate')}
              className={
                'flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-all ' +
                (repoMode === 'evaluate' ? 'bg-primary/10 text-primary shadow-sm' : 'text-muted-foreground hover:bg-surface-secondary hover:text-foreground')
              }
            >
              <CheckCircle className="h-3 w-3" />
              Can I use this?
            </button>
          </div>

          {/* Chat Mode */}
          {repoMode === 'chat' && (
            <div className="space-y-3">
              {/* Messages area */}
              <div className="max-h-64 space-y-2 overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                <AnimatePresence initial={false}>
                  {messages.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: 'easeOut' }}
                      className={
                        'rounded-lg border px-3 py-2 text-xs leading-relaxed ' +
                        (msg.role === 'user' ? 'border-primary/20 bg-primary/[0.04]' : 'border-border bg-surface-elevated')
                      }
                    >
                      <span className="mb-1 block font-mono text-[9px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {msg.role === 'user' ? 'You' : 'Enry'}
                      </span>
                      {msg.role === 'assistant' ? (
                        <MarkdownContent content={msg.text} />
                      ) : (
                        <p className="text-foreground/90">{msg.text}</p>
                      )}
                    </motion.div>
                  ))}
                </AnimatePresence>

                {thinking && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center gap-2 rounded-lg border border-border bg-surface-elevated px-3 py-2.5"
                  >
                    <div className="flex gap-1">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: '0ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: '150ms' }} />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-primary/60" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-[11px] text-muted-foreground">Thinking...</span>
                  </motion.div>
                )}

                {/* Prompt chips */}
                {showPromptChips && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15, duration: 0.3 }}
                    className="space-y-1.5 pt-1"
                  >
                    <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">
                      Suggested
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_PROMPTS.map((p, i) => {
                        const Icon = p.icon
                        return (
                          <motion.button
                            key={p.label}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.2 + i * 0.08, duration: 0.25 }}
                            onClick={() => handlePromptClick(p.text)}
                            className="group flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/[0.03] px-3 py-1.5 text-[11px] font-medium text-foreground/80 transition-all hover:border-primary/40 hover:bg-primary/[0.07] hover:text-foreground active:scale-[0.97]"
                          >
                            <Icon className="h-3 w-3 text-primary/60 transition-colors group-hover:text-primary/80" />
                            <span>{p.label}</span>
                          </motion.button>
                        )
                      })}
                    </div>
                  </motion.div>
                )}

                {messages.length === 0 && !thinking && !showPromptChips && (
                  <p className="py-3 text-center text-xs text-muted-foreground">
                    Ask anything about this repo &mdash; architecture, how to contribute, what it does, etc.
                  </p>
                )}

                <div ref={messagesEndRef} />
              </div>

              {/* Input bar */}
              <div className="flex gap-2">
                <input
                  ref={chatInputRef}
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleChat()
                    }
                  }}
                  disabled={thinking}
                  placeholder={messages.length === 0 ? 'Ask something about the codebase...' : 'Follow up...'}
                  className="flex-1 rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
                />
                <button
                  onClick={handleChat}
                  disabled={!chatInput.trim() || thinking}
                  className="flex items-center justify-center rounded-lg border border-primary/40 bg-primary/10 p-2 text-primary transition-all hover:bg-primary/20 active:scale-[0.93] disabled:opacity-40 disabled:active:scale-100"
                >
                  {thinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Evaluate Mode */}
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
                  className="flex-1 resize-none rounded-lg border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 transition-colors focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
                />
                <button
                  onClick={handleEvaluate}
                  disabled={!useCase.trim() || thinking}
                  className="flex-shrink-0 self-end rounded-lg border border-primary/40 bg-primary/10 p-2 text-primary transition-all hover:bg-primary/20 active:scale-[0.93] disabled:opacity-40 disabled:active:scale-100"
                >
                  {thinking ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </button>
              </div>

              {thinking && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-2 py-2 text-xs text-muted-foreground"
                >
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Analyzing repo against your use case...
                </motion.div>
              )}

              {evalError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground"
                >
                  {evalError}
                </motion.div>
              )}

              {evalResult && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-lg border border-border bg-surface-elevated p-3 text-xs text-foreground"
                >
                  <MarkdownContent content={evalResult} />
                </motion.div>
              )}

              {!evalResult && !thinking && !evalError && (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  Describe what you&apos;re building and I&apos;ll tell you if this repo fits, how to integrate it, and how to set it up.
                </p>
              )}
            </div>
          )}
        </motion.div>
      )}

      {!repo && !fetching && !fetchError && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="py-6 text-center text-xs text-muted-foreground"
        >
          Enter a GitHub repo URL above to get started.
        </motion.p>
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
