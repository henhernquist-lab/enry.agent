'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { motion, useReducedMotion } from 'framer-motion'
import { useAgentBusy } from '@/lib/agent-presence'

// Ambient "enry is here" signal — bottom-right, always present on
// authenticated pages. Deliberately not a button: no click behavior, no
// menu, no unread-badge energy. At rest it should be nearly subconscious;
// only the busy state should draw any real attention.
export function PresenceIndicator() {
  const busy = useAgentBusy()
  const [hovered, setHovered] = useState(false)
  const reduceMotion = useReducedMotion()
  const pathname = usePathname()

  const breathDuration = busy ? 1.1 : 3.5
  const ringDuration = busy ? 1.1 : 3.5

  if (pathname === '/login') return null

  return (
    <div
      className="pointer-events-auto fixed bottom-5 right-5 z-40 flex items-center justify-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-hidden="true"
    >
      {hovered && (
        <motion.span
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.15, ease: [0, 0, 0.2, 1] }}
          className="absolute right-6 mr-1 whitespace-nowrap rounded border border-border bg-surface-elevated px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground shadow-lg"
        >
          {busy ? 'Working…' : 'Idle'}
        </motion.span>
      )}

      {/* Layer 1 — static glow */}
      <div
        className={`absolute h-5 w-5 rounded-full blur-md transition-colors duration-500 ${
          busy ? 'bg-primary/40' : 'bg-primary/15'
        }`}
      />

      {/* Layer 3 — breathing ring */}
      <motion.div
        className={`absolute h-2 w-2 rounded-full ${busy ? 'bg-primary/40' : 'bg-primary/25'}`}
        animate={reduceMotion ? {} : { scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: ringDuration, repeat: Infinity, ease: [0.05, 0.7, 0.1, 1] }}
      />

      {/* Layer 2 — core dot */}
      <motion.div
        className="relative h-2 w-2 rounded-full bg-primary"
        animate={reduceMotion ? { opacity: 1 } : { scale: [1, 1.15, 1], opacity: [0.85, 1, 0.85] }}
        transition={{ duration: breathDuration, repeat: Infinity, ease: [0.05, 0.7, 0.1, 1] }}
      />
    </div>
  )
}
