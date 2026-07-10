'use client'

import { type Easing, motion, useReducedMotion } from 'framer-motion'

interface StatusIndicatorProps {
  status: 'online' | 'thinking' | 'streaming' | 'error' | 'idle'
}

const statusConfig: Record<string, {
  color: string
  glow: string
  label: string
  pulseDuration: number
  ringDuration: number
  hideRing?: boolean
}> = {
  online: {
    color: 'bg-primary',
    glow: 'shadow-[0_0_10px_rgba(0,255,102,0.5)]',
    label: 'Online',
    pulseDuration: 3,
    ringDuration: 3,
  },
  thinking: {
    color: 'bg-accent',
    glow: 'shadow-[0_0_10px_rgba(0,200,255,0.5)]',
    label: 'Thinking',
    pulseDuration: 1.2,
    ringDuration: 1.2,
  },
  streaming: {
    color: 'bg-primary',
    glow: 'shadow-[0_0_10px_rgba(0,255,102,0.5)]',
    label: 'Responding',
    pulseDuration: 0.6,
    ringDuration: 0.6,
    hideRing: true,
  },
  error: {
    color: 'bg-destructive',
    glow: 'shadow-[0_0_10px_rgba(255,77,77,0.5)]',
    label: 'Error',
    pulseDuration: 0.3,
    ringDuration: 0.3,
  },
  idle: {
    color: 'bg-primary',
    glow: 'shadow-[0_0_8px_rgba(0,255,102,0.3)]',
    label: 'Online',
    pulseDuration: 3.5,
    ringDuration: 3.5,
  },
}

export function StatusIndicator({ status }: StatusIndicatorProps) {
  const reduceMotion = useReducedMotion()
  const config = statusConfig[status] ?? statusConfig.idle
  const breathEasing: Easing = [0.05, 0.7, 0.1, 1]

  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <motion.div
          className={`h-2 w-2 rounded-full ${config.color} ${config.glow}`}
          animate={reduceMotion ? { opacity: 1 } : {
            scale: [1, 1.2, 1],
            opacity: status === 'streaming' ? [0.9, 0.5, 0.9] : [1, 0.7, 1],
          }}
          transition={reduceMotion ? { duration: 0 } : {
            duration: config.pulseDuration,
            repeat: Infinity,
            ease: breathEasing,
          }}
        />
        {!config.hideRing && (
          <motion.div
            className={`absolute inset-0 h-2 w-2 rounded-full ${config.color} opacity-30`}
            animate={reduceMotion ? { opacity: 0 } : {
              scale: [1, 2, 1],
              opacity: [0.3, 0, 0.3],
            }}
            transition={reduceMotion ? { duration: 0 } : {
              duration: config.ringDuration,
              repeat: Infinity,
              ease: breathEasing,
            }}
          />
        )}
      </div>
      <span role="status" aria-live="polite" className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {config.label}
      </span>
    </div>
  )
}
