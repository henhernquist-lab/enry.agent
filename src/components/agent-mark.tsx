'use client'

import { motion } from 'framer-motion'

type Size = 'sm' | 'md'

const sizeMap: Record<Size, string> = {
  sm: 'text-[11px]',
  md: 'text-sm',
}

interface AgentMarkProps {
  size?: Size
  animated?: boolean
}

/**
 * Sleek minimal "E" monogram for the agent avatar.
 * Uses the display font (Space Grotesk) with tight tracking for a crisp
 * single-letter mark that sits inside the dark-matrix avatar bubble.
 *
 * Pass `animated` while the agent is actively streaming/responding to add a
 * subtle pulsing green glow on the letter — no spinners, no sparkles.
 */
export function AgentMark({ size = 'sm', animated = false }: AgentMarkProps) {
  const base = `font-display font-bold text-primary tracking-[-0.04em] select-none ${sizeMap[size]}`

  if (animated) {
    return (
      <motion.span
        className={base}
        aria-hidden="true"
        animate={{
          textShadow: [
            '0 0 0px rgba(0,255,102,0)',
            '0 0 6px rgba(0,255,102,0.55)',
            '0 0 0px rgba(0,255,102,0)',
          ],
        }}
        transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
      >
        E
      </motion.span>
    )
  }

  return (
    <span className={base} aria-hidden="true">
      E
    </span>
  )
}
