'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
  ArrowLeft, ChevronDown, ChevronRight, Check, X, Send, Loader2,
  GitBranch, Folder, File, Lock, Sliders, Zap, TerminalSquare, Eye, Play,
  Car, Radar, Swords,
} from 'lucide-react'
import { CruisePanel } from '@/components/agent/cruise-panel'
import { SKILLS as ALL_SKILLS, detectSkillInvocation, detectSkillInvocations, buildMultiSkillPrompt } from '@/lib/skills/registry'

// ─── Types ──────────────────────────────────────────────────

interface RepoOption {
  full_name: string
  default_branch: string
  private: boolean
}

type ChatLine =
  | { kind: 'prompt'; text: string }
  | { kind: 'system'; text: string }
  | { kind: 'thinking'; text: string }
  | { kind: 'plan'; text: string; targetFile: string; isNewFile: boolean } // manual mode plan
  | { kind: 'proposal'; file: string; diff: string; isNewFile: boolean }
  | { kind: 'applied'; text: string }
  | { kind: 'committed'; text: string }
  | { kind: 'pr'; text: string }
  | { kind: 'error'; text: string }
  | { kind: 'filePreview'; path: string; content: string }
  | { kind: 'question'; questionText: string; options: string[] }

type Mode = 'auto' | 'manual'

// ─── Model & effort definitions ─────────────────────────────

const MODELS = [
  { id: 'deepseek-ai/deepseek-v4-pro',          label: 'DeepSeek V4 Pro', desc: 'Strongest free model. Best for complex tasks.' },
  { id: 'minimax/minimax-m3',                    label: 'MiniMax M3',      desc: 'Fast and capable. Great for general tasks.' },
  { id: 'qwen/qwen3.5-122b-a10b',                label: 'Qwen 3.5 122B',   desc: 'Large reasoning model. Great for analysis.' },
  { id: 'z-ai/glm-5.2',                          label: 'GLM 5.2',         desc: 'Versatile all-rounder. Good at following instructions.' },
  { id: 'nvidia/nemotron-3-ultra-550b-a55b',     label: 'Nemotron 3 Ultra', desc: 'NVIDIA flagship. 550B MoE, best for high-stakes generation.' },
] as const

// Drive skills (coding-focused) — pulled from the shared registry.
const DRIVE_SKILL_SLUGS = [
  // Original 7
  'cartographer', 'ghost-hunter', 'bisector', 'build-vs-buy-vs-skip',
  'estimator', 'scope-cutter', 'failure-mode-mapper',
  // Ported from homepage (5)
  'drive-devil-advocate', 'drive-assumption-excavator', 'drive-pre-mortem',
  'drive-interrogator', 'drive-eli-expert',
  // New coding skills (6)
  'code-reviewer', 'code-council', 'simplifier', 'architect',
  'rubber-duck', 'explainer',
  // Execution booster skills (8)
  'show-your-work', 'test-first', 'slow-down', 'prove-it-works',
  'first-principles', 'adversarial-coding', 'two-model-consensus',
  'codebase-grounded',
]
const DRIVE_SKILLS = ALL_SKILLS.filter((s) => DRIVE_SKILL_SLUGS.includes(s.slug))

const EFFORTS = [
  { id: 'none' as const,    label: 'Auto',     desc: 'Default reasoning' },
  { id: 'low' as const,     label: 'Quick',    desc: 'Minimal reasoning, fast' },
  { id: 'medium' as const,  label: 'Balanced', desc: 'Moderate reasoning depth' },
  { id: 'high' as const,    label: 'Deep',     desc: 'Maximum reasoning, slower' },
  { id: 'deep' as const,    label: 'Extended', desc: 'Full codebase context, multi-step plan, thorough review' },
]

// Per-model default effort levels for the coding agent.
// Nemotron is new and unproven on this codebase — start at 'medium' so we
// get reasonable reasoning without the deepest/slowest mode until we have
// real testing data.
const MODEL_DEFAULTS: Record<string, EffortId> = {
  'deepseek-ai/deepseek-v4-pro':      'none',
  'z-ai/glm-5.2':                    'medium',
  'qwen/qwen3.5-122b-a10b':           'low',
  'minimax/minimax-m3':               'none',
  'nvidia/nemotron-3-ultra-550b-a55b': 'medium',
}

type EffortId = typeof EFFORTS[number]['id']

// ─── File tree helpers ──────────────────────────────────────

interface TreeNode {
  name: string
  isDir: boolean
  children: TreeNode[]
  path: string
}

function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode[] = []
  for (const p of paths) {
    const parts = p.split('/')
    let level = root
    for (let i = 0; i < parts.length; i++) {
      const isLast = i === parts.length - 1
      const name = parts[i]
      let node = level.find((n) => n.name === name)
      if (!node) {
        node = { name, isDir: !isLast, children: [], path: parts.slice(0, i + 1).join('/') }
        level.push(node)
      }
      level = node.children
    }
  }
  // Sort: directories first, then alphabetically
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
      return a.name.localeCompare(b.name)
    })
    for (const n of nodes) if (n.isDir) sort(n.children)
  }
  sort(root)
  return root
}

// ─── Diff block ─────────────────────────────────────────────

