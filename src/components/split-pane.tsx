'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { GripVertical, ChevronLeft, ChevronRight, Columns } from 'lucide-react'

interface SplitPaneProps {
  left: React.ReactNode
  right: React.ReactNode
  /** Split ratio (0-1), defaults to 0.5. Persisted to localStorage per key. */
  storageKey?: string
}

const SPLIT_STORAGE_KEY = 'golem.splitRatio.v1'

export function SplitPane({ left, right, storageKey = SPLIT_STORAGE_KEY }: SplitPaneProps) {
  const [ratio, setRatio] = useState(0.5)
  const [isDragging, setIsDragging] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [activePane, setActivePane] = useState<'left' | 'right'>('left')
  const containerRef = useRef<HTMLDivElement>(null)

  // Load persisted ratio
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) {
        const parsed = parseFloat(saved)
        if (Number.isFinite(parsed) && parsed > 0.1 && parsed < 0.9) {
          setRatio(parsed)
        }
      }
    } catch {
      /* localStorage unavailable */
    }
  }, [storageKey])

  // Persist ratio
  const persistRatio = useCallback(
    (r: number) => {
      try {
        localStorage.setItem(storageKey, String(r))
      } catch {
        /* noop */
      }
    },
    [storageKey],
  )

  // Drag handlers
  const handleMouseDown = useCallback(() => {
    setIsDragging(true)
  }, [])

  useEffect(() => {
    if (!isDragging) return

    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const r = Math.max(0.2, Math.min(0.8, x / rect.width))
      setRatio(r)
    }

    const handleMouseUp = () => {
      setIsDragging(false)
      persistRatio(ratio)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isDragging, persistRatio, ratio])

  // Detect narrow viewport
  const [isNarrow, setIsNarrow] = useState(false)
  useEffect(() => {
    const check = () => setIsNarrow(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Narrow viewport: single pane with tab switcher
  if (isNarrow) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-surface-base">
        {/* Tab bar */}
        <div className="flex border-b border-border bg-surface-secondary">
          <button
            onClick={() => setActivePane('left')}
            className={`flex-1 px-4 py-2.5 text-center font-mono text-xs transition-colors ${
              activePane === 'left'
                ? 'border-b-2 border-primary text-primary bg-surface-elevated'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Pane A
          </button>
          <button
            onClick={() => setActivePane('right')}
            className={`flex-1 px-4 py-2.5 text-center font-mono text-xs transition-colors ${
              activePane === 'right'
                ? 'border-b-2 border-primary text-primary bg-surface-elevated'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Pane B
          </button>
        </div>
        {/* Active pane */}
        <div className="flex-1 overflow-hidden">
          {activePane === 'left' ? left : right}
        </div>
      </div>
    )
  }

  // Desktop: resizable split
  return (
    <div ref={containerRef} className="flex flex-1 overflow-hidden bg-surface-base">
      {/* Left pane */}
      <div className="overflow-hidden" style={{ flex: `0 0 ${ratio * 100}%` }}>
        {left}
      </div>

      {/* Divider */}
      <div
        className={`relative flex w-2 flex-shrink-0 cursor-col-resize flex-col items-center justify-center border-x border-border bg-surface-secondary transition-colors ${
          isDragging ? 'bg-primary/10 border-primary/30' : 'hover:bg-surface-elevated hover:border-primary/20'
        }`}
        onMouseDown={handleMouseDown}
      >
        <GripVertical className="h-4 w-4 text-muted-foreground/60" />
      </div>

      {/* Right pane */}
      <div className="overflow-hidden" style={{ flex: `1 1 ${(1 - ratio) * 100}%` }}>
        {right}
      </div>
    </div>
  )
}
