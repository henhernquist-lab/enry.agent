'use client'

import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage, TextUIPart, SourceUrlUIPart } from 'ai'
import {
  Send,
  Paperclip,
  Command,
  ChevronDown,
  Copy,
  Check,
  RotateCcw,
  ExternalLink,
  AlertTriangle,
  Search,
  Link,
  Code,
  Zap,
  Clock,
  Cpu,
  Database,
  Brain,
  Globe,
  Folder,
} from 'lucide-react'
import { EnryLogo } from './enry-logo'
import { StatusIndicator } from './status-indicator'
import { TypingText } from './typing-text'
import { FileAttachmentChip, type PendingUpload } from './file-attachment-chip'
import { FileAttachmentCard } from './file-attachment-card'
import { detectFileType, MAX_FILE_SIZE, SUPPORTED_EXTENSIONS } from '@/lib/uploads'
import { buildMessageText, parseMessageText, type AttachmentMeta } from '@/lib/attachment-marker'

import { setAgentBusy } from '@/lib/agent-presence'
import { SkillBanner } from './skill-banner'
import { ThinkingTrace } from './thinking-trace'
import { parseReasoningTrace } from '@/lib/reasoning-trace'
import { detectSkillInvocation, SKILLS } from '@/lib/skills/registry'
import type { SkillDefinition } from '@/lib/skills/types'
import type { ActivityEvent } from '@/lib/chat-history'

interface CenterPanelProps {
  agentStatus: 'online' | 'thinking' | 'streaming' | 'idle'
  setAgentStatus: (status: 'online' | 'thinking' | 'streaming' | 'idle') => void
  initialMessages?: UIMessage[]
  conversationCount: number
  lastResponseMs: number | null
  onSaveMessages: (messages: UIMessage[], model: string) => void
  onActivity: (event: Omit<ActivityEvent, 'id'>) => void
  onStreamUpdate: (text: string) => void
  onModelChange: (model: string) => void
}

const SESSION_START = Date.now()

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

function getTextContent(message: UIMessage): string {
  return message.parts
    .filter((p): p is TextUIPart => p.type === 'text')
    .map((p) => p.text)
    .join('')
}

function getSources(message: UIMessage): SourceUrlUIPart[] {
  return message.parts.filter((p): p is SourceUrlUIPart => p.type === 'source-url')
}

function getDisplayInfo(message: UIMessage): { attachment: AttachmentMeta | null; displayText: string } {
  return parseMessageText(getTextContent(message))
}

// The only two NIM models with native image input (confirmed against
// docs/model-selection-guide.md and the @ai-sdk/openai provider's actual
// image_url conversion path) — attaching a real image part to any other
// model would be silently ignored or rejected, so we gate on this.
const VISION_MODELS = new Set(['qwen/qwen3.5-122b-a10b', 'minimax/minimax-m3'])

const MODELS = [
  { id: 'deepseek-ai/deepseek-v4-pro', label: 'V4 Pro', company: 'DeepSeek', desc: "Strongest free model. Best for complex tasks." },
  { id: 'minimax/minimax-m3',            label: 'M3',      company: 'MiniMax', desc: 'Fast and capable. Great for general tasks.' },
  { id: 'qwen/qwen3.5-122b-a10b',        label: '122B',   company: 'Qwen', desc: 'Large reasoning model. Great for analysis.' },
  { id: 'z-ai/glm-5.2',                  label: 'GLM 5.2', company: 'Z.ai', desc: 'Versatile all-rounder. Good at following instructions.' },
] as const

type ModelId = typeof MODELS[number]['id']

// ─── Chatbot effort (3 levels, separate from coding agent's 5) ───

const CHAT_EFFORTS = [
  { id: 'low' as const,    label: 'Low',    desc: 'Minimal reasoning, fast' },
  { id: 'medium' as const,  label: 'Medium', desc: 'Default reasoning depth' },
  { id: 'high' as const,    label: 'High',   desc: 'Maximum reasoning, slower' },
]

type ChatEffortId = typeof CHAT_EFFORTS[number]['id']

const CHAT_MODEL_DEFAULTS: Record<string, ChatEffortId> = {
  'deepseek-ai/deepseek-v4-pro': 'medium',
  'z-ai/glm-5.2':               'high',
  'qwen/qwen3.5-122b-a10b':      'low',
  'minimax/minimax-m3':          'medium',
}

