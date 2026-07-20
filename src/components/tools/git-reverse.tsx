'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { GitBranch, Loader2, Star, Code2, FileText, X, Copy, Check, Zap } from 'lucide-react'
import { ToolPanel } from '@/components/tools/tool-panel'

interface RepoInfo {
  name: string
  description: string
  stars: number
  language: string
  topics: string[]
  readme: string
  fileTree: string[]
}

interface GitReverseProps {
  onClose: () => void
  mode?: 'modal' | 'page'
}

export function GitReverse({ onClose, mode = 'modal' }: GitReverseProps) {
  const [url, setUrl] = useState('')
  const [repo, setRepo] = useState<RepoInfo | null>(null)
  const [fetching, setFetching] = useState(false)
  const [fetchError, setFetchError] = useState('')
  const [generating, setGenerating] = useState(false)
  const [prompt, setPrompt] = useState<string | null>(null)
  const [genError, setGenError] = useState('')
  const [copied, setCopied] = useState(false)

  const handleFetch = async () => {
    const trimmed = url.trim()
    if (!trimmed) return
    setFetching(true)
    setFetchError('')
    setRepo(null)
    setPrompt(null)
    setGenError('')
    try {
      const res = await fetch('/api/tools/fetch-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      })
      const data = await res.json()
      if (data.error) throw new Error(data.error)
      setRepo(data)
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : 'Failed to fetch repo')
    } finally {
      setFetching(false)
    }
  }

  const handleGenerate = async () => {
    if (!repo) return
    setGenerating(true)
    setGenError('')
    setPrompt(null)
    try {
      const res = await fetch('/api/tools/git-reverse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repo }),
      })
      const data = await res.json()
      if (data.error) {
        setGenError(data.error)
      } else {
        setPrompt(data.prompt)
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err)
      setGenError(`Generation failed: ${detail}`)
    } finally {
      setGenerating(false)
    }
  }

  const handleCopy = async () => {
    if (!prompt) return
    await navigator.clipboard.writeText(prompt)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const icon = <Zap className="h-4 w-4 text-primary" />

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
          <button onClick={() => { setRepo(null); setPrompt(null); setGenError('') }} className="rounded p-2 text-muted-foreground hover:text-foreground">
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

          <div className="space-y-3">
            {!prompt && !generating && !genError && (
              <div className="flex flex-col items-center gap-3 py-4">
                <p className="text-xs text-muted-foreground text-center">
                  Convert this repo into a plain-language build prompt for a coding agent.
                  Generate once, copy, and hand it to Claude Code or Freebuff to rebuild something similar.
                </p>
                <button
                  onClick={handleGenerate}
                  className="flex items-center gap-1.5 rounded border border-primary/30 bg-primary/5 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
                >
                  <Zap className="h-3.5 w-3.5" />
                  Generate Build Prompt
                </button>
              </div>
            )}

            {generating && (
              <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> reverse-engineering the repo into a build prompt...
              </div>
            )}

            {genError && (
              <div className="rounded border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-foreground">
                {genError}
              </div>
            )}

            {prompt && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Build Prompt — copy and hand to any coding agent
                  </p>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-2 py-1 text-[10px] text-primary hover:bg-primary/10 transition-colors"
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="rounded border border-border bg-surface-elevated p-3 text-xs text-foreground max-h-96 overflow-y-auto scrollbar-hidden">
                  <div className="whitespace-pre-wrap leading-relaxed">{prompt}</div>
                </div>
              </motion.div>
            )}
          </div>
        </>
      )}

      {!repo && !fetching && !fetchError && (
        <p className="py-6 text-center text-xs text-muted-foreground">
          Enter a GitHub repo URL, fetch it, then generate a build prompt that any coding agent can use to rebuild something similar from scratch.
        </p>
      )}
    </div>
  )

  return (
    <ToolPanel
      title="GitReverse"
      subtitle="Convert a GitHub repo into a coding-agent build prompt"
      icon={icon}
      onClose={onClose}
    >
      {body}
    </ToolPanel>
  )
}
