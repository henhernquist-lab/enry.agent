'use client'

import { motion } from 'framer-motion'
import { Swords, X } from 'lucide-react'

// The in-chat signal that a skill is active. Restrained, mono, terminal-flavored
// — a thin warning-toned rail across the top of the conversation with a phase
// tracker and an exit affordance. No glow.
export function SkillBanner({
  names,
  name,
  phaseLabel,
  completed,
  total,
  waitingForInput,
  hint,
  onExit,
}: {
  names?: string[]
  name?: string
  phaseLabel: string
  completed: number
  total: number
  waitingForInput: boolean
  hint?: string
  onExit: () => void
}) {
  // Support both single-skill (name) and multi-skill (names) display.
  const displayNames = names ?? (name ? [name] : [])
  const isMulti = displayNames.length > 1

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      className="border-b border-warning/40 bg-warning/[0.06]"
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 px-8 py-2">
        <Swords className="h-3.5 w-3.5 flex-shrink-0 text-warning" />
        {isMulti ? (
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-warning">
            {displayNames.join(' + ')}
          </span>
        ) : (
          <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-warning">
            {displayNames[0]}
          </span>
        )}
        <span className="text-warning/40">·</span>

        {waitingForInput ? (
          <span className="truncate font-mono text-[11px] text-muted-foreground">
            {hint ?? 'waiting for your input…'}
          </span>
        ) : (
          <>
            <span className="font-mono text-[11px] text-muted-foreground">{phaseLabel}</span>
            <div className="flex items-center gap-1">
              {Array.from({ length: total }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 w-1.5 rounded-full ${
                    i < completed ? 'bg-warning' : i === completed ? 'bg-warning/50' : 'bg-border'
                  }`}
                />
              ))}
            </div>
          </>
        )}

        <button
          onClick={onExit}
          className="ml-auto flex items-center gap-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-warning/40 hover:text-warning"
          title="Exit skill (or type /exit)"
        >
          <X className="h-3 w-3" />
          exit
        </button>
      </div>
    </motion.div>
  )
}
