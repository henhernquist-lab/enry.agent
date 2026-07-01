'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  Pause,
  MessageCircle,
  AlertCircle,
  ArrowRight,
  ChevronRight,
} from 'lucide-react'
import type { ActivityEvent } from '@/lib/chat-history'

interface RightPanelProps {
  agentStatus: 'online' | 'thinking' | 'executing' | 'idle'
  activities: ActivityEvent[]
  streamingText: string
  currentModel: string
}

const iconMap: Record<ActivityEvent['type'], typeof MessageCircle> = {
  'user-sent': MessageCircle,
  'assistant-start': ChevronRight,
  'assistant-complete': ChevronRight,
  error: AlertCircle,
}

const labelMap: Record<ActivityEvent['type'], string> = {
  'user-sent': 'You sent a message',
  'assistant-start': 'Agent started responding',
  'assistant-complete': 'Agent finished responding',
  error: 'Error',
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour12: false })
}

export function RightPanel({ agentStatus, activities, streamingText, currentModel }: RightPanelProps) {
  const isActive = agentStatus === 'thinking' || agentStatus === 'executing'

  return (
    <aside className="flex h-full w-[320px] flex-col border-l border-border bg-surface-secondary">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              {isActive ? (
                <Play className="h-4 w-4 text-primary" />
              ) : (
                <Pause className="h-4 w-4 text-muted-foreground" />
              )}
              {isActive && (
                <motion.div
                  className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning"
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1, repeat: Infinity }}
                />
              )}
            </div>
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live Execution
            </h3>
          </div>
          <span className={`font-mono text-[10px] ${isActive ? 'text-warning' : 'text-muted-foreground'}`}>
            {isActive ? agentStatus : 'idle'}
          </span>
        </div>
        <p className="mt-2 truncate font-mono text-[10px] text-muted-foreground">
          model: <span className="text-primary">{currentModel}</span>
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 scrollbar-hidden">
        <div className="mb-3 flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-accent" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Activity Timeline
          </h3>
        </div>
        {activities.length === 0 ? (
          <p className="text-xs text-muted-foreground">No activity yet. Send a message to get started.</p>
        ) : (
          <div className="relative">
            <div className="absolute bottom-0 left-[7px] top-0 w-px bg-border" />
            <div className="space-y-3">
              <AnimatePresence initial={false}>
                {activities.map((item) => {
                  const Icon = iconMap[item.type]
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="relative flex gap-3 pl-6"
                    >
                      <div className="absolute left-0 top-1">
                        <div
                          className={`flex h-3.5 w-3.5 items-center justify-center rounded-full border bg-surface-elevated ${
                            item.type === 'error' ? 'border-warning' : 'border-border'
                          }`}
                        >
                          <Icon className={`h-2 w-2 ${item.type === 'error' ? 'text-warning' : 'text-muted-foreground'}`} />
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs leading-relaxed text-foreground">
                          {labelMap[item.type]}
                          {item.model ? ` · ${item.model}` : ''}
                        </p>
                        {item.content && (
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{item.content}</p>
                        )}
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{formatTime(item.at)}</p>
                      </div>
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-border p-4">
        <div className="mb-2 flex items-center gap-2">
          <ChevronRight className="h-4 w-4 text-primary" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Streaming Output
          </h3>
        </div>
        {streamingText ? (
          <motion.div
            className="max-h-32 overflow-y-auto rounded border border-warning/20 bg-warning/5 p-3 scrollbar-hidden"
            animate={{
              borderColor: ['rgba(255,184,0,0.2)', 'rgba(255,184,0,0.4)', 'rgba(255,184,0,0.2)'],
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">{streamingText}</p>
          </motion.div>
        ) : (
          <div className="rounded border border-border bg-surface-elevated p-3">
            <p className="text-xs text-muted-foreground">Waiting for input...</p>
          </div>
        )}
      </div>
    </aside>
  )
}
