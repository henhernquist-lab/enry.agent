'use client'

import { motion, AnimatePresence } from 'framer-motion'
import {
  Play,
  CheckCircle2,
  Loader2,
  Clock,
  ChevronRight,
  Code2,
  Search,
  FileText,
  Lightbulb,
  ArrowRight,
} from 'lucide-react'

interface Task {
  id: string
  name: string
  status: 'running' | 'completed' | 'pending' | 'queued'
  type: 'tool' | 'reasoning' | 'action'
  time?: string
  details?: string
}

interface ActivityItem {
  id: string
  type: 'tool_call' | 'reasoning' | 'action' | 'output'
  content: string
  timestamp: string
  icon: 'search' | 'code' | 'file' | 'thought'
}

const tasks: Task[] = [
  { id: '1', name: 'Analyzing user request', status: 'completed', type: 'reasoning', time: '0.3s' },
  { id: '2', name: 'web_search("market trends 2024")', status: 'completed', type: 'tool', time: '1.2s' },
  { id: '3', name: 'Processing 12 search results', status: 'running', type: 'action', details: '8 of 12 processed' },
  { id: '4', name: 'Generate summary report', status: 'pending', type: 'action' },
  { id: '5', name: 'Format output', status: 'queued', type: 'action' },
]

const activityFeed: ActivityItem[] = [
  { id: '1', type: 'reasoning', content: 'Breaking down task into subtasks for parallel execution', timestamp: '14:32:05', icon: 'thought' },
  { id: '2', type: 'tool_call', content: 'Initiated web search for market analysis data', timestamp: '14:32:06', icon: 'search' },
  { id: '3', type: 'action', content: 'Parsing HTML content from 12 sources', timestamp: '14:32:08', icon: 'code' },
  { id: '4', type: 'output', content: 'Extracted 847 data points for analysis', timestamp: '14:32:12', icon: 'file' },
  { id: '5', type: 'reasoning', content: 'Identifying key trends and patterns in dataset', timestamp: '14:32:14', icon: 'thought' },
]

const iconMap = {
  search: Search,
  code: Code2,
  file: FileText,
  thought: Lightbulb,
}

const statusConfig = {
  running: {
    icon: Loader2,
    color: 'text-warning',
    bgColor: 'bg-warning/10',
    borderColor: 'border-warning/30',
    animate: true,
  },
  completed: {
    icon: CheckCircle2,
    color: 'text-primary',
    bgColor: 'bg-primary/10',
    borderColor: 'border-primary/30',
    animate: false,
  },
  pending: {
    icon: Clock,
    color: 'text-accent',
    bgColor: 'bg-accent/10',
    borderColor: 'border-accent/30',
    animate: false,
  },
  queued: {
    icon: ChevronRight,
    color: 'text-muted-foreground',
    bgColor: 'bg-muted/10',
    borderColor: 'border-border',
    animate: false,
  },
}

export function RightPanel() {
  return (
    <aside className="flex h-full w-[320px] flex-col border-l border-border bg-surface-secondary">
      <div className="border-b border-border p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Play className="h-4 w-4 text-primary" />
              <motion.div
                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning"
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
            </div>
            <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Live Execution
            </h3>
          </div>
          <span className="font-mono text-[10px] text-warning">3 active</span>
        </div>
      </div>
      <div className="border-b border-border p-4">
        <div className="space-y-2">
          <AnimatePresence>
            {tasks.map((task, index) => {
              const config = statusConfig[task.status]
              const StatusIcon = config.icon
              return (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className={`rounded border ${config.borderColor} ${config.bgColor} p-2`}
                >
                  <div className="flex items-start gap-2">
                    <StatusIcon
                      className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${config.color} ${
                        config.animate ? 'animate-spin' : ''
                      }`}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-foreground">{task.name}</p>
                      {task.details && (
                        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {task.details}
                        </p>
                      )}
                    </div>
                    {task.time && (
                      <span className="font-mono text-[10px] text-muted-foreground">{task.time}</span>
                    )}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 scrollbar-hidden">
        <div className="mb-3 flex items-center gap-2">
          <ArrowRight className="h-4 w-4 text-accent" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Activity Timeline
          </h3>
        </div>
        <div className="relative">
          <div className="absolute bottom-0 left-[7px] top-0 w-px bg-border" />
          <div className="space-y-3">
            {activityFeed.map((item, index) => {
              const Icon = iconMap[item.icon]
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="relative flex gap-3 pl-6"
                >
                  <div className="absolute left-0 top-1">
                    <div className="flex h-3.5 w-3.5 items-center justify-center rounded-full border border-border bg-surface-elevated">
                      <Icon className="h-2 w-2 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs leading-relaxed text-foreground">{item.content}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{item.timestamp}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="border-t border-border p-4">
        <div className="mb-2 flex items-center gap-2">
          <Lightbulb className="h-4 w-4 text-warning" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Current Reasoning
          </h3>
        </div>
        <motion.div
          className="rounded border border-warning/20 bg-warning/5 p-3"
          animate={{
            borderColor: [
              'rgba(255,184,0,0.2)',
              'rgba(255,184,0,0.4)',
              'rgba(255,184,0,0.2)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity }}
        >
          <p className="text-xs leading-relaxed text-foreground">
            Comparing market trends across sectors to identify correlation patterns. Will synthesize findings into executive summary format.
          </p>
        </motion.div>
      </div>
    </aside>
  )
}
