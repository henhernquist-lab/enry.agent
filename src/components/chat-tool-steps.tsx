'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import type { ComponentType } from 'react'
import type { UIMessage } from 'ai'
import { isToolUIPart, getToolName } from 'ai'
import {
  Search, Globe, Waypoints, FlaskConical, TrendingUp, Send, Save, Brain,
  FileText, BookOpen, Library, ScanSearch, Flag, GitBranch, FileCode,
  Pencil, GitPullRequest, Mail, Wrench, Check, XCircle, Loader2, ChevronRight,
} from 'lucide-react'

// Live, human-readable progress steps for the chat's tool calls — replaces
// the (previously invisible) AI-SDK tool parts that getTextContent dropped on
// the floor. The model runs web_search / github_* / composio tools; this turns
// each into a clean labeled step that shows active while running and settles
// to done/failed, with the raw input+output tucked behind a click.
//
// No polling and no new state to sync: useChat re-renders the message as its
// tool parts advance through the AI SDK states (input-streaming ->
// input-available -> output-available/output-error), so a step goes from
// spinner to check on its own as the stream lands.

type IconType = ComponentType<{ className?: string }>

interface ToolMeta {
  icon: IconType
  /** Present-tense action; the status glyph conveys running/done/failed. */
  label: string
}

// Keyed by the tool name the AI SDK reports (getToolName). Native tools come
// from src/app/api/chat/route.ts; the rest are Composio toolKeys from
// src/lib/composio-tools.ts. Anything unmapped falls back to a generic wrench.
const TOOL_META: Record<string, ToolMeta> = {
  // Native
  web_search:                 { icon: Search,         label: 'Searching the web' },
  save_memory:                { icon: Save,           label: 'Saving to memory' },
  recall_memory:              { icon: Brain,          label: 'Recalling memory' },
  github_list_repos:          { icon: Library,        label: 'Listing repositories' },
  github_read_file:           { icon: FileText,       label: 'Reading file' },
  github_read_enryrules:      { icon: BookOpen,       label: 'Reading .enryrules' },
  github_list_issues:         { icon: ScanSearch,     label: 'Listing issues' },
  github_create_issue:        { icon: Flag,           label: 'Creating issue' },
  github_create_branch:       { icon: GitBranch,      label: 'Creating branch' },
  github_create_file:         { icon: FileCode,       label: 'Creating file' },
  github_update_file:         { icon: Pencil,         label: 'Editing file' },
  github_create_pull_request: { icon: GitPullRequest, label: 'Opening pull request' },
  github_create_repo:         { icon: Library,        label: 'Creating repository' },
  // Composio — search / scrape
  composio_web_search:        { icon: Search,         label: 'Searching the web' },
  composio_fetch_url:         { icon: Globe,          label: 'Fetching URL' },
  composio_finance:           { icon: TrendingUp,     label: 'Checking finance' },
  composio_flights:           { icon: Send,           label: 'Searching flights' },
  composio_amazon:            { icon: Search,         label: 'Searching Amazon' },
  firecrawl_scrape:           { icon: Globe,          label: 'Scraping page' },
  firecrawl_crawl:            { icon: Waypoints,      label: 'Crawling site' },
  firecrawl_extract:          { icon: FlaskConical,   label: 'Extracting data' },
  firecrawl_search:           { icon: Search,         label: 'Searching' },
  firecrawl_map:              { icon: Waypoints,      label: 'Mapping site' },
  // Composio — Gmail
  gmail_fetch_emails:         { icon: Mail,           label: 'Fetching emails' },
  gmail_get_message:          { icon: Mail,           label: 'Reading email' },
  gmail_search_emails:        { icon: Mail,           label: 'Searching emails' },
}

function metaFor(name: string): ToolMeta {
  return TOOL_META[name] ?? { icon: Wrench, label: name.replace(/_/g, ' ') }
}

