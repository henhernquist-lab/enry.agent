'use client'

import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

interface ModalShellProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  onClose: () => void
  width?: string
  children: ReactNode
}

export function ModalShell({ title, subtitle, icon, onClose, width = 'w-[480px]', children }: ModalShellProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className={`relative flex max-h-[85vh] ${width} flex-col rounded border border-border bg-surface-secondary shadow-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="flex min-w-0 items-center gap-2.5">
            {icon !== undefined && (
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-primary/30 bg-primary/10">
                {icon}
              </div>
            )}
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
              {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
          <button onClick={onClose} className="ml-3 flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-surface-elevated">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 scrollbar-hidden">{children}</div>
      </motion.div>
    </motion.div>
  )
}
