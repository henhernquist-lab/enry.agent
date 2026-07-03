'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus,
  Loader2,
  AlertTriangle,
  ChevronLeft,
  ExternalLink,
  Circle,
  CheckCircle2,
} from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'

interface Repo {
  id: number
  name: string
  full_name: string
  description: string | null
  html_url: string
  private: boolean
  stargazers_count: number
  open_issues_count: number
  language: string | null
  updated_at: string
}

interface Issue {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  html_url: string
  created_at: string
  user: { login: string } | null
  labels: { name: string; color: string }[]
}

type View = 'repos' | 'issues'

export function GitHubTool({ onClose }: { onClose: () => void }) {
  const [connected, setConnected] = useState<boolean | null>(null)
  const [repos, setRepos] = useState<Repo[]>([])
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState(false)

  const [view, setView] = useState<View>('repos')
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [issues, setIssues] = useState<Issue[]>([])
  const [issuesLoading, setIssuesLoading] = useState(false)

  const [showNewIssue, setShowNewIssue] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newBody, setNewBody] = useState('')
  const [creating, setCreating] = useState(false)

  // Check connection and load repos
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/api/github/repos')
        if (res.status === 401 || res.status === 403) {
          setAuthError(true)
          setConnected(false)
          setLoading(false)
          return
        }
        if (!res.ok) throw new Error('Failed to load repos')
        const data = await res.json()
        setRepos(data.repos ?? [])
        setConnected(true)
      } catch {
        setConnected(false)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const loadIssues = async (repo: Repo) => {
    setSelectedRepo(repo)
    setIssuesLoading(true)
    setShowNewIssue(false)
    setNewTitle('')
    setNewBody('')
    try {
      const res = await fetch(`/api/github/issues?repo=${encodeURIComponent(repo.full_name)}`)
      if (res.status === 401 || res.status === 403) {
        setAuthError(true)
        return
      }
      if (!res.ok) throw new Error('Failed to load issues')
      const data = await res.json()
      setIssues(data.issues ?? [])
      setView('issues')
    } catch {
      console.error('load issues failed')
    } finally {
      setIssuesLoading(false)
    }
  }

  const handleCreateIssue = async () => {
    if (!selectedRepo || !newTitle.trim()) return
    setCreating(true)
    try {
      await fetch('/api/github/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: selectedRepo.full_name,
          title: newTitle.trim(),
          body: newBody.trim() || undefined,
        }),
      })
      setNewTitle('')
      setNewBody('')
      setShowNewIssue(false)
      await loadIssues(selectedRepo)
    } catch {
      console.error('create issue failed')
    } finally {
      setCreating(false)
    }
  }

  const goBackToRepos = () => {
    setView('repos')
    setSelectedRepo(null)
    setIssues([])
    setShowNewIssue(false)
  }

  return (
    <ModalShell
      title="GitHub"
      subtitle="Repos, issues, and project management"
      icon={<svg viewBox="0 0 24 24" className="h-4 w-4 text-primary" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>}
      onClose={onClose}
      width="w-[580px]"
    >
      {loading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : authError ? (
        <div className="flex items-center gap-3 rounded border border-warning/30 bg-warning/10 p-4">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-warning" />
          <p className="text-xs text-warning">
            GitHub connection expired — please{' '}
            <a href="/api/auth/signin/github" className="underline hover:text-warning/80">
              reconnect
            </a>
          </p>
        </div>
      ) : !connected ? (
        <div className="flex flex-col items-center gap-4 py-10 text-center">
          <svg viewBox="0 0 24 24" className="h-8 w-8 text-muted-foreground/40" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
          <div>
            <p className="text-sm text-foreground">Connect your GitHub account to use this tool</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Grant access to your repos and issues
            </p>
          </div>
          <a
            href="/api/auth/signin/github"
            className="flex items-center gap-2 rounded border border-primary/40 bg-primary/10 px-4 py-2 text-xs font-medium text-primary hover:bg-primary/20"
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" /></svg>
            Sign in with GitHub
          </a>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Back button + breadcrumb when viewing issues */}
          {view === 'issues' && selectedRepo && (
            <button
              onClick={goBackToRepos}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span>All repos</span>
              <span className="text-muted-foreground/50">/</span>
              <span className="font-mono text-foreground">{selectedRepo.name}</span>
            </button>
          )}

          {/* Repos view */}
          <AnimatePresence mode="wait">
            {view === 'repos' && (
              <motion.div
                key="repos"
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="space-y-1.5"
              >
                {repos.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    No repositories found.
                  </p>
                ) : (
                  repos.map((repo) => (
                    <button
                      key={repo.id}
                      onClick={() => loadIssues(repo)}
                      className="group flex w-full items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-3 py-2 text-left transition-colors hover:border-primary/30 hover:bg-surface-elevated"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-mono text-xs font-semibold text-foreground">
                          {repo.name}
                        </p>
                        {repo.description && (
                          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                            {repo.description}
                          </p>
                        )}
                      </div>
                      <div className="ml-2 flex flex-shrink-0 items-center gap-3 text-[10px] text-muted-foreground">
                        {repo.language && <span>{repo.language}</span>}
                        {repo.stargazers_count > 0 && (
                          <span>★ {repo.stargazers_count}</span>
                        )}
                        {repo.open_issues_count > 0 && (
                          <span className="flex items-center gap-1">
                            <Circle className="h-2 w-2" />
                            {repo.open_issues_count}
                          </span>
                        )}
                        {repo.private && (
                          <span className="rounded border border-border px-1 py-0.5 text-[9px]">
                            private
                          </span>
                        )}
                        <ExternalLink className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-100" />
                      </div>
                    </button>
                  ))
                )}
              </motion.div>
            )}

            {/* Issues view */}
            {view === 'issues' && selectedRepo && (
              <motion.div
                key="issues"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 8 }}
                className="space-y-2"
              >
                {/* New issue button / form */}
                {!showNewIssue ? (
                  <button
                    onClick={() => setShowNewIssue(true)}
                    className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-border py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
                  >
                    <Plus className="h-3 w-3" />
                    New Issue
                  </button>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-2 rounded border border-primary/20 bg-surface-elevated p-3"
                  >
                    <input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Issue title"
                      className="w-full rounded border border-border bg-surface-base px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                    />
                    <textarea
                      value={newBody}
                      onChange={(e) => setNewBody(e.target.value)}
                      placeholder="Description (optional)"
                      rows={3}
                      className="w-full resize-none rounded border border-border bg-surface-base px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setShowNewIssue(false)
                          setNewTitle('')
                          setNewBody('')
                        }}
                        className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCreateIssue}
                        disabled={!newTitle.trim() || creating}
                        className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
                      >
                        {creating && <Loader2 className="h-3 w-3 animate-spin" />}
                        Create issue
                      </button>
                    </div>
                  </motion.div>
                )}

                {/* Issues list */}
                {issuesLoading ? (
                  <div className="flex justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  </div>
                ) : issues.length === 0 ? (
                  <div className="py-8 text-center">
                    <CheckCircle2 className="mx-auto mb-2 h-5 w-5 text-primary/40" />
                    <p className="text-xs text-muted-foreground">No open issues</p>
                    <p className="mt-1 text-[11px] text-muted-foreground/60">
                      This repo is issue-free.
                    </p>
                  </div>
                ) : (
                  <div className="max-h-80 space-y-1 overflow-y-auto scrollbar-hidden">
                    {issues.map((issue) => (
                      <a
                        key={issue.id}
                        href={issue.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-2.5 rounded border border-border/50 bg-surface-elevated/50 px-3 py-2 transition-colors hover:border-primary/30 hover:bg-surface-elevated"
                      >
                        <Circle className="mt-0.5 h-3 w-3 flex-shrink-0 text-primary" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs text-foreground">
                            <span className="font-mono text-muted-foreground">#{issue.number}</span>{' '}
                            {issue.title}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                            {issue.user && <span>{issue.user.login}</span>}
                            {issue.labels.slice(0, 3).map((label) => (
                              <span
                                key={label.name}
                                className="rounded border border-border px-1 py-0.5"
                                style={{ borderColor: `#${label.color}40` }}
                              >
                                {label.name}
                              </span>
                            ))}
                          </div>
                        </div>
                        <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0 opacity-0 transition-opacity group-hover:opacity-100 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </ModalShell>
  )
}
