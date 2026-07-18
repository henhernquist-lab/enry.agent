'use client'

import { useCallback, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X } from 'lucide-react'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: React.ReactNode
  /** Height of the sheet as a dvh-based value. Default 50dvh */
  height?: string
}

export function BottomSheet({ open, onClose, title, children, height = '50dvh' }: BottomSheetProps) {
  const backdropRef = useRef<HTMLDivElement>(null)

  const handleBackdrop = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (e.target === backdropRef.current) onClose()
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handler)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          ref={backdropRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={handleBackdrop}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            className="w-full max-w-lg overflow-hidden rounded-t-xl border border-b-0 border-border bg-surface-secondary shadow-2xl"
            style={{ maxHeight: height, height }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle + title */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="mx-auto h-1 w-10 rounded-full bg-muted-foreground/30" />
              <div className="flex w-full items-center justify-between">
                {title ? (
                  <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">
                    {title}
                  </span>
                ) : (
                  <span />
                )}
                <button
                  onClick={onClose}
                  className="rounded p-1 text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Content — scrollable */}
            <div className="overflow-y-auto scrollbar-hidden" style={{ height: `calc(${height} - 49px)` }}>
              {children}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