// A short, human detail pulled from the tool's input — the query, the file
// path, the URL — so a step reads "Reading file · src/lib/nim.ts" rather than
// just "Reading file". Best-effort across the common arg shapes; empty is fine.
function detailFrom(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const o = input as Record<string, unknown>
  const str = (v: unknown) => (typeof v === 'string' ? v : '')
  const path = str(o.path)
  const repo = [str(o.owner), str(o.repo)].filter(Boolean).join('/')
  const candidate =
    str(o.query) ||
    str(o.url) ||
    (path ? (repo ? `${repo}:${path}` : path) : '') ||
    repo ||
    str(o.branch_name) ||
    str(o.title) ||
    str(o.name) ||
    str(o.content)
  return candidate.length > 80 ? candidate.slice(0, 80) + '…' : candidate
}

// A tool part is "done but failed" either at the SDK level (output-error) or
// at the app level (our tools return { success: false, error } as output).
function isFailedOutput(output: unknown): boolean {
  return Boolean(output && typeof output === 'object' && (output as Record<string, unknown>).success === false)
}

type ToolState = 'running' | 'done' | 'error'

interface StepView {
  key: string
  name: string
  state: ToolState
  detail: string
  raw: { input: unknown; output: unknown; errorText?: string }
}

export function ChatToolSteps({ parts }: { parts: UIMessage['parts'] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const steps: StepView[] = []
  for (const part of parts) {
    if (!isToolUIPart(part)) continue
    const p = part as unknown as {
      toolCallId: string
      state: string
      input?: unknown
      output?: unknown
      errorText?: string
    }
    const name = getToolName(part)
    let state: ToolState
    if (p.state === 'output-error') state = 'error'
    else if (p.state === 'output-available') state = isFailedOutput(p.output) ? 'error' : 'done'
    else state = 'running' // input-streaming | input-available
    steps.push({
      key: p.toolCallId,
      name,
      state,
      detail: detailFrom(p.input),
      raw: { input: p.input, output: p.output, errorText: p.errorText },
    })
  }

  if (steps.length === 0) return null

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  return (
    <div className="mb-2 overflow-hidden rounded border border-border bg-surface-secondary/40">
      {steps.map((step) => {
        const meta = metaFor(step.name)
        const ToolIcon = meta.icon
        const isOpen = expanded.has(step.key)
        return (
          <motion.div
            key={step.key}
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.15 }}
            className="border-b border-border/40 last:border-b-0"
          >
            <button
              onClick={() => toggle(step.key)}
              className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-elevated/40"
            >
              {/* Status glyph — running spins, done checks, error crosses. */}
              <span className="flex-shrink-0">
                {step.state === 'running' ? (
                  <Loader2 className="h-3 w-3 animate-spin text-primary" />
                ) : step.state === 'error' ? (
                  <XCircle className="h-3 w-3 text-destructive" />
                ) : (
                  <Check className="h-3 w-3 text-primary" />
                )}
              </span>
              <ToolIcon className={`h-3 w-3 flex-shrink-0 ${step.state === 'running' ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className={`flex-shrink-0 font-mono text-[11px] ${step.state === 'running' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {meta.label}
              </span>
              {step.detail && (
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-muted-foreground/60">
                  · {step.detail}
                </span>
              )}
              <ChevronRight
                className={`ml-auto h-3 w-3 flex-shrink-0 text-muted-foreground/40 transition-transform ${isOpen ? 'rotate-90' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="space-y-2 border-t border-border/40 bg-surface-base px-3 py-2">
                <RawBlock title="input" value={step.raw.input} />
                {step.raw.errorText ? (
                  <RawBlock title="error" value={step.raw.errorText} />
                ) : (
                  step.raw.output !== undefined && <RawBlock title="output" value={step.raw.output} />
                )}
              </div>
            )}
          </motion.div>
        )
      })}
    </div>
  )
}

function RawBlock({ title, value }: { title: string; value: unknown }) {
  const text = typeof value === 'string' ? value : safeStringify(value)
  return (
    <div>
      <div className="mb-0.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">{title}</div>
      <pre className="max-h-48 overflow-auto scrollbar-hidden whitespace-pre-wrap break-words rounded bg-surface-elevated px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground/80">
        {text.length > 4000 ? text.slice(0, 4000) + '\n…truncated' : text}
      </pre>
    </div>
  )
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}