const QUICK_ACTIONS = [
  { label: 'Search the web', glyph: '/', prompt: 'Search the web for ' },
  { label: 'Summarize a URL', glyph: '↗', prompt: 'Summarize the content at this URL: ' },
  { label: 'Write code', glyph: '<>', prompt: 'Write code to ' },
  { label: 'Check my email', glyph: '@', prompt: 'Check my email for new messages', comingSoon: true as const },
]

const SUGGESTION_CARDS = [
  { label: 'Search the web', glyph: '/', prompt: 'Search the web for the latest AI news', description: 'Find real-time information from across the internet' },
  { label: 'Summarize a URL', glyph: '↗', prompt: 'Summarize the content at this URL: ', description: 'Extract key insights from any webpage' },
  { label: 'Write code', glyph: '<>', prompt: 'Write code to build a todo app', description: 'Generate, refactor, and debug code in any language' },
  { label: 'Check my email', glyph: '@', prompt: 'Check my email for new messages', description: 'Read and draft email responses', comingSoon: true as const },
]

const TOOL_BADGES = [
  { label: 'Web Search', glyph: '/', available: true },
  { label: 'Code', glyph: '<>', available: true },
  { label: 'Memory', glyph: 'M', available: true },
]

const transport = new DefaultChatTransport({ api: '/api/chat' })