function DiffBlock({ diffText }: { diffText: string }) {
  const lines = diffText.split('\n')
  const fileLine = lines.find((l) => l.startsWith('+++ ') || l.startsWith('--- '))
  const fileName = fileLine
    ? fileLine.replace(/^(\+\+\+ |--- )/, '').replace(/^[ab]\//, '')
    : null

  let adds = 0
  let dels = 0
  for (const l of lines) {
    if (l.startsWith('+') && !l.startsWith('+++')) adds++
    else if (l.startsWith('-') && !l.startsWith('---')) dels++
  }

  return (
    <div className="overflow-hidden rounded-md border border-border">
      {fileName && (
        <div className="flex items-center justify-between border-b border-border bg-surface-secondary px-3 py-1.5">
          <span className="font-mono text-[11px] text-foreground">{fileName}</span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            <span className="text-primary">+{adds}</span>
            {' '}
            <span className="text-destructive">{'\u2212'}{dels}</span>
          </span>
        </div>
      )}
      <div className="overflow-x-auto bg-[#080808] text-[12px] leading-[1.6]">
        {lines.map((line, i) => {
          let bg = ''
          let fg = 'text-muted-foreground'
          if (line.startsWith('+++') || line.startsWith('---')) {
            fg = 'text-muted-foreground/50'
          } else if (line.startsWith('@@')) {
            bg = 'bg-accent/5'
            fg = 'text-accent'
          } else if (line.startsWith('+')) {
            bg = 'bg-primary/5'
            fg = 'text-primary'
          } else if (line.startsWith('-')) {
            bg = 'bg-destructive/5'
            fg = 'text-destructive'
          } else {
            fg = 'text-foreground/70'
          }
          return (
            <div key={i} className={`flex ${bg}`}>
              <span className="inline-block w-[44px] flex-shrink-0 select-none border-r border-border/30 px-2 text-right font-mono text-[10px] tabular-nums text-muted-foreground/40">
                {i + 1}
              </span>
              <span className={`whitespace-pre px-3 font-mono ${fg}`}>
                {line || ' '}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Deep reasoning step list ───────────────────────────────

function DeepReasoningIndicator({ running }: { running: boolean }) {
  const steps = ['Reading file', 'Analyzing structure', 'Considering approaches', 'Planning changes', 'Generating diff']
  const [step, setStep] = useState(0)

  useEffect(() => {
    if (!running) { setStep(0); return }
    const i = setInterval(() => setStep((s) => (s + 1) % steps.length), 1800)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running])

  if (!running) return null

  return (
    <div className="mb-4 border-l-2 border-primary/20 pl-4">
      <div className="mb-1 flex items-center gap-2">
        <Loader2 className="h-3 w-3 animate-spin text-primary/40" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-primary/50">Extended reasoning</span>
      </div>
      <div className="space-y-1 mt-2">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center gap-2">
            <span className={`font-mono text-[9px] ${
              i < step ? 'text-primary' : i === step ? 'text-muted-foreground/60' : 'text-muted-foreground/25'
            }`}>
              {i < step ? <Check className="h-2.5 w-2.5 inline" /> : i === step ? '\u25b8' : '\u00b7'}
            </span>
            <span className={`font-mono text-[10px] ${
              i < step ? 'text-primary/60' : i === step ? 'text-muted-foreground' : 'text-muted-foreground/30'
            }`}>
              {s}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Page component ─────────────────────────────────────────

export default function AgentPage() {
  const { status } = useSession()
  const router = useRouter()

  const [repos, setRepos] = useState<RepoOption[]>([])
  const [repo, setRepo] = useState<string>('')
  const [repoMenuOpen, setRepoMenuOpen] = useState(false)
  const [model, setModel] = useState<string>(MODELS[0].id)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [effort, setEffort] = useState<EffortId>(MODEL_DEFAULTS[MODELS[0].id] ?? 'none')
  const [effortMenuOpen, setEffortMenuOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('auto')
  // Top-level mode: Drive (interactive, the existing behavior) vs Cruise
  // (autonomous scan). Distinct from `mode` above, which is Drive's auto/manual.
  const [cruiseMode, setCruiseMode] = useState<'drive' | 'cruise'>('drive')
  const [lines, setLines] = useState<ChatLine[]>([
    { kind: 'system', text: 'coding agent \u2014 select a repository to begin.' },
  ])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [currentBranch, setCurrentBranch] = useState<string | null>(null)
  const [hasPendingDiff, setHasPendingDiff] = useState(false)
  const [thinkingCollapsed, setThinkingCollapsed] = useState(false)

  // File tree state
  const [filePaths, setFilePaths] = useState<string[]>([])
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set())
  const [loadingTree, setLoadingTree] = useState(false)

  // Manual mode plan context
  const [planContext, setPlanContext] = useState<{ targetFile: string; isNewFile: boolean; instruction: string } | null>(null)
  const [activeSkillSlugs, setActiveSkillSlugs] = useState<string[]>([])
  const [skillMenuOpen, setSkillMenuOpen] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const repoMenuRef = useRef<HTMLDivElement>(null)
  const modelMenuRef = useRef<HTMLDivElement>(null)
  const effortMenuRef = useRef<HTMLDivElement>(null)
  const skillMenuRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const tree = useMemo(() => buildTree(filePaths), [filePaths])
  const selectedRepo = repos.find((r) => r.full_name === repo)
  const currentModel = MODELS.find((m) => m.id === model)
  const currentEffort = EFFORTS.find((e) => e.id === effort)
  const activeSkills = DRIVE_SKILLS.filter((s) => activeSkillSlugs.includes(s.slug))
  const activeSkill = activeSkills.length === 1 ? activeSkills[0] : null
  const isDeep = effort === 'deep'

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  // Load repos
  useEffect(() => {
    fetch('/api/terminal/repos')
      .then((r) => r.json())
      .then((d) => {
        const list = (d.repos ?? []) as RepoOption[]
        setRepos(list)
        if (list.length && !repo) setRepo(list[0].full_name)
        if (d.error) setLines((l) => [...l, { kind: 'system', text: `GitHub: ${d.error}` }])
      })
      .catch(() => setLines((l) => [...l, { kind: 'system', text: 'could not load repositories' }]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Load file tree when repo changes
  useEffect(() => {
    if (!repo || !selectedRepo) return
    setLoadingTree(true)
    setFilePaths([])
    setExpandedDirs(new Set())
    fetch('/api/terminal/tree', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, branch: currentBranch ?? selectedRepo.default_branch }),
    })
      .then((r) => r.json())
      .then((d) => {
        setFilePaths(d.paths ?? [])
        setLoadingTree(false)
      })
      .catch(() => setLoadingTree(false))
  }, [repo, selectedRepo, currentBranch])

  // Close menus on outside click
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (repoMenuRef.current && !repoMenuRef.current.contains(e.target as Node)) setRepoMenuOpen(false)
      if (modelMenuRef.current && !modelMenuRef.current.contains(e.target as Node)) setModelMenuOpen(false)
      if (effortMenuRef.current && !effortMenuRef.current.contains(e.target as Node)) setEffortMenuOpen(false)
      if (skillMenuRef.current && !skillMenuRef.current.contains(e.target as Node)) setSkillMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  // Auto-scroll
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [lines])

  const selectRepo = useCallback((full: string) => {
    setRepo(full)
    setSessionId(null)
    setCurrentBranch(null)
    setHasPendingDiff(false)
    setPlanContext(null)
    setRepoMenuOpen(false)
    setLines([{ kind: 'system', text: `selected ${full}. describe what you want to change.` }])
    inputRef.current?.focus()
  }, [])

  const fetchFileContent = useCallback(async (path: string) => {
    // Read the file via the terminal exec endpoint
    const res = await fetch('/api/terminal/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ repo, command: `cat ${path}`, session_id: sessionId }),
    })
    const data = await res.json()
    const content = (data.output ?? '').toString()
    setLines((l) => [...l, { kind: 'filePreview', path, content }])
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [repo, sessionId])

  const exec = useCallback(
    async (command: string, opts?: { proceed?: boolean; targetFile?: string; isNewFile?: boolean; instruction?: string; skillSlug?: string; skillSlugs?: string[] }) => {
      if (!repo) {
        setLines((l) => [...l, { kind: 'system', text: 'select a repository first' }])
        return
      }
      setRunning(true)
      setThinkingCollapsed(false)
      const controller = new AbortController()
      abortRef.current = controller
      try {
        const body: Record<string, unknown> = {
          repo, command, session_id: sessionId, model,
          effort,          // FIX #2: send effort to server
          mode,            // FIX #3: send mode to server
          proceed: opts?.proceed ?? false,
          ...(opts?.skillSlugs && opts.skillSlugs.length > 0 ? { skill_slugs: opts.skillSlugs } : {}),
          ...(opts?.skillSlug && !opts?.skillSlugs ? { skill_slug: opts.skillSlug } : {}),
        }
        if (opts?.targetFile) body.target_file = opts.targetFile
        if (opts?.isNewFile !== undefined) body.is_new_file = opts.isNewFile
        if (opts?.instruction) body.instruction = opts.instruction

        const res = await fetch('/api/terminal/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })
        const data = await res.json()
        if (data.session_id) setSessionId(data.session_id)
        setCurrentBranch(data.current_branch ?? null)
        setHasPendingDiff(!!data.has_pending_diff)

        const text = (data.output ?? data.error ?? '').toString()
        const action = data.action
        const reasoning = data.reasoning as string | undefined

        // Detect clarifying question marker in output
        const clarifyMatch = text.match(/\[CLARIFY\]\s*([\s\S]*?)Options:\s*([\s\S]*)$/i)
        if (clarifyMatch && data.exit_code === 0 && !action) {
          const questionText = clarifyMatch[1].trim()
          const optionsRaw = clarifyMatch[2].trim()
          const options = optionsRaw
            .split(/(?:^|\s*,\s*)[A-Z]\)\s*/)
            .filter(Boolean)
            .map((o: string) => o.trim())
          setLines((l) => [...l, { kind: 'question', questionText, options }])
        } else if (action === 'plan') {
          const fileMatch = text.match(/^([^:]+):/m)
          const file = fileMatch ? fileMatch[1].trim() : 'unknown'
          setLines((l) => [...l, { kind: 'proposal', file, diff: text, isNewFile: text.includes('new file') }])
          setPlanContext(null)
        } else if (action === 'apply' && data.exit_code === 0) {
          setLines((l) => [...l, { kind: 'applied', text: text || 'Changes applied to working copy' }])
        } else if (action === 'commit' && data.exit_code === 0) {
          setLines((l) => [...l, { kind: 'committed', text: text }])
          setHasPendingDiff(false)
        } else if (action === 'pr' && data.exit_code === 0) {
          setLines((l) => [...l, { kind: 'pr', text: text }])
        } else if (data.exit_code !== 0) {
          setLines((l) => [...l, { kind: 'error', text: text || 'command failed' }])
        } else {
          setLines((l) => [...l, { kind: 'system', text: text || '(done)' }])
        }
      } catch (e) {
        if ((e as Error).name === 'AbortError') {
          setLines((l) => [...l, { kind: 'system', text: 'Cancelled' }])
        } else {
          setLines((l) => [...l, { kind: 'error', text: 'Network error \u2014 retry' }])
        }
      } finally {
        setRunning(false)
        abortRef.current = null
      }
    },
    [repo, sessionId, model, effort, mode],
  )

  const handleSend = useCallback(() => {
    const text = input.trim()
    if (!text || running) return

    // Check for natural-language skill triggers BEFORE falling through to
    // the normal code-edit path. This catches phrases like
    // "should I add X" (Build vs Buy vs Skip),
    // "scan the repo for dead code" (Ghost Hunter), etc.
    // Also supports /skill <slug> [topic] explicit commands.
    let skillToUse = activeSkill
    let skillsToUse = activeSkills
    let userText = text

    // (a) /skill <slug1> [slug2] [slug3] [slug4] [topic] — parse multi-skill
    const slashMatch = text.match(/^\/skill\s+([\s\S]+)$/i)
    if (slashMatch) {
      const words = slashMatch[1].trim().split(/\s+/)
      const slugs: string[] = []
      let topicIdx = 0
      for (let i = 0; i < words.length && slugs.length < 4; i++) {
        const candidate = words[i].toLowerCase()
        if (DRIVE_SKILLS.some((s) => s.slug === candidate)) {
          slugs.push(candidate)
          topicIdx = i + 1
        } else {
          break
        }
      }
      if (slugs.length > 0) {
        const foundSkills = DRIVE_SKILLS.filter((s) => slugs.includes(s.slug))
        skillToUse = foundSkills.length === 1 ? foundSkills[0] : null
        skillsToUse = foundSkills
        userText = words.slice(topicIdx).join(' ').trim() || text
        if (foundSkills.length >= 1) setActiveSkillSlugs(slugs)
      }
    }

    // (b) Natural-language trigger — only if no explicit skill selected yet
    if (!skillToUse) {
      const detected = detectSkillInvocation(text)
      if (detected && DRIVE_SKILLS.some((s) => s.slug === detected.skill.slug)) {
        skillToUse = detected.skill
        skillsToUse = [detected.skill]
        userText = detected.topic || text
        setActiveSkillSlugs([detected.skill.slug])
      }
    }

    // Build instruction — single vs multi-skill
    let instruction: string
    let slugsForServer: string[] | undefined

    // Clarifying-question instruction: only in Auto mode, and only for
    // requests that would trigger a real action (code edit, diff, skill).
    // Manual mode already shows a plan before acting (redundant to ask),
    // and ordinary conversational questions should never trigger a question.
    const isAuto = mode === 'auto'
    const isLikelyAction = skillsToUse.length > 0 || !/^(how|what|why|explain|tell me|can you|is there|where|which|does|do)\b/i.test(userText)
    const shouldClarify = isAuto && isLikelyAction
    const CLARIFY_RULE = shouldClarify
      ? `\n\nIf this request is genuinely ambiguous and guessing wrong would waste real effort on a code edit, skill invocation, or diff proposal, ask exactly ONE clarifying question. Format it EXACTLY as:\n[CLARIFY] Your question? Options: A) option one, B) option two, C) option three\n\nOnly do this for genuinely ambiguous code-change requests (e.g. "clean up this file", "make this faster", "add auth"). Do NOT ask for well-specified requests where a reasonable default is obvious. Do NOT ask for conversational questions that don't lead to code changes.`
      : ''

    if (skillsToUse.length >= 2) {
      // Multi-skill: use buildMultiSkillPrompt for combined system prompt
      const invocations = skillsToUse.map((s) => ({
        skill: s,
        topic: userText,
        via: 'command' as const,
      }))
      instruction = `[Acting as ${skillsToUse.map((s) => s.name.toUpperCase()).join(' + ')} lenses]

${buildMultiSkillPrompt(invocations)}
${CLARIFY_RULE}

---

USER REQUEST: ${userText}`
      slugsForServer = skillsToUse.map((s) => s.slug)
    } else if (skillToUse) {
      instruction = `[Acting as ${skillToUse.name.toUpperCase()} lens]

${skillToUse.systemPrompt}
${CLARIFY_RULE}

---

USER REQUEST: ${userText}`
    } else {
      // No skill — just the clarifying rule for normal edit requests
      instruction = userText + CLARIFY_RULE
    }

    setLines((l) => [...l, { kind: 'prompt', text }])
    setInput('')
    exec(instruction, { skillSlugs: slugsForServer ?? (skillToUse ? [skillToUse.slug] : undefined) })
  }, [input, running, exec, activeSkill, activeSkills, setActiveSkillSlugs, mode])

  const handleQuickAction = (action: string) => {
    if (running) return
    exec(action)
  }

  const handleProceed = () => {
    if (!planContext || running) return
    setLines((l) => [...l, { kind: 'system', text: 'proceeding with plan...' }])
    exec(planContext.instruction, {
      proceed: true,
      targetFile: planContext.targetFile,
      isNewFile: planContext.isNewFile,
      instruction: planContext.instruction,
    })
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const discardProposal = (idx: number) => {
    setLines((l) => l.filter((_, j) => j !== idx))
  }

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev)
      if (next.has(dirPath)) next.delete(dirPath)
      else next.add(dirPath)
      return next
    })
  }

  const isLoading = status === 'loading'

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const hasRepo = !!repo

  // Render a tree node (recursive)
  const renderTreeNode = (node: TreeNode, depth: number): React.ReactNode => {
    const isExpanded = expandedDirs.has(node.path)
    const indent = depth * 12

    if (node.isDir) {
      return (
        <div key={node.path}>
          <button
            onClick={() => toggleDir(node.path)}
            className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary text-left"
            style={{ paddingLeft: `${8 + indent}px` }}
          >
            <ChevronRight className={`h-3 w-3 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
            <Folder className="h-3 w-3 flex-shrink-0 text-muted-foreground/60" />
            <span className="truncate">{node.name}</span>
          </button>
          {isExpanded && node.children.map((child) => renderTreeNode(child, depth + 1))}
        </div>
      )
    }

    return (
      <button
        key={node.path}
        onClick={() => fetchFileContent(node.path)}
        className="flex w-full items-center gap-1 rounded px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground transition-colors hover:bg-primary/5 hover:text-primary text-left"
        style={{ paddingLeft: `${8 + indent}px` }}
      >
        <span className="w-3 flex-shrink-0" />
        <File className="h-3 w-3 flex-shrink-0 text-muted-foreground/40" />
        <span className="truncate">{node.name}</span>
      </button>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-background font-sans">
      {/* Top bar */}
      <header className="flex h-10 flex-shrink-0 items-center gap-3 border-b border-border bg-background px-4">
        <Link href="/" className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground">
          <ArrowLeft className="h-3 w-3" /> Home
        </Link>

        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground/50">Coding Agent</span>

        {/* Drive / Cruise mode toggle */}
        <div className="flex items-center gap-0.5 rounded border border-border bg-surface-secondary p-0.5">
          <button onClick={() => setCruiseMode('drive')}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] transition-colors ${
              cruiseMode === 'drive' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Drive: interactive — you drive, the agent proposes diffs">
            <Car className="h-3 w-3" /> Drive
          </button>
          <button onClick={() => setCruiseMode('cruise')}
            className={`flex items-center gap-1 rounded px-2 py-1 font-mono text-[10px] transition-colors ${
              cruiseMode === 'cruise' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'
            }`}
            title="Cruise: autonomous — scans the repo and reports findings">
            <Radar className="h-3 w-3" /> Cruise
          </button>
        </div>

        <div className="ml-auto flex items-center gap-3">
          {currentBranch && (
            <span className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
              <GitBranch className="h-3 w-3" />{currentBranch}
              {hasPendingDiff && <span className="text-warning">*</span>}
            </span>
          )}
          {hasPendingDiff && (
            <span className="font-mono text-[10px] uppercase tracking-wider text-warning">Pending diff</span>
          )}
          <Link href="/resources/terminal" className="flex items-center gap-1 font-mono text-[10px] text-muted-foreground transition-colors hover:text-foreground">
            <TerminalSquare className="h-3 w-3" /> Shell
          </Link>
        </div>

        {/* Repo selector — green-tinted when a repo is active */}
        <div ref={repoMenuRef} className="relative">
          <button onClick={() => setRepoMenuOpen((o) => !o)}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 font-mono text-[11px] transition-colors ${
              hasRepo
                ? 'border-primary/30 bg-primary/5 text-primary hover:bg-primary/10'
                : 'border-border bg-surface-secondary text-muted-foreground hover:border-primary/30 hover:text-foreground'
            }`}>
            {hasRepo ? (<>{selectedRepo?.private && <Lock className="h-2.5 w-2.5 text-primary/50" />}{repo}</>) : <span>Select repository</span>}
            <ChevronDown className={`h-3 w-3 transition-transform ${repoMenuOpen ? 'rotate-180' : ''}`} />
          </button>
          <AnimatePresence>
            {repoMenuOpen && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.12 }}
                className="absolute right-0 top-full z-30 mt-1 max-h-72 w-72 overflow-y-auto rounded-md border border-border bg-surface-elevated shadow-lg">
                {repos.length === 0 ? (
                  <div className="px-3 py-2 font-mono text-[11px] text-muted-foreground">No repositories</div>
                ) : repos.map((r) => (
                  <button key={r.full_name} onClick={() => selectRepo(r.full_name)}
                    className={`flex w-full items-center justify-between px-3 py-1.5 text-left font-mono text-[11px] transition-colors hover:bg-surface-secondary ${r.full_name === repo ? 'text-primary' : 'text-foreground'}`}>
                    <span className="truncate">{r.full_name}</span>
                    <span className="ml-2 flex items-center gap-1.5 text-[9px] text-muted-foreground">{r.private && <Lock className="h-2.5 w-2.5" />}{r.default_branch}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <aside className="flex w-[240px] flex-shrink-0 flex-col border-r border-border bg-[#0a0b0d]">
          <div className="border-b border-border p-3">
            <div className="flex items-center gap-1.5">
              <Folder className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Repository</span>
            </div>
            {hasRepo ? (
              <div className="mt-2 space-y-1">
                <button onClick={() => setRepoMenuOpen((o) => !o)}
                  className="truncate font-mono text-[11px] text-primary transition-colors hover:text-primary/80 cursor-pointer text-left w-full">
                  {repo}
                </button>
                <p className="flex items-center gap-1.5 font-mono text-[10px] text-muted-foreground">
                  <GitBranch className="h-2.5 w-2.5" />
                  {currentBranch ?? selectedRepo?.default_branch ?? 'main'}
                  {hasPendingDiff && <span className="font-semibold text-warning">*</span>}
                </p>
              </div>
            ) : (
              <p className="mt-2 font-mono text-[10px] text-muted-foreground/60">No repository selected</p>
            )}
          </div>

          {/* FIX #1: Real file tree */}
          <div className="flex-1 overflow-y-auto py-2 scrollbar-hidden">
            <div className="flex items-center gap-1.5 px-3 mb-1">
              <File className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Files</span>
            </div>

            {loadingTree ? (
              <div className="flex items-center gap-2 px-3 py-2">
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
                <span className="font-mono text-[10px] text-muted-foreground/40">loading tree...</span>
              </div>
            ) : hasRepo && tree.length > 0 ? (
              <div className="space-y-0.5">
                {tree.map((node) => renderTreeNode(node, 0))}
              </div>
            ) : hasRepo ? (
              <p className="px-3 font-mono text-[10px] text-muted-foreground/50 leading-relaxed">No files found. The repository may be empty.</p>
            ) : (
              <p className="px-3 font-mono text-[10px] text-muted-foreground/50 leading-relaxed">Select a repository to browse its files.</p>
            )}
          </div>
        </aside>

        {/* Cruise replaces the conversation pane when active */}
        {cruiseMode === 'cruise' && <CruisePanel repo={repo} />}

        {/* Conversation (Drive) — kept mounted but hidden in Cruise so its state survives a toggle */}
        <div className={`min-w-0 flex-1 flex-col ${cruiseMode === 'cruise' ? 'hidden' : 'flex'}`}>
          <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-hidden">
            <div className="mx-auto max-w-[720px] px-8 py-6">
              {lines.map((line, i) => {
                if (line.kind === 'system') {
                  return <div key={i} className="mb-3"><p className="font-mono text-[11px] leading-relaxed text-muted-foreground/60">{line.text}</p></div>
                }

                if (line.kind === 'prompt') {
                  return (
                    <div key={i} className="mb-6">
                      <div className="border-l-2 border-primary/40 pl-4">
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">You</div>
                        <p className="font-sans text-[14px] leading-relaxed text-foreground">{line.text}</p>
                      </div>
                    </div>
                  )
                }

                if (line.kind === 'question') {
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="mb-5">
                      <div className="border-l-2 border-accent/50 pl-4">
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-accent/70">Clarifying question</div>
                        <p className="mb-3 font-sans text-[14px] leading-relaxed text-foreground">{line.questionText}</p>
                        <div className="flex flex-wrap gap-2">
                          {line.options.map((opt, idx) => (
                            <button
                              key={idx}
                              onClick={() => {
                                setInput(opt)
                                inputRef.current?.focus()
                              }}
                              className="rounded border border-accent/30 bg-accent/5 px-3 py-1.5 font-mono text-[11px] text-accent transition-colors hover:bg-accent/10 hover:border-accent/50"
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                        <p className="mt-2 font-mono text-[9px] text-muted-foreground/50">Click an option or type your own answer above</p>
                      </div>
                    </motion.div>
                  )
                }

                if (line.kind === 'error') {
                  return (
                    <div key={i} className="mb-4">
                      <div className="border-l-2 border-destructive/40 pl-4">
                        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-destructive/60">Error</div>
                        <p className="font-mono text-[12px] leading-relaxed text-destructive">{line.text}</p>
                      </div>
                    </div>
                  )
                }

                if (line.kind === 'filePreview') {
                  return (
                    <div key={i} className="mb-4">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-primary/60">
                          <Eye className="h-3 w-3 text-primary" /> {line.path}
                        </span>
                        <button onClick={() => setLines((l) => l.filter((_, j) => j !== i))}
                          className="rounded px-1 py-0.5 font-mono text-[9px] text-muted-foreground/40 transition-colors hover:text-muted-foreground">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <div className="overflow-hidden rounded-md border border-border">
                        <pre className="max-h-64 overflow-auto bg-[#080808] p-3 font-mono text-[11px] leading-relaxed text-foreground/80 whitespace-pre-wrap">
                          {line.content.slice(0, 4000)}
                          {line.content.length > 4000 && <span className="text-muted-foreground/40">{'\n...truncated'}</span>}
                        </pre>
                      </div>
                    </div>
                  )
                }

                if (line.kind === 'thinking') {
                  return (
                    <div key={i} className="mb-3">
                      <button onClick={() => setThinkingCollapsed((v) => !v)}
                        className="mb-1 flex items-center gap-1 font-mono text-[10px] text-muted-foreground/50 transition-colors hover:text-muted-foreground">
                        <ChevronDown className={`h-3 w-3 transition-transform ${thinkingCollapsed ? '-rotate-90' : ''}`} /> Thinking
                      </button>
                      {!thinkingCollapsed && <p className="border-l-2 border-border pl-3 font-mono text-[11px] leading-relaxed text-muted-foreground/50">{line.text}</p>}
                    </div>
                  )
                }

                // FIX #3: Plan response (manual mode phase 1)
                if (line.kind === 'plan') {
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="mb-5">
                      <div className="border-l-2 border-accent/40 pl-4">
                        <div className="mb-1 flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-accent/70">Plan</span>
                          <span className="font-mono text-[9px] text-muted-foreground/50">{line.targetFile}{line.isNewFile ? ' (new)' : ''}</span>
                        </div>
                        <div className="my-2 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">{line.text}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <button onClick={handleProceed} disabled={running || !planContext}
                            className="flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40">
                            <Play className="h-3 w-3" /> Propose Diff
                          </button>
                          <button onClick={() => { setLines((l) => l.filter((_, j) => j !== i)); setPlanContext(null) }}
                            className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:text-destructive">
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )
                }

                if (line.kind === 'proposal') {
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }} className="mb-6">
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[10px] uppercase tracking-wider text-warning">Proposed change</span>
                          {line.isNewFile && <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">New file</span>}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => discardProposal(i)}
                            className="flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-destructive/30 hover:text-destructive">
                            <X className="h-3 w-3" /> Discard
                          </button>
                          <button onClick={() => handleQuickAction('apply')} disabled={running}
                            className="flex items-center gap-1 rounded border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-mono text-[10px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40">
                            <Check className="h-3 w-3" /> Apply
                          </button>
                        </div>
                      </div>
                      <DiffBlock diffText={line.diff} />
                    </motion.div>
                  )
                }

                if (line.kind === 'applied') {
                  return (
                    <motion.div key={i} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15 }} className="mb-4">
                      <div className="border-l-2 border-primary/30 pl-4">
                        <div className="mb-1 flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" /><span className="font-mono text-[10px] uppercase tracking-wider text-primary/70">Applied</span></div>
                        <p className="font-mono text-[12px] leading-relaxed text-muted-foreground">{line.text}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <button onClick={() => handleQuickAction('commit "apply proposed changes"')} disabled={running}
                            className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-40">Commit</button>
                          <button onClick={() => handleQuickAction('pr "Proposed changes" "Auto-generated by enry coding agent"')} disabled={running}
                            className="rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary disabled:opacity-40">Create PR</button>
                        </div>
                      </div>
                    </motion.div>
                  )
                }

                if (line.kind === 'committed') {
                  return <div key={i} className="mb-4"><div className="border-l-2 border-primary/20 pl-4"><div className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-primary/50">Committed</div><p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{line.text}</p></div></div>
                }

                if (line.kind === 'pr') {
                  return <div key={i} className="mb-4"><div className="border-l-2 border-primary/20 pl-4"><div className="mb-0.5 font-mono text-[10px] uppercase tracking-wider text-primary/50">Pull Request</div><p className="font-mono text-[11px] leading-relaxed text-muted-foreground">{line.text}</p></div></div>
                }

                return null
              })}

              {/* Deep effort visual — multi-step checklist */}
              {isDeep && <DeepReasoningIndicator running={running} />}

              {/* Normal running indicator */}
              <AnimatePresence>
                {running && !isDeep && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mb-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
                      <span className="font-mono text-[11px] text-muted-foreground/40">thinking</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Command bar */}
          <div className="flex-shrink-0 border-t border-border bg-background px-4 py-3">
            <div className="mx-auto max-w-[720px]">
              <div className="flex items-end gap-2">
                {/* Model picker — Enry Engine routing */}
                <div ref={modelMenuRef} className="relative flex-shrink-0">
                  <button onClick={() => setModelMenuOpen((o) => !o)}
                    className="flex items-center gap-1 rounded border border-border bg-surface-secondary px-2.5 py-1.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground">
                    <Sliders className="h-3 w-3" />Enry Engine: {currentModel?.label}<ChevronDown className="h-2.5 w-2.5" />
                  </button>
                  <AnimatePresence>
                    {modelMenuOpen && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.12 }}
                        className="absolute bottom-full left-0 z-20 mb-1 w-52 rounded-md border border-border bg-surface-elevated shadow-lg">
                        {MODELS.map((m) => (
                          <button key={m.id} onClick={() => { setModel(m.id); setEffort(MODEL_DEFAULTS[m.id] ?? 'medium'); setModelMenuOpen(false); inputRef.current?.focus() }}
                            className={`flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-surface-secondary ${model === m.id ? 'text-primary' : 'text-foreground'}`}>
                            <span className="font-mono text-[10px] font-semibold">{m.label}</span>
                            <span className="font-sans text-[9px] text-muted-foreground">{m.desc}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Drive skill picker — multi-select */}
                <div ref={skillMenuRef} className="relative flex-shrink-0">
                  <button onClick={() => setSkillMenuOpen((o) => !o)}
                    className={`flex items-center gap-1 rounded border px-2.5 py-1.5 font-mono text-[10px] transition-colors hover:border-primary/30 hover:text-foreground ${
                      activeSkills.length > 0 ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border bg-surface-secondary text-muted-foreground'
                    }`}>
                    <Swords className="h-3 w-3" />
                    {activeSkills.length === 0 ? 'Skill' : activeSkills.length === 1 ? activeSkills[0].name : `${activeSkills.length} skills`}
                    <ChevronDown className="h-2.5 w-2.5" />
                  </button>
                  <AnimatePresence>
                    {skillMenuOpen && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.12 }}
                        className="absolute bottom-full left-0 z-20 mb-1 w-56 rounded-md border border-border bg-surface-elevated shadow-lg max-h-72 overflow-y-auto">
                        <button onClick={() => { setActiveSkillSlugs([]); setSkillMenuOpen(false); inputRef.current?.focus() }}
                          className={`flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-surface-secondary ${activeSkills.length === 0 ? 'text-primary' : 'text-foreground'}`}>
                          <span className="font-mono text-[10px] font-semibold">None (default)</span>
                          <span className="font-sans text-[9px] text-muted-foreground">Normal coding agent</span>
                        </button>
                        {DRIVE_SKILLS.map((s) => {
                          const checked = activeSkillSlugs.includes(s.slug)
                          return (
                            <button key={s.slug} onClick={() => {
                              const next = checked
                                ? activeSkillSlugs.filter((x) => x !== s.slug)
                                : [...activeSkillSlugs, s.slug].slice(0, 4)
                              setActiveSkillSlugs(next)
                              // Don't close the menu — allow multi-select
                            }}
                              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-surface-secondary ${checked ? 'text-primary' : 'text-foreground'}`}>
                              <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded border text-[8px] ${checked ? 'border-primary bg-primary/20 text-primary' : 'border-border text-transparent'}`}>
                                {checked ? <Check className="h-2.5 w-2.5" /> : null}
                              </span>
                              <div className="flex flex-col min-w-0">
                                <span className="font-mono text-[10px] font-semibold truncate">{s.name}</span>
                                <span className="font-sans text-[9px] text-muted-foreground truncate">{s.description}</span>
                              </div>
                            </button>
                          )
                        })}
                        {activeSkillSlugs.length > 0 && (
                          <button onClick={() => { setActiveSkillSlugs([]); setSkillMenuOpen(false); inputRef.current?.focus() }}
                            className="flex w-full items-center gap-2 border-t border-border px-3 py-1.5 text-left font-mono text-[10px] text-muted-foreground transition-colors hover:text-destructive">
                            <X className="h-3 w-3" /> Clear all ({activeSkillSlugs.length})
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Effort toggle — 5 levels for coding agent */}
                <div ref={effortMenuRef} className="relative flex-shrink-0">
                  <button onClick={() => setEffortMenuOpen((o) => !o)}
                    className={`flex items-center gap-1 rounded border px-2.5 py-1.5 font-mono text-[10px] transition-colors hover:border-primary/30 hover:text-foreground ${
                      isDeep ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border bg-surface-secondary text-muted-foreground'
                    }`}>
                    <Zap className="h-3 w-3" />{currentEffort?.label}<ChevronDown className="h-2.5 w-2.5" />
                  </button>
                  <AnimatePresence>
                    {effortMenuOpen && (
                      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 4 }} transition={{ duration: 0.12 }}
                        className="absolute bottom-full left-0 z-20 mb-1 w-44 rounded-md border border-border bg-surface-elevated shadow-lg">
                        {EFFORTS.map((e) => (
                          <button key={e.id} onClick={() => { setEffort(e.id); setEffortMenuOpen(false); inputRef.current?.focus() }}
                            className={`flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-surface-secondary ${effort === e.id ? 'text-primary' : 'text-foreground'}`}>
                            <span className={`font-mono text-[10px] font-semibold ${e.id === 'deep' && effort === e.id ? 'text-primary' : ''}`}>
                              {e.label}{e.id === 'deep' && <span className="font-normal text-muted-foreground/50"> \u2014 slow</span>}
                            </span>
                            <span className="font-sans text-[9px] text-muted-foreground">{e.desc}</span>
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* FIX #3: Auto/Manual mode toggle — green when active */}
                <button onClick={() => setMode(mode === 'auto' ? 'manual' : 'auto')} disabled={running}
                  className={`flex-shrink-0 rounded border px-2.5 py-1.5 font-mono text-[10px] transition-colors disabled:opacity-40 ${
                    mode === 'manual'
                      ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                      : 'border-border bg-surface-secondary text-muted-foreground hover:border-primary/30 hover:text-foreground'
                  }`}
                  title={mode === 'manual' ? 'Manual: agent plans first, you approve before diff' : 'Auto: agent proposes diff immediately'}>
                  {mode === 'manual' ? 'Manual' : 'Auto'}
                </button>

                {/* Input */}
                <textarea ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
                  placeholder={hasRepo ? 'Describe what you want changed\u2026' : 'Select a repository above to begin'}
                  rows={1} spellCheck={false} autoCapitalize="off" autoComplete="off" disabled={running || !hasRepo}
                  className="flex-1 resize-none rounded border border-border bg-surface-secondary px-3 py-1.5 font-mono text-[13px] leading-relaxed text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none disabled:opacity-40"
                  style={{ maxHeight: '120px' }} />

                <button onClick={handleSend} disabled={!input.trim() || running || !hasRepo}
                  className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded border transition-colors disabled:opacity-30 ${
                    input.trim() && !running && hasRepo
                      ? 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
                      : 'border-border bg-surface-secondary text-muted-foreground hover:border-primary/30 hover:text-primary'
                  }`}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </button>
              </div>

              <div className="mt-1.5 flex items-center gap-3">
                <p className="font-mono text-[9px] text-muted-foreground/40">
                  <kbd className="rounded border border-border/50 bg-surface-secondary px-1 py-0.5 font-mono text-[8px]">Enter</kbd> send{' \u00b7 '}
                  <kbd className="rounded border border-border/50 bg-surface-secondary px-1 py-0.5 font-mono text-[8px]">Shift+Enter</kbd> newline
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
