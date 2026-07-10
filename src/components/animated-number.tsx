'use client'

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'

interface AnimatedNumberProps {
  value: number
  className?: string
}

// Small roll/fade swap on value change — not a heavy counting library, just
// an AnimatePresence key swap on the digits themselves. Deliberately quick
// (150ms) and small (4px) so it reads as "the number updated," not a stunt.
export function AnimatedNumber({ value, className }: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion()

  if (reduceMotion) return <span className={className}>{value}</span>

  return (
    <span className={`relative inline-grid overflow-hidden ${className ?? ''}`}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          initial={{ y: 8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -8, opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.2, 0, 0, 1] }}
          className="col-start-1 row-start-1"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