export function CenterPanel({
  agentStatus,
  setAgentStatus,
  initialMessages,
  conversationCount,
  lastResponseMs,
  onSaveMessages,
  onActivity,
  onStreamUpdate,
  onModelChange,
}: CenterPanelProps) {
  const [model, setModel] = useState<ModelId>('deepseek-ai/deepseek-v4-pro')
  const [chatEffort, setChatEffort] = useState<ChatEffortId>(() => CHAT_MODEL_DEFAULTS['deepseek-ai/deepseek-v4-pro'] ?? 'medium')
  const [effortMenuOpen, setEffortMenuOpen] = useState(false)

  // Focus mode — controls what context the agent draws from
  type FocusMode = 'all' | 'memory_only' | 'web_only' | 'repo_only'
  const [focusMode, setFocusMode] = useState<FocusMode>('all')
  const [focusMenuOpen, setFocusMenuOpen] = useState(false)
  const focusDropdownRef = useRef<HTMLDivElement>(null)

  const FOCUS_MODES = [
    { id: 'all' as const, label: 'All', icon: Zap, desc: 'No restrictions — web, memory, repo' },
    { id: 'memory_only' as const, label: 'Memory', icon: Brain, desc: 'Only stored memories/notes' },
    { id: 'web_only' as const, label: 'Web', icon: Globe, desc: 'Web search only' },
    { id: 'repo_only' as const, label: 'Repo', icon: Folder, desc: 'Only repo files' },
  ]
  const currentFocus = FOCUS_MODES.find((f) => f.id === focusMode)!

  // Reasoning trace depth — how much model thinking to surface
  const [reasoningDepth, setReasoningDepth] = useState<'off' | 'summary' | 'full'>('off')
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false)
  const reasoningDropdownRef = useRef<HTMLDivElement>(null)

  const REASONING_DEPTHS = [
    { id: 'off' as const, label: 'Think: Off', desc: 'Show only the final answer' },
    { id: 'summary' as const, label: 'Think: Brief', desc: 'Show a condensed reasoning summary' },
    { id: 'full' as const, label: 'Think: Full', desc: 'Show the complete reasoning trace' },
  ]
  const currentReasoning = REASONING_DEPTHS.find((r) => r.id === reasoningDepth)!
  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: initialMessages,
    onFinish: ({ messages: finalMessages }) => {
      onSaveMessages(finalMessages, model)
      onActivity({ type: 'assistant-complete', content: '', at: Date.now() })
    },
    onError: (err) => {
      onActivity({ type: 'error', content: err.message, at: Date.now() })
    },
  })
  const [input, setInput] = useState('')
  // ─── Skill mode ───────────────────────────────────────────────
  // activeSkill is the current conversation mode (null = normal chat).
  // skillStartIndex marks where in the message list the skill began, so
  // assistant-turn counting (which drives the phase indicator and the
  // automatic exit) ignores any pre-skill history.
  const [activeSkill, setActiveSkill] = useState<SkillDefinition | null>(null)
  const [skillStartIndex, setSkillStartIndex] = useState(0)
  const [modelOpen, setModelOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const [uptimeMs, setUptimeMs] = useState(0)
  const [pendingUpload, setPendingUpload] = useState<PendingUpload | null>(null)
  const [uploadResult, setUploadResult] = useState<AttachmentMeta | null>(null)
  const [isDraggingFile, setIsDraggingFile] = useState(false)
  const modelDropdownRef = useRef<HTMLDivElement>(null)
  const effortDropdownRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // briefingEnabled initialized lazily; no mount-time setState required.

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (status === 'submitted') setAgentStatus('thinking')
    else if (status === 'streaming') setAgentStatus('streaming')
    else setAgentStatus('online')
  }, [status, setAgentStatus])

  // Report chat activity to the global presence indicator. busyRef guards
  // against double-counting setAgentBusy's increment/decrement across the
  // 'submitted' -> 'streaming' transition, which is busy=true both times.
  const busyRef = useRef(false)
  useEffect(() => {
    const nowBusy = status === 'submitted' || status === 'streaming'
    if (nowBusy !== busyRef.current) {
      setAgentBusy(nowBusy)
      busyRef.current = nowBusy
    }
  }, [status])

  // True unmount-only cleanup — releases the busy count if the component
  // goes away mid-stream (e.g. navigating away).
  useEffect(() => () => {
    if (busyRef.current) setAgentBusy(false)
  }, [])

  useEffect(() => {
    if (status !== 'streaming') return
    const last = messages[messages.length - 1]
    if (last?.role === 'assistant') {
      onStreamUpdate(getTextContent(last))
    }
  }, [messages, status, onStreamUpdate])

  useEffect(() => {
    const tick = () => setUptimeMs(Date.now() - SESSION_START)
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!modelOpen) return
    const handler = (e: MouseEvent) => {
      if (!modelDropdownRef.current?.contains(e.target as Node)) setModelOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [modelOpen])

  useEffect(() => {
    if (!effortMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (!effortDropdownRef.current?.contains(e.target as Node)) setEffortMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [effortMenuOpen])

  useEffect(() => {
    if (!reasoningMenuOpen) return
    const handler = (e: MouseEvent) => {
      if (!reasoningDropdownRef.current?.contains(e.target as Node)) setReasoningMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [reasoningMenuOpen])

  // Assistant turns produced since the active skill began — source of truth for
  // the phase indicator and the automatic exit.
  const skillTurnsCompleted = activeSkill
    ? messages.slice(skillStartIndex).filter((m) => m.role === 'assistant').length
    : 0

  const exitSkill = useCallback(() => {
    setActiveSkill(null)
    setSkillStartIndex(0)
  }, [])

  // Automatic exit: once the skill has produced all its assistant turns (e.g.
  // Devil's Advocate's verdict) and the stream has settled, drop back to normal
  // chat. The final turn's message stays in the transcript; only the mode clears.
  useEffect(() => {
    if (!activeSkill) return
    const done = skillTurnsCompleted >= activeSkill.structure.assistantTurns
    if (done && status !== 'streaming' && status !== 'submitted') {
      exitSkill()
    }
  }, [activeSkill, skillTurnsCompleted, status, exitSkill])

  // Send a message while a skill is active — injects the skill slug and the
  // turn number about to be generated so the server drives the right phase.
  const sendSkillTurn = (skill: SkillDefinition, text: string, startIndex: number) => {
    const turnsSoFar = messages.slice(startIndex).filter((m) => m.role === 'assistant').length
    onActivity({ type: 'user-sent', content: text, at: Date.now() })
    onActivity({ type: 'assistant-start', content: '', at: Date.now(), model })
    sendMessage({ text }, { body: { model, effort: chatEffort, skill: skill.slug, skillTurn: turnsSoFar + 1, focusMode, reasoningDepth } })
  }

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (pendingUpload?.status === 'uploading') return

    // ── Skill mode is active ──────────────────────────────────────
    if (activeSkill) {
      if (!text) return
      // Explicit early exit.
      if (/^\/(exit|end)$/i.test(text)) {
        exitSkill()
        setInput('')
        return
      }
      sendSkillTurn(activeSkill, text, skillStartIndex)
      setInput('')
      return
    }

    if (!text && !uploadResult) return

    // ── Skill invocation from normal chat (command or natural language) ──
    // Only when there's no attachment in flight — skills are text-only modes.
    if (text && !uploadResult) {
      const inv = detectSkillInvocation(text)
      if (inv) {
        const startIndex = messages.length
        setActiveSkill(inv.skill)
        setSkillStartIndex(startIndex)
        setInput('')
        // Topic supplied inline → run the first turn now. Otherwise arm the
        // skill and let the banner prompt for the opening input.
        if (inv.topic) {
          sendSkillTurn(inv.skill, inv.topic, startIndex)
        }
        return
      }
    }

    const attachment = uploadResult
    const finalText = attachment ? buildMessageText(attachment, text) : text

    onActivity({ type: 'user-sent', content: text || `[Attached: ${attachment?.filename}]`, at: Date.now() })
    onActivity({ type: 'assistant-start', content: '', at: Date.now(), model })
    const body: Record<string, unknown> = { model, effort: chatEffort, focusMode, reasoningDepth }

    // Only attach the raw image to the model when the selected model actually
    // supports vision — otherwise the text description in finalText is the
    // fallback that always works regardless of model.
    const files = attachment && attachment.file_type === 'image' && attachment.image_url && VISION_MODELS.has(model)
      ? [{ type: 'file' as const, mediaType: attachment.mime_type, filename: attachment.filename, url: attachment.image_url }]
      : undefined

    sendMessage({ text: finalText, ...(files ? { files } : {}) }, { body })
    setInput('')
    setPendingUpload(null)
    setUploadResult(null)
  }

  const handleFileSelected = async (file: File) => {
    if (file.size > MAX_FILE_SIZE) {
      setPendingUpload({ file, status: 'error', error: `Too large — max 10MB (${(file.size / (1024 * 1024)).toFixed(1)}MB)` })
      return
    }
    const fileType = detectFileType(file.name)
    if (!fileType) {
      setPendingUpload({ file, status: 'error', error: `Unsupported type — use ${SUPPORTED_EXTENSIONS.slice(0, 6).join(', ')}...` })
      return
    }

    setPendingUpload({ file, status: 'uploading', fileType })
    setUploadResult(null)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (!res.ok) {
        setPendingUpload({ file, status: 'error', error: data.error || 'Upload failed', fileType })
        return
      }
      setPendingUpload({ file, status: 'ready', fileType })
      setUploadResult({
        filename: data.filename,
        file_type: data.file_type,
        mime_type: data.mime_type,
        size: data.size,
        storage_path: data.storage_path,
        extracted_summary: data.extracted_summary,
        truncated: data.truncated,
        image_url: data.image_url,
      })
    } catch {
      setPendingUpload({ file, status: 'error', error: 'Network error — try again', fileType })
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) handleFileSelected(file)
  }

  const handleRemoveUpload = () => {
    setPendingUpload(null)
    setUploadResult(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDraggingFile(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFileSelected(file)
  }

  const router = useRouter()

  const handlePrefillPrompt = (prompt: string, comingSoon?: boolean) => {
    if (comingSoon) return
    setInput(prompt)
    setTimeout(() => textareaRef.current?.focus(), 0)
  }

  const handleModelSelect = (id: ModelId) => {
    setModel(id)
    setChatEffort(CHAT_MODEL_DEFAULTS[id] ?? 'medium')
    onModelChange(id)
    setModelOpen(false)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const handleCopy = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const currentChatEffort = CHAT_EFFORTS.find((e) => e.id === chatEffort)
  const isStreaming = status === 'streaming' || status === 'submitted'



  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-surface-base">
      {/* Status Bar */}
      <div className="relative border-b border-border bg-surface-secondary">
        <div className="pointer-events-none absolute inset-0 grid-overlay opacity-20" />
        <div className="relative z-10 mx-auto max-w-3xl px-8 py-3">
          <div className="flex items-center justify-between">
            {/* Left: Logo + Status */}
            <div className="flex items-center gap-3">
              <EnryLogo size="sm" />
              <div className="h-4 w-px bg-border" />
              <StatusIndicator status={agentStatus} />
            </div>

            {/* Right: Live Stats */}
            <div className="flex items-center gap-4">
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-1.5"
              >
                <Cpu className="h-3 w-3 text-primary" />
                <span className="font-mono text-[11px] font-medium text-foreground">
                  {(() => { const m = MODELS.find((x) => x.id === model); return m ? `${m.company} ${m.label}` : ''; })()}
                </span>
              </motion.div>

              <div className="h-3 w-px bg-border" />

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="flex items-center gap-1.5"
              >
                <Zap className="h-3 w-3 text-accent" />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {lastResponseMs !== null ? (
                    <span className="text-accent">{formatDuration(lastResponseMs)}</span>
                  ) : (
                    <span>—</span>
                  )}
                </span>
              </motion.div>

              <div className="h-3 w-px bg-border" />

              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.2 }}
                className="flex items-center gap-1.5"
              >
                <Clock className="h-3 w-3 text-warning" />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {formatUptime(uptimeMs)}
                </span>
              </motion.div>
            </div>
          </div>
        </div>
      </div>

      {/* Skill mode banner */}
      <AnimatePresence>
        {activeSkill && (
          <SkillBanner
            key={activeSkill.slug}
            name={activeSkill.name}
            phaseLabel={activeSkill.structure.turnLabels[Math.min(skillTurnsCompleted, activeSkill.structure.assistantTurns - 1)]}
            completed={skillTurnsCompleted}
            total={activeSkill.structure.assistantTurns}
            waitingForInput={messages.slice(skillStartIndex).length === 0}
            hint={activeSkill.structure.openingInputHint}
            onExit={exitSkill}
          />
        )}
      </AnimatePresence>

      {/* Messages Area */}
      <div className="relative flex-1 overflow-y-auto px-8 py-6 scrollbar-hidden">
        <div className="mx-auto max-w-3xl space-y-6">
          {/* Welcome Section - shown when no messages */}
          {messages.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col items-center justify-center py-12"
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 28 }}
                className="mb-6"
              >
                <EnryLogo size="lg" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mb-2 text-center font-display text-2xl font-bold text-foreground"
              >
                What can I help you with?
              </motion.h2>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="mb-8 max-w-md text-center text-sm text-muted-foreground"
              >
                I can search the web, write code, analyze data, and automate complex tasks. Pick a suggestion or just start typing.
              </motion.p>

              {/* Suggestion Cards */}
              <div className="grid w-full grid-cols-2 gap-3">
                {SUGGESTION_CARDS.map((card, index) => (
                  <motion.button
                    key={card.label}
                    initial={{ opacity: 0, y: 15 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 + index * 0.08 }}
                    whileHover={{ scale: 1.02, borderColor: 'rgba(0, 255, 102, 0.3)' }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (card.label === 'Write code') router.push('/agent')
                      else handlePrefillPrompt(card.prompt, card.comingSoon)
                    }}
                    disabled={card.comingSoon}
                    aria-disabled={card.comingSoon}
                    aria-label={card.comingSoon ? `${card.label} (coming soon)` : `${card.label} - ${card.description}`}
                    className={`group relative flex items-start gap-3 border border-border bg-surface-secondary p-4 text-left transition-all duration-200 ${
                      card.comingSoon
                        ? 'cursor-not-allowed opacity-60'
                        : 'cursor-pointer hover:border-primary/30 hover:bg-surface-elevated hover:shadow-[0_0_20px_rgba(0,255,102,0.05)]'
                    }`}
                  >
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center border font-mono text-base font-bold ${
                      card.comingSoon
                        ? 'border-border text-muted-foreground/40'
                        : 'border-primary/30 text-primary group-hover:border-primary/60'
                    }`}>
                      {card.glyph}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground">{card.label}</p>
                        {card.comingSoon && (
                          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                            — soon
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">{card.description}</p>
                    </div>
                  </motion.button>
                ))}
              </div>
            </motion.div>
          )}

          {/* Messages */}
          <AnimatePresence>
            {messages.map((message, index) => {
              const { attachment, displayText: text } = getDisplayInfo(message)
              const sources = getSources(message)
              const inSkillRange = activeSkill !== null && index >= skillStartIndex
              const isCurrentStream =
                isStreaming &&
                index === messages.length - 1 &&
                message.role === 'assistant'
              // Parse reasoning trace from completed (non-streaming) assistant messages
              const isAssistant = message.role === 'assistant'
              const { reasoning: rawTrace, answer: cleanAnswer } = isAssistant && !isCurrentStream
                ? parseReasoningTrace(text)
                : { reasoning: null, answer: text }
              const displayAnswer = isAssistant && !isCurrentStream ? cleanAnswer : text
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                                    <div className={`group max-w-[85%] ${message.role === 'user' ? 'text-right' : ''}`}>
                    {message.role === 'user' && attachment && (
                      <div className="text-left">
                        <FileAttachmentCard attachment={attachment} />
                      </div>
                    )}
                    {isAssistant && rawTrace && (
                      <ThinkingTrace reasoning={rawTrace} depth={reasoningDepth} />
                    )}
                    <div
                      className={`rounded border px-4 py-3 transition-colors duration-300 ${
                        message.role === 'assistant'
                          ? isCurrentStream
                            ? 'border-primary/40 bg-surface-secondary text-left shadow-[0_0_18px_rgba(0,255,102,0.07)]'
                            : 'border-border bg-surface-secondary text-left'
                          : 'border-primary/20 bg-primary/5 text-left'
                      } ${inSkillRange && message.role === 'assistant' ? 'border-l-2 border-l-warning/60' : ''}`}
                    >
                      <p className={`whitespace-pre-wrap text-sm leading-relaxed ${message.role === 'assistant' ? 'font-mono text-primary/90' : 'text-foreground'}`}>
                        {isCurrentStream ? (
                          <TypingText text={displayAnswer} isStreaming={true} />
                        ) : (
                          displayAnswer
                        )}
                      </p>
                    </div>
                    {message.role === 'assistant' && sources.length > 0 && (
                      <div className="mt-2">
                        <div className="mb-1.5 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                          <span className="text-primary">▸</span>
                          <span>Sources</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {sources.map((s) => (
                            <a
                              key={s.sourceId}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-1.5 border border-border bg-surface-elevated px-2.5 py-2 text-xs hover:border-primary/30 hover:bg-surface-elevated transition-colors"
                            >
                              <ExternalLink className="mt-0.5 h-3 w-3 flex-shrink-0 text-accent" />
                              <div className="min-w-0">
                                <p className="truncate font-medium text-foreground">{s.title ?? new URL(s.url).hostname}</p>
                                <p className="truncate text-muted-foreground">{new URL(s.url).hostname}</p>
                              </div>
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                    {message.role === 'assistant' && (
                      <div className="mt-1.5 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          onClick={() => handleCopy(displayAnswer, message.id)}
                          className="rounded p-1 hover:bg-surface-elevated"
                        >
                          {copiedId === message.id ? (
                            <Check className="h-3 w-3 text-primary" />
                          ) : (
                            <Copy className="h-3 w-3 text-muted-foreground" />
                          )}
                        </button>
                        <button className="rounded p-1 hover:bg-surface-elevated">
                          <RotateCcw className="h-3 w-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}


                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* Typing indicator */}
          {isStreaming && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4"
            >
              <div className="rounded border border-primary/30 bg-surface-secondary px-4 py-3 shadow-[0_0_18px_rgba(0,255,102,0.07)]">
                <div className="flex items-center gap-1.5">
                  {[0, 0.2, 0.4].map((delay) => (
                    <motion.div
                      key={delay}
                      className="h-2 w-2 rounded-full bg-primary"
                      animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-2 rounded border border-warning/40 bg-warning/10 px-4 py-3"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-warning" />
              <p className="text-sm text-foreground">{error.message || 'Something went wrong. Try a different model or retry.'}</p>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-surface-secondary">
        {/* Quick Action Buttons */}
        <div className="mx-auto max-w-3xl px-4 pt-3">
          <div className="flex items-center gap-2">              {QUICK_ACTIONS.map((action) => (
                <motion.button
                  key={action.label}
                  whileHover={{ scale: action.comingSoon ? 1 : 1.03 }}
                  whileTap={{ scale: action.comingSoon ? 1 : 0.97 }}
                  onClick={() => {
                    if (action.label === 'Write code') router.push('/agent')
                    else handlePrefillPrompt(action.prompt, action.comingSoon)
                  }}
                disabled={action.comingSoon}
                aria-disabled={action.comingSoon}
                aria-label={action.comingSoon ? `${action.label} (coming soon)` : action.label}
                className={`flex items-center gap-1.5 border px-3 py-1.5 text-[11px] font-medium transition-all duration-200 ${
                  action.comingSoon
                    ? 'cursor-not-allowed border-border bg-surface-elevated text-muted-foreground opacity-60'
                    : 'cursor-pointer border-primary/20 bg-primary/5 text-primary hover:border-primary/40 hover:bg-primary/10 hover:shadow-[0_0_12px_rgba(0,255,102,0.08)]'
                }`}
              >
                <span className="font-mono text-xs text-primary opacity-80">{action.glyph}</span>
                {action.label}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Pending attachment chip */}
        {pendingUpload && (
          <div className="mx-auto max-w-3xl px-4 pt-2">
            <FileAttachmentChip upload={pendingUpload} onRemove={handleRemoveUpload} />
          </div>
        )}

        {/* /skill discoverability — lists available conversation modes */}
        {!activeSkill && /^\/skill\b/i.test(input) && (
          <div className="mx-auto max-w-3xl px-4 pt-2">
            <div className="overflow-hidden rounded border border-border bg-surface-secondary">
              <div className="border-b border-border px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                skills
              </div>
              {SKILLS.filter((s) => {
                const q = input.trim().replace(/^\/skill\s*/i, '').toLowerCase()
                return !q || s.slug.includes(q) || s.name.toLowerCase().includes(q)
              }).map((s) => (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => { setInput(`/skill ${s.slug} `); textareaRef.current?.focus() }}
                  className="flex w-full flex-col gap-0.5 px-3 py-2 text-left transition-colors hover:bg-surface-elevated"
                >
                  <span className="font-mono text-[11px] text-primary">/skill {s.slug}</span>
                  <span className="text-[11px] text-muted-foreground">{s.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Input */}
        <form
          onSubmit={handleSubmit}
          onDragOver={(e) => { e.preventDefault(); setIsDraggingFile(true) }}
          onDragLeave={() => setIsDraggingFile(false)}
          onDrop={handleDrop}
          className={`mx-auto flex max-w-3xl items-end gap-2 rounded px-4 pt-2 pb-3 transition-colors ${isDraggingFile ? 'bg-primary/5 ring-1 ring-primary/40' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={SUPPORTED_EXTENSIONS.map((e) => `.${e}`).join(',')}
            onChange={handleFileInputChange}
            className="hidden"
          />
          <div className="relative flex-1">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                isDraggingFile
                  ? 'Drop file to attach…'
                  : activeSkill
                    ? messages.slice(skillStartIndex).length === 0
                      ? activeSkill.structure.openingInputHint ?? 'Respond to continue…'
                      : `${activeSkill.name} — respond, or /exit to leave`
                    : 'Enter a command or ask anything, or /skill to run a mode…'
              }
              rows={1}
              disabled={isStreaming}
              className="w-full resize-none rounded border border-border bg-surface-elevated px-4 py-3 pr-12 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-3 right-3 rounded p-1 text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </div>

          {/* Model Selector */}
          <div ref={modelDropdownRef} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setModelOpen((o) => !o)}
              className="flex h-12 items-center gap-1.5 rounded border border-border bg-surface-elevated px-3 font-mono text-xs text-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <span className="text-muted-foreground/60 text-[10px]">
                {MODELS.find((m) => m.id === model)?.company}
              </span>
              <span className="text-primary font-semibold">
                {MODELS.find((m) => m.id === model)?.label}
              </span>
              <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
            </button>
            {modelOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-1 w-64 border border-border bg-surface-secondary shadow-xl">
                {MODELS.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    onClick={() => handleModelSelect(m.id)}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left font-mono text-xs transition-colors hover:bg-surface-elevated ${
                      model === m.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="mt-0.5 flex-shrink-0">
                      {model === m.id ? (
                        <span className="block h-1.5 w-1.5 rounded-full bg-primary" />
                      ) : (
                        <span className="block h-1.5 w-1.5 rounded-full border border-border" />
                      )}
                    </span>
                    <span className="flex flex-col">
                      <span>
                        <span className="text-muted-foreground/60 text-[10px]">{m.company}</span>{' '}
                        <span>{m.label}</span>
                      </span>
                      <span className="font-normal text-[10px] text-muted-foreground leading-tight mt-0.5">
                        {m.desc}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Reasoning Depth selector */}
          <div ref={reasoningDropdownRef} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setReasoningMenuOpen((o) => !o)}
              className={`flex h-12 items-center gap-1 rounded border px-2.5 font-mono text-[10px] transition-colors hover:border-primary/30 hover:text-foreground ${
                reasoningDepth !== 'off' ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border bg-surface-elevated text-muted-foreground'
              }`}
              title={currentReasoning.desc}
            >
              <Brain className="h-3 w-3" />
              {reasoningDepth === 'off' ? 'Think' : currentReasoning.label.replace('Think: ', '')}
            </button>
            {reasoningMenuOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-1 w-48 border border-border bg-surface-secondary shadow-xl">
                {REASONING_DEPTHS.map((r) => (
                  <button
                    type="button"
                    key={r.id}
                    onClick={() => { setReasoningDepth(r.id); setReasoningMenuOpen(false) }}
                    className={`flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-surface-elevated ${
                      reasoningDepth === r.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="font-mono text-[10px] font-semibold">{r.label}</span>
                    <span className="font-sans text-[9px] text-muted-foreground leading-tight">{r.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Focus Mode selector */}
          <div ref={focusDropdownRef} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setFocusMenuOpen((o) => !o)}
              className={`flex h-12 items-center gap-1 rounded border px-2.5 font-mono text-[10px] transition-colors hover:border-primary/30 hover:text-foreground ${
                focusMode !== 'all' ? 'border-primary/30 bg-primary/5 text-primary' : 'border-border bg-surface-elevated text-muted-foreground'
              }`}
              title={`Focus: ${currentFocus.desc}`}
            >
              {currentFocus.icon && <currentFocus.icon className="h-3 w-3" />}
              {currentFocus.label}
            </button>
            {focusMenuOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-1 w-44 border border-border bg-surface-secondary shadow-xl">
                {FOCUS_MODES.map((f) => (
                  <button
                    type="button"
                    key={f.id}
                    onClick={() => { setFocusMode(f.id); setFocusMenuOpen(false) }}
                    className={`flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-surface-elevated ${
                      focusMode === f.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="font-mono text-[10px] font-semibold">{f.label}</span>
                    <span className="font-sans text-[9px] text-muted-foreground leading-tight">{f.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Chat Effort Toggle — 3 levels, separate from coding agent's 5 */}
          <div ref={effortDropdownRef} className="relative flex-shrink-0">
            <button
              type="button"
              onClick={() => setEffortMenuOpen((o) => !o)}
              className="flex h-12 items-center gap-1 rounded border border-border bg-surface-elevated px-2.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <Zap className="h-3 w-3" />{currentChatEffort?.label}
              <ChevronDown className={`h-2.5 w-2.5 transition-transform ${effortMenuOpen ? 'rotate-180' : ''}`} />
            </button>
            {effortMenuOpen && (
              <div className="absolute bottom-full right-0 z-50 mb-1 w-40 border border-border bg-surface-secondary shadow-xl">
                {CHAT_EFFORTS.map((e) => (
                  <button
                    type="button"
                    key={e.id}
                    onClick={() => { setChatEffort(e.id); setEffortMenuOpen(false) }}
                    className={`flex w-full flex-col px-3 py-1.5 text-left transition-colors hover:bg-surface-elevated ${
                      chatEffort === e.id ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <span className="font-mono text-[10px] font-semibold">{e.label}</span>
                    <span className="font-sans text-[9px] text-muted-foreground leading-tight">{e.desc}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={(!input.trim() && !uploadResult) || isStreaming || pendingUpload?.status === 'uploading'}
            className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded border border-primary bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-elevated disabled:text-muted-foreground"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>

        {/* Tool Badges + Footer */}
        <div className="mx-auto max-w-3xl px-4 pb-3">
          <div className="flex items-center justify-between">
            {/* Tool Badges */}
            <div className="flex items-center gap-2">
              {TOOL_BADGES.map((tool) => (
                <motion.div
                  key={tool.label}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`flex items-center gap-1 border px-2.5 py-1 text-[10px] font-medium ${
                    tool.available
                      ? 'border-primary/30 text-primary'
                      : 'border-border bg-surface-elevated text-muted-foreground'
                  }`}
                >
                  {tool.available ? (
                    <motion.div
                      className="h-1.5 w-1.5 rounded-full bg-primary"
                      animate={{
                        boxShadow: [
                          '0 0 0px rgba(0,255,102,0.5)',
                          '0 0 6px rgba(0,255,102,0.8)',
                          '0 0 0px rgba(0,255,102,0.5)',
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity }}
                    />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground" />
                  )}
                  <span className="font-mono text-[10px]">{tool.glyph}</span>
                  {tool.label}
                </motion.div>
              ))}
            </div>

            {/* Keyboard hints */}
            <div className="flex items-center gap-2">
              <p className="text-xs text-muted-foreground">
                <kbd className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px]">
                  Enter
                </kbd>{' '}
                to send,{' '}
                <kbd className="rounded border border-border bg-surface-elevated px-1.5 py-0.5 font-mono text-[10px]">
                  Shift + Enter
                </kbd>{' '}
                for new line
              </p>
              <button className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <Command className="h-3 w-3" />
                Command Palette
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
