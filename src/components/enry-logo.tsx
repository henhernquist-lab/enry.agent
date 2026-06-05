'use client'

import { motion } from 'framer-motion'

interface EnryLogoProps {
  size?: 'sm' | 'md' | 'lg'
  animated?: boolean
}

export function EnryLogo({ size = 'md', animated = true }: EnryLogoProps) {
  const sizeClasses = {
    sm: 'text-lg',
    md: 'text-2xl',
    lg: 'text-4xl',
  }

  const Wrapper = animated ? motion.div : 'div'
  const wrapperProps = animated
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        transition: { duration: 0.5 },
      }
    : {}

  return (
    <Wrapper {...wrapperProps} className="flex items-center gap-2">
      <div className="relative">
        <motion.div
          className="flex h-8 w-8 items-center justify-center rounded border border-primary/30 bg-surface-secondary"
          animate={
            animated
              ? {
                  boxShadow: [
                    '0 0 0px rgba(0,255,102,0.2)',
                    '0 0 15px rgba(0,255,102,0.3)',
                    '0 0 0px rgba(0,255,102,0.2)',
                  ],
                }
              : {}
          }
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: 'easeInOut',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none" className="h-5 w-5" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" className="fill-primary/20 stroke-primary" />
            <path d="M2 17L12 22L22 17" className="stroke-primary" />
            <path d="M2 12L12 17L22 12" className="stroke-primary/60" />
          </svg>
        </motion.div>
      </div>
      <div className={`font-display font-bold tracking-tight ${sizeClasses[size]}`}>
        <span className="text-foreground">ENRY</span>
        <span className="text-primary">.</span>
        <span className="text-foreground">AGENT</span>
      </div>
    </Wrapper>
  )
}
