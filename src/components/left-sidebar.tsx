'use client'

import { motion } from 'framer-motion'
import { EnryLogo } from './enry-logo'
import { StatusIndicator } from './status-indicator'
import {
  Brain,
  Wrench,
  History,
  Activity,
  Database,
  Cpu,
  Zap,
  FileCode,
  Globe,
  Terminal,
} from 'lucide-react'

interface LeftSidebarProps {
  agentStatus: 'online' | 'thinking' | 'executing' | 'idle'
}

const memoryItems = [
  { id: 1, content: 'User preferences loaded', time: '2m ago' },
  { id: 2, content: 'Context: financial analysis task', time: '5m ago' },
  { id: 3, content: 'Previous session restored', time: '12m ago' },
]

const activeTools = [
  { name: 'Web Search', icon: Globe, active: true },
  { name: 'Code Executor', icon: FileCode, active: true },
  { name: 'File System', icon: Database, active: false },
  { name: 'Terminal', icon: Terminal, active: false },
]

const recentActions = [
  { action: 'Analyzed dataset', status: 'completed' },
  { action: 'Generated report', status: 'completed' },
  { action: 'Fetching API data', status: 'running' },
]

export function LeftSidebar({ agentStatus }: LeftSidebarProps) {
  return (
    <aside className="flex h-full w-[280px] flex-col border-r border-border bg-surface-secondary">
      <div className="border-b border-border p-4">
        <EnryLogo size="sm" />
        <div className="mt-3">
          <StatusIndicator status={agentStatus} />
        </div>
      </div>
      <div className="border-b border-border p-4">
        <div className="mb-3 flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Memory Log
          </h3>
        </div>
        <div className="space-y-2">
          {memoryItems.map((item, index) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="rounded border border-border/50 bg-surface-elevated p-2"
            >
              <p className="text-xs text-foreground">{item.content}</p>
              <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                {item.time}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
      <div className="border-b border-border p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wrench className="h-4 w-4 text-accent" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Active Tools
          </h3>
        </div>
        <div className="space-y-1">
          {activeTools.map((tool) => (
            <div
              key={tool.name}
              className={`flex items-center gap-2 rounded px-2 py-1.5 ${
                tool.active ? 'bg-surface-elevated' : ''
              }`}
            >
              <tool.icon
                className={`h-3.5 w-3.5 ${
                  tool.active ? 'text-primary' : 'text-muted-foreground'
                }`}
              />
              <span
                className={`text-xs ${
                  tool.active ? 'text-foreground' : 'text-muted-foreground'
                }`}
              >
                {tool.name}
              </span>
              {tool.active && (
                <div className="ml-auto h-1.5 w-1.5 rounded-full bg-primary" />
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="border-b border-border p-4">
        <div className="mb-3 flex items-center gap-2">
          <History className="h-4 w-4 text-warning" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Recent Actions
          </h3>
        </div>
        <div className="space-y-2">
          {recentActions.map((item, index) => (
            <div key={index} className="flex items-center justify-between text-xs">
              <span className="text-foreground">{item.action}</span>
              <span
                className={`font-mono text-[10px] ${
                  item.status === 'running'
                    ? 'text-warning'
                    : 'text-muted-foreground'
                }`}
              >
                {item.status}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto p-4">
        <div className="mb-3 flex items-center gap-2">
          <Activity className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            System Metrics
          </h3>
        </div>
        <div className="space-y-3">
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Cpu className="h-3 w-3" /> CPU
              </span>
              <span className="font-mono text-foreground">34%</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-surface-elevated">
              <motion.div
                className="h-full bg-primary"
                initial={{ width: 0 }}
                animate={{ width: '34%' }}
                transition={{ duration: 1, ease: 'easeOut' }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Database className="h-3 w-3" /> Memory
              </span>
              <span className="font-mono text-foreground">2.4GB</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-surface-elevated">
              <motion.div
                className="h-full bg-accent"
                initial={{ width: 0 }}
                animate={{ width: '48%' }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.2 }}
              />
            </div>
          </div>
          <div>
            <div className="mb-1 flex justify-between text-xs">
              <span className="flex items-center gap-1 text-muted-foreground">
                <Zap className="h-3 w-3" /> Tokens
              </span>
              <span className="font-mono text-foreground">12.4K</span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-surface-elevated">
              <motion.div
                className="h-full bg-warning"
                initial={{ width: 0 }}
                animate={{ width: '62%' }}
                transition={{ duration: 1, ease: 'easeOut', delay: 0.4 }}
              />
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
