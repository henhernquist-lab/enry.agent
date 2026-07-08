'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ScanSearch, Loader2, RefreshCw, ShieldAlert, AlertTriangle, Info, ExternalLink } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import type { Repo } from '@/lib/github'
import type { RepoReviewPayload, RepoReviewIssue } from '@/lib/resources'

interface RepoReviewerProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

const SEVERITY_ORDER: RepoReviewIssue['severity'][] = ['high', 'medium', 'low']

const SEVERITY_STYLES: Record<RepoReviewIssue['severity'], { badge: string; icon: typeof AlertTriangle }> = {
  high: { badge: 'border-destructive/40 bg-destructive/10 text-destructive', icon: ShieldAlert },
  medium: { badge: 'border-warning/40 bg-warning/10 text-warning', icon: AlertTriangle },
  low: { badge: 'border-border bg-surface-elevated text-muted-foreground', icon: Info },
}

export function RepoReviewer({ onClose, mode = 'modal', onSave }: RepoReviewerProps) {
  const [repos, setRepos] = useState<Repo[]>([])
  const [reposLoading, setReposLoading] = useState(true)
  const [reposError, setReposError] = useState('')

  const [selected, setSelected] = useState('')
  const [branch, setBranch] = useState('')

  const [running, setRunning] = useState(false)
  const [runError, setRunError] = useState('')
  const [result, setResult] = useState<RepoReviewPayload | null>(null)

  useEffect(() => {
    fetch('/api/tools/repo-review')
      .then((r) => r.json())
      .then((data) => {
        if (data.error) { setReposError(data.error); return }
        const list = (data.repos ?? []) as Repo[]
        setRepos(list)
        if (list.length) setSelected(list[0].full_name)
      })
      .catch(() => setReposError('Failed to load repos'))
      .finally(() => setReposLoading(false))
  }, [])

  const selectedRepo = repos.find((r) => r.full_name === selected)

  const runReview = async () => {
    if (!selectedRepo) return
    setRunning(true)
    setRunError('')
    try {
      const [owner, repo] = selectedRepo.full_name.split('/')
      const res = await fetch('/api/tools/repo-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner, repo, branch: branch.trim() || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { setRunError(data.error || 'Review failed'); return }
      setResult(data.resource.payload as RepoReviewPayload)
      onSave?.()
    } catch {
      setRunError('Network error — try again')
    } finally {
      setRunning(false)
    }
  }

  const inputCls = 'w-full rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none'
  const labelCls = 'mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground'

  const icon = <ScanSearch className="h-4 w-4 text-primary" />

  const groupedIssues = SEVERITY_ORDER.map((sev) => ({
    severity: sev,
    items: (result?.issues ?? []).filter((i) => i.severity === sev),
  })).filter((g) => g.items.length > 0)

  const body = (
    <div className="space-y-4">
      {reposError ? (
        <div className="flex items-start gap-2 rounded border border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
          {reposError}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Repository</label>
              {reposLoading ? (
                <div className="flex items-center gap-2 py-1.5">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="font-mono text-xs text-muted-foreground">Loading repos…</span>
                </div>
              ) : (
                <select value={selected} onChange={(e) => { setSelected(e.target.value); setResult(null); setRunError('') }} className={inputCls}>
                  {repos.map((r) => (
                    <option key={r.id} value={r.full_name}>{r.full_name}{r.private ? ' 🔒' : ''}</option>
                  ))}
                </select>
              )}
            </div>
            <div>
              <label className={labelCls}>Branch (optional)</label>
              <input
                type="text"
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                placeholder={selectedRepo?.default_branch || 'default'}
                className={inputCls}
              />
            </div>
          </div>

          {runError && <p className="text-xs text-destructive">{runError}</p>}

          <button
            onClick={runReview}
            disabled={running || !selectedRepo}
            className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
          >
            {running
              ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reviewing…</>
              : result ? <><RefreshCw className="h-3.5 w-3.5" /> Re-review</> : 'Run Review'}
          </button>
        </>
      )}

      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between">
              <a
                href={result.repo_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
              >
                {result.repo_full_name} <ExternalLink className="h-3 w-3" />
              </a>
              <span className="font-mono text-[10px] text-muted-foreground">{result.branch}</span>
            </div>

            {result.partial_sample && (
              <p className="font-mono text-[10px] text-muted-foreground">
                Partial sample — reviewed {result.files_analyzed.length} file{result.files_analyzed.length !== 1 ? 's' : ''}, selected by priority.
              </p>
            )}

            <p className="text-xs leading-relaxed text-foreground">{result.overview}</p>

            {result.strengths.length > 0 && (
              <div>
                <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Strengths</p>
                <ul className="space-y-1">
                  {result.strengths.map((s, i) => (
                    <li key={i} className="text-xs text-muted-foreground">• {s}</li>
                  ))}
                </ul>
              </div>
            )}

            {groupedIssues.length > 0 && (
              <div className="space-y-3">
                <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Issues</p>
                {groupedIssues.map((group) => {
                  const style = SEVERITY_STYLES[group.severity]
                  const Icon = style.icon
                  return (
                    <div key={group.severity} className="space-y-1.5">
                      {group.items.map((issue, i) => (
                        <div key={i} className="rounded border border-border bg-surface-elevated/60 p-2.5 text-xs">
                          <div className="mb-1 flex flex-wrap items-center gap-1.5">
                            <span className={`flex items-center gap-1 rounded border px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider ${style.badge}`}>
                              <Icon className="h-2.5 w-2.5" />{group.severity}
                            </span>
                            <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{issue.category}</span>
                            <span className="font-mono text-[10px] text-muted-foreground">{issue.file}</span>
                          </div>
                          <p className="text-foreground">{issue.description}</p>
                          <p className="mt-1 text-muted-foreground">→ {issue.suggestion}</p>
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}

            {result.refactor_priorities.length > 0 && (
              <div>
                <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Do these first</p>
                <ol className="space-y-1">
                  {result.refactor_priorities.map((r, i) => (
                    <li key={i} className="flex gap-2 text-xs text-foreground">
                      <span className="flex-shrink-0 font-mono text-[10px] text-primary">{i + 1}.</span>{r}
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel title="Repo Reviewer" subtitle="AI code review for your GitHub repos" icon={icon} onClose={onClose}>
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell title="Repo Reviewer" subtitle="AI code review for your GitHub repos" icon={icon} onClose={onClose} width="w-[560px]">
      {body}
    </ModalShell>
  )
}
