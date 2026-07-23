'use client'

import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  MessageSquarePlus,
  MessageSquare,
  Trash2,
  Wrench,
  BookMarked,
  Swords,
  FlaskConical,
  Brain,
  GraduationCap,
  Settings,
  BarChart3,
  Cpu,
  Box,
  Home,
  type LucideIcon,
} from 'lucide-react'
import { EnryLogo } from './enry-logo'
import { StatusIndicator } from './status-indicator'
import { AutomationsSection } from './automations-section'
import { BuiltinAutomationsLauncher } from './automations/builtin-launcher'
import type { Conversation } from '@/lib/chat-history'

interface LeftSidebarProps {
  agentStatus: 'online' | 'thinking' | 'streaming' | 'idle'
  conversations: Conversation[]
  activeId: string
  onNewChat: () => void
  onSelectConversation: (id: string) => void
  onDeleteConversation: (id: string) => void
  onAutomationsChange?: () => void
}

interface NavItem {
  href: string
  icon: LucideIcon
  label: string
  desc: string
}

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Platform',
    items: [
      { href: '/', icon: Home, label: 'Home', desc: 'Dashboard overview' },
      { href: '/chat', icon: MessageSquare, label: 'Chat', desc: 'Ask Enry anything' },
      { href: '/models', icon: Cpu, label: 'Model Intelligence', desc: 'Benchmark model performance' },
      { href: '/usage', icon: BarChart3, label: 'Usage', desc: 'Track tokens, cost, and alerts' },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { href: '/agent', icon: Swords, label: 'Drive', desc: 'Autonomous coding agent' },
      { href: '/learn', icon: GraduationCap, label: 'Learn', desc: 'Tutorials and skills' },
      { href: '/lab', icon: FlaskConical, label: 'Lab', desc: 'Experiments and overnight runs' },
    ],
  },
  {
    title: 'Library',
    items: [
      { href: '/resources', icon: Wrench, label: 'Tools', desc: 'Built-in tools and resources' },
      { href: '/prompts', icon: BookMarked, label: 'Prompts', desc: 'Saved prompts and recipes' },
      { href: '/resources/memory', icon: Brain, label: 'Memory', desc: 'Saved facts and context' },
      { href: '/room', icon: Box, label: 'The Room', desc: '3D headquarters view' },
    ],
  },
  {
    title: 'System',
    items: [{ href: '/settings', icon: Settings, label: 'Settings', desc: 'Account and integrations' }],
  },
]

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

export function LeftSidebar({
  agentStatus,
  conversations,
  activeId,
  onNewChat,
  onSelectConversation,
  onDeleteConversation,
  onAutomationsChange,
}: LeftSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className="flex h-full w-[260px] flex-col border-r border-border bg-surface-secondary">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border p-4">
        <EnryLogo size="sm" />
        <StatusIndicator status={agentStatus} />
      </div>

      {/* New Chat */}
      <div className="p-3">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pb-4 scrollbar-hidden">
        {/* Automation launchers */}
        <div className="space-y-2">
          <BuiltinAutomationsLauncher />
          <AutomationsSection onAutomationsChange={onAutomationsChange} />
        </div>

        <div className="border-t border-border" />

        {/* Nav sections */}
        <nav className="space-y-5">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <h3 className="mb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                {section.title}
              </h3>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const isActive = pathname === item.href
                  const Icon = item.icon
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`group flex items-start gap-3 rounded-md px-2 py-2 transition-colors ${
                        isActive
                          ? 'bg-surface-elevated text-foreground'
                          : 'text-muted-foreground hover:bg-surface-elevated/60 hover:text-foreground'
                      }`}
                    >
                      <Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isActive ? 'text-primary' : 'text-muted-foreground/70 group-hover:text-foreground'}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{item.label}</span>
                          {isActive && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
                        </div>
                        <p className="truncate text-[10px] text-muted-foreground/70">{item.desc}</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-border" />

        {/* Chat History */}
        <div>
          <h3 className="mb-2 px-2 font-mono text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Chat History
          </h3>
          {conversations.length === 0 ? (
            <p className="px-2 text-xs text-muted-foreground">No saved chats yet.</p>
          ) : (
            <div className="space-y-0.5">
              <AnimatePresence>
                {conversations.map((conv, index) => (
                  <motion.div
                    key={conv.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ delay: Math.min(index * 0.03, 0.3) }}
                    className={`group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer ${
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
      </div>
    </aside>
  )
}
