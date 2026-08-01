'use client'

import { useGolemModel } from '@/lib/golem-signals'
import type { GolemState } from '@/lib/golem-mascot'
import { GolemFigure } from './golem-figure'

interface GolemInlineProps {
  state?: GolemState
  /** Rendered box in px. Below ~40 the face stops reading; prefer 48+. */
  size?: number
  /** Gentle CSS bob. Off for purely decorative placements that sit in text. */
  bob?: boolean
  /** Halves the bob rate — reads as asleep rather than alert. */
  slow?: boolean
  className?: string
}

/**
 * Golem standing still somewhere in the layout — empty states, the login
 * centerpiece, the 404, the chat thinking indicator.
 *
 * Deliberately animation-only-in-CSS: no rAF, no motion engine, nothing to
 * clean up, so a page can mount several without paying for any of the
 * floating mascot's machinery. It also ignores the "Show Golem" preference —
 * that toggle governs the *floating* mascot, not artwork that a layout is
 * composed around.
 */
export function GolemInline({
  state = 'idle',
  size = 72,
  bob = true,
  slow = false,
  className = '',
}: GolemInlineProps) {
  const modelId = useGolemModel()

  return (
    <div
      aria-hidden="true"
      className={`${bob ? 'golem-inline-bob' : ''} ${slow ? 'golem-inline-bob-slow' : ''} ${className}`}
      style={{ width: size, height: size }}
    >
      <GolemFigure state={state} modelId={modelId} className="h-full w-full" />
    </div>
  )
}
