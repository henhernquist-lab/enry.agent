'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, Monitor, Eye, ArrowLeft, Activity as ActivityIcon } from 'lucide-react'
import Link from 'next/link'
import type { RoomDefinition, FocusTarget, Activity } from './types'
import { ACTIVITY_CONFIG } from './constants'

interface RoomOverlayProps {
  room: RoomDefinition
  focusedTarget: string | null
  onReset: () => void
  onFocus: (target: FocusTarget) => void
  activityLabel?: Activity
}

/**
 * HTML overlay — sits on top of the 3D canvas (pointer-events: none on
 * the container, pointer-events: auto on interactive elements). Provides
 * room context, focus shortcuts, and camera reset.
 */
export function RoomOverlay({ room, focusedTarget, onReset, onFocus, activityLabel }: RoomOverlayProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex flex-col justify-between p-6">
      {/* Top bar — room name + back link */}
      <div className="flex items-start justify-between">
        <div className="pointer-events-auto">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-secondary/80 px-3 py-1.5 font-mono text-xs text-muted-foreground backdrop-blur transition-colors hover:text-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            back to enry
          </Link>
        </div>
        <div className="pointer-events-auto flex items-center gap-3 rounded-lg border border-border bg-surface-secondary/80 px-4 py-2 backdrop-blur">
          <span className="relative flex h-2 w-2 items-center justify-center">
            <span className="h-2 w-2 rounded-full bg-primary shadow-[0_0_6px_rgba(58,158,96,0.6)]" />
          </span>
          <span className="font-mono text-xs font-medium text-foreground">{room.name}</span>
          {activityLabel && activityLabel !== 'idle' && (
            <span className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-primary/70">
              <ActivityIcon className="h-2.5 w-2.5" />
              {ACTIVITY_CONFIG[activityLabel].label}
            </span>
          )}
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
            {room.description}
          </span>
        </div>
      </div>

      {/* Bottom bar — focus targets + reset */}
      <div className="flex items-end justify-between">
        <div className="pointer-events-auto flex flex-col gap-2">
          <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/50">
            Focus
          </span>
          <div className="flex items-center gap-2">
            {room.focusTargets.map((target) => (
              <button
                key={target.id}
                onClick={() => onFocus(target)}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[10px] backdrop-blur transition-all duration-200 ${
                  focusedTarget === target.id
                    ? 'border-primary/40 bg-primary/10 text-primary'
                    : 'border-border bg-surface-secondary/80 text-muted-foreground hover:border-primary/20 hover:text-foreground'
                }`}
              >
                {target.id === 'monitor' ? (
                  <Monitor className="h-3 w-3" />
                ) : (
                  <Eye className="h-3 w-3" />
                )}
                {target.label}
              </button>
            ))}
          </div>
        </div>

        <div className="pointer-events-auto">
          <button
            onClick={onReset}
            className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-secondary/80 px-3 py-1.5 font-mono text-[10px] text-muted-foreground backdrop-blur transition-all duration-200 hover:border-primary/30 hover:text-primary"
          >
            <RotateCcw className="h-3 w-3" />
            Reset Camera
          </button>
        </div>
      </div>

      {/* Center hint — shows briefly when no target is focused */}
      <AnimatePresence>
        {!focusedTarget && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 1, duration: 0.5 }}
            className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
          >
            <p className="font-mono text-[10px] text-muted-foreground/30">
              drag to orbit · scroll to zoom · double-click desk to focus
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
