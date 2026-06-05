'use client'

import { motion } from 'framer-motion'

interface StatusIndicatorProps {
  status: 'online' | 'thinking' | 'executing' | 'idle'
}

const statusConfig = {
  online: {
    color: 'bg-primary',
    glow: 'shadow-[0_0_10px_rgba(0,255,102,0.5)]',
    label: 'Online',
    pulseSpeed: 'duration-[3000ms]',
  },
  thinking: {
    color: 'bg-accent',
    glow: 'shadow-[0_0_10px_rgba(0,200,255,0.5)]',
    label: 'Thinking',
    pulseSpeed: 'duration-[1000ms]',
  },
  executing: {
    color: 'bg-warning',
    glow: 'shadow-[0_0_10px_rgba(255,184,0,0.5)]',
    label: 'Executing',
    pulseSpeed: 'duration-[500ms]',
  },
  idle: {
    color: 'bg-muted-foreground',
    glow: 'shadow-[0_0_5px_rgba(156,163,175,0.3)]',
    label: 'Idle',
    pulseSpeed: 'duration-[4000ms]',
  },
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const config = statusConfig[status]

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <motion.div
          className={`h-2 w-2 rounded-full ${config.color} ${config.glow}`}
          animate={{
            scale: [1, 1.2, 1],
            opacity: [1, 0.7, 1],
          }}
          transition={{
            duration: status === 'executing' ? 0.5 : status === 'thinking' ? 1 : 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
        <motion.div
          className={`absolute inset-0 h-2 w-2 rounded-full ${config.color} opacity-30`}
          animate={{
            scale: [1, 2, 1],
            opacity: [0.3, 0, 0.3],
          }}
          transition={{
            duration: status === 'executing' ? 0.5 : status === 'thinking' ? 1 : 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        />
      </div>
      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {config.label}
      </span>
    </div>
  )
}
