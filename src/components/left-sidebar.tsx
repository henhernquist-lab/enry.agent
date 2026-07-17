'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { EnryLogo } from './enry-logo'
import { StatusIndicator } from './status-indicator'
import { AutomationsSection } from './automations-section'
import { BuiltinAutomationsLauncher } from './automations/builtin-launcher'
import type { Conversation } from '@/lib/chat-history'
import Link from 'next/link'
import { MessageSquarePlus, MessageSquare, Trash2, Download, X, Wrench, BookMarked, BookOpen, Swords, FlaskConical, Brain, Settings } from 'lucide-react'

interface LeftSidebarProps {
  agentStatus: 'online' | 'thinking' | 'streaming' | 'idle'
  conversations: Conversation[]
  activeId: string
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onAutomationsChange?: () => void
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
// Note: automations-section.tsx has its own formatRelativeTime with second-level granularity.

export function LeftSidebar({
  agentStatus,
  conversations,
  activeId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onAutomationsChange,
}: LeftSidebarProps) {
  return (
    <aside className="flex h-full w-[280px] flex-col border-r border-border bg-surface-secondary">
      <div className="border-b border-border p-4">
        <EnryLogo size="sm" />
        <div className="mt-3">
          <StatusIndicator status={agentStatus} />
        </div>
      </div>

      <div className="p-4">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 scrollbar-hidden">
        <BuiltinAutomationsLauncher />

        <div className="my-3 border-t border-border" />

        <AutomationsSection onAutomationsChange={onAutomationsChange} />

        <div className="my-3 border-t border-border" />

        <h3 className="mb-2 font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Chat History
        </h3>
        {conversations.length === 0 ? (
          <p className="text-xs text-muted-foreground">No saved chats yet.</p>
        ) : (
          <div className="space-y-1">
            <AnimatePresence>
              {conversations.map((conv, index) => (
                <motion.div
                  key={conv.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ delay: Math.min(index * 0.03, 0.3) }}
                  className={`group flex items-center gap-2 rounded px-2 py-2 cursor-pointer ${
                    conv.id === activeId ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/60'
                  }`}
                  onClick={() => onSelectConversation(conv.id)}
                >
                  <MessageSquare
                    className={`h-3.5 w-3.5 flex-shrink-0 ${conv.id === activeId ? 'text-primary' : 'text-muted-foreground'}`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className={`truncate text-xs ${conv.id === activeId ? 'text-foreground' : 'text-muted-foreground'}`}>
                      {conv.title}
                    </p>
                    <p className="font-mono text-[10px] text-muted-foreground">
                      {formatRelativeTime(conv.updatedAt)}
                    </p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onDeleteConversation(conv.id)
                    }}
                    className="rounded p-1 opacity-0 transition-opacity hover:bg-surface-secondary group-hover:opacity-100"
                  >
                    <Trash2 className="h-3 w-3 text-muted-foreground" />
                  </button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* All six section buttons share one consistent green-border accent treatment
          — Enry Drive / Tools / Prompt Library / Reading List / Enry Lab / Memory. */}
      <div className="border-t border-border p-4 space-y-2">
        <Link
          href="/agent"
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Swords className="h-4 w-4" />
          Enry Drive
        </Link>
        <Link
          href="/resources"
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Wrench className="h-4 w-4" />
          Tools &amp; Resources
        </Link>
        <Link
          href="/prompts"
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <BookMarked className="h-4 w-4" />
          Prompt Library
        </Link>
        <Link
          href="/reading-list"
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <BookOpen className="h-4 w-4" />
          Reading List
        </Link>
        <Link
          href="/resources/memory"
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Brain className="h-4 w-4" />
        <Link
          href="/resources/memory"
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Brain className="h-4 w-4" />
          Memory
        </Link>
        <Link
          href="/settings"
          className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <Settings className="h-4 w-4" />
          Settings
        </Link>
      </div>
    </aside>
  )
}
