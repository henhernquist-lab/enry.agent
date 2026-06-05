'use client'

import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage, TextUIPart, SourceUrlUIPart } from 'ai'
import {
  Send,
  Paperclip,
  Command,
  ChevronDown,
  User,
  Bot,
  Copy,
  Check,
  RotateCcw,
  Globe,
  ExternalLink,
} from 'lucide-react'
import { EnryLogo } from './enry-logo'
import { StatusIndicator } from './status-indicator'

interface CenterPanelProps {
  agentStatus: 'online' | 'thinking' | 'executing' | 'idle'
  setAgentStatus: (status: 'online' | 'thinking' | 'executing' | 'idle') => void
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

const MODELS = [
  { id: 'claude-haiku-4-5',  label: 'Haiku 4.5',  tag: 'Fast' },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', tag: 'Balanced' },
  { id: 'claude-opus-4-6',   label: 'Opus 4.6',   tag: 'Smart' },
] as const

type ModelId = typeof MODELS[number]['id']

const transport = new DefaultChatTransport({ api: '/api/chat' })

export function CenterPanel({ agentStatus, setAgentStatus }: CenterPanelProps) {
  const { messages, sendMessage, status } = useChat({ transport })
  const [input, setInput] = useState('')
  const [model, setModel] = useState<ModelId>('claude-sonnet-4-6')
  const [modelOpen, setModelOpen] = useState(false)
  const [copiedId, setCopiedId] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  useEffect(() => {
    if (status === 'submitted') setAgentStatus('thinking')
    else if (status === 'streaming') setAgentStatus('executing')
    else setAgentStatus('online')
  }, [status, setAgentStatus])

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault()
    const text = input.trim()
    if (!text) return
    sendMessage({ text }, { body: { model } })
    setInput('')
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

  const isStreaming = status === 'streaming' || status === 'submitted'

  return (
    <main className="flex flex-1 flex-col overflow-hidden bg-surface-base">
      {/* Hero Section */}
      <div className="relative border-b border-border bg-surface-secondary px-8 py-6">
        <div className="pointer-events-none absolute inset-0 grid-overlay opacity-30" />
        <div className="relative z-10 mx-auto max-w-3xl">
          <div className="flex items-center justify-between">
            <div>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mb-2"
              >
                <EnryLogo size="lg" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="max-w-md text-sm text-muted-foreground"
              >
                Autonomous AI agent with advanced reasoning, tool execution, and
                persistent memory. Built for complex task automation.
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="mt-3"
              >
                <StatusIndicator status={agentStatus} />
              </motion.div>
            </div>
            {/* Model selector */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              className="relative"
            >
              <button
                onClick={() => setModelOpen((o) => !o)}
                className="flex items-center gap-2 rounded border border-border bg-surface-elevated px-4 py-2.5 font-mono text-sm text-foreground transition-colors hover:border-primary/40 hover:bg-surface-elevated"
              >
                <span className="text-muted-foreground text-xs">MODEL</span>
                <span className="text-primary font-medium">
                  {MODELS.find((m) => m.id === model)?.label}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${modelOpen ? 'rotate-180' : ''}`} />
              </button>
              {modelOpen && (
                <div className="absolute right-0 top-full z-50 mt-1 w-52 rounded border border-border bg-surface-secondary shadow-lg">
                  {MODELS.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => { setModel(m.id); setModelOpen(false) }}
                      className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-elevated ${model === m.id ? 'text-primary' : 'text-foreground'}`}
                    >
                      <span className="font-mono">{m.label}</span>
                      <span className={`font-mono text-[10px] px-1.5 py-0.5 rounded ${
                        m.tag === 'Fast' ? 'bg-accent/10 text-accent' :
                        m.tag === 'Balanced' ? 'bg-primary/10 text-primary' :
                        'bg-warning/10 text-warning'
                      }`}>{m.tag}</span>
                    </button>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-6 grid grid-cols-4 gap-4"
          >
            {[
              { label: 'Tasks Completed', value: '1,247' },
              { label: 'Tools Available', value: '24' },
              { label: 'Uptime', value: '99.9%' },
              { label: 'Avg Response', value: '1.2s' },
            ].map((stat) => (
              <div
                key={stat.label}
                className="rounded border border-border bg-surface-elevated px-4 py-3"
              >
                <p className="font-mono text-lg font-semibold text-foreground">
                  {stat.value}
                </p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Messages */}
      <div className="relative flex-1 overflow-y-auto px-8 py-6 scrollbar-hidden">
        <div className="mx-auto max-w-3xl space-y-6">
          {messages.length === 0 && (
            <div className="flex h-32 items-center justify-center">
              <p className="text-sm text-muted-foreground">Send a message to start.</p>
            </div>
          )}
          <AnimatePresence>
            {messages.map((message, index) => {
              const text = getTextContent(message)
              const sources = getSources(message)
              return (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  className={`flex gap-4 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border ${
                      message.role === 'assistant'
                        ? 'border-primary/30 bg-primary/10'
                        : 'border-border bg-surface-elevated'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      <Bot className="h-4 w-4 text-primary" />
                    ) : (
                      <User className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                  <div className={`group max-w-[85%] ${message.role === 'user' ? 'text-right' : ''}`}>
                    <div
                      className={`rounded border px-4 py-3 ${
                        message.role === 'assistant'
                          ? 'border-border bg-surface-secondary text-left'
                          : 'border-primary/20 bg-primary/5 text-left'
                      }`}
                    >
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                        {text}
                      </p>
                    </div>
                    {message.role === 'assistant' && sources.length > 0 && (
                      <div className="mt-2">
                        <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Globe className="h-3 w-3" />
                          <span>Sources</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {sources.map((s) => (
                            <a
                              key={s.sourceId}
                              href={s.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-start gap-1.5 rounded border border-border bg-surface-elevated px-2.5 py-2 text-xs hover:border-primary/30 hover:bg-surface-elevated transition-colors"
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
                          onClick={() => handleCopy(text, message.id)}
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

          {/* Typing indicator — show when submitted but no assistant message yet streaming */}
          {isStreaming && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-4"
            >
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-primary/30 bg-primary/10">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="rounded border border-border bg-surface-secondary px-4 py-3">
                <div className="flex items-center gap-1.5">
                  {[0, 0.2, 0.4].map((delay) => (
                    <motion.div
                      key={delay}
                      className="h-2 w-2 rounded-full bg-primary"
                      animate={{ scale: [1, 1.2, 1] }}
                      transition={{ duration: 0.6, repeat: Infinity, delay }}
                    />
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="border-t border-border bg-surface-secondary p-4">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl items-end gap-3"
        >
          <div className="relative flex-1">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter a command or ask anything..."
              rows={1}
              disabled={isStreaming}
              className="w-full resize-none rounded border border-border bg-surface-elevated px-4 py-3 pr-12 text-sm text-foreground placeholder-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />
            <button
              type="button"
              className="absolute bottom-3 right-3 rounded p-1 text-muted-foreground hover:bg-surface-secondary hover:text-foreground"
            >
              <Paperclip className="h-4 w-4" />
            </button>
          </div>
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="flex h-12 w-12 items-center justify-center rounded border border-primary bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:border-border disabled:bg-surface-elevated disabled:text-muted-foreground"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
        <div className="mx-auto mt-2 flex max-w-3xl items-center justify-between">
          <p className="text-xs text-muted-foreground">
            Press{' '}
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
    </main>
  )
}
