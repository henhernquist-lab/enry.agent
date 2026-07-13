'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { ChevronDown, Sun, BookOpen } from 'lucide-react'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import { BriefingCard } from './briefing-card'
import { ApertureCard } from './aperture-card'

// The "Today" band sits above chat on the homepage: the Chief of Staff
// briefing (primary, wider) beside The Aperture (narrower). Collapsible so it
// costs a single row once Henry has processed the morning and chat reclaims
// the viewport.
export function TodayBand() {
  const [collapsed, setCollapsed] = useState(false)
  const { status } = useSession()
  const [pendingRegrets, setPendingRegrets] = useState(0)

  useEffect(() => {
    if (status !== 'authenticated') return
    fetch('/api/tools/regrets?mode=pending')
      .then(r => r.json())
      .then(d => setPendingRegrets(d.pending ?? 0))
      .catch(() => {})
  }, [status])

  return (
    <div className="border-b border-border bg-surface-base/60">
      <div className="mx-auto w-full max-w-5xl px-6 py-4">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="mb-3 flex items-center gap-2 text-muted-foreground transition-colors hover:text-foreground"
        >
          <Sun className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[10px] uppercase tracking-[0.2em]">Today</span>
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          {pendingRegrets > 0 && (
            <Link href="/resources/regrets" className="ml-2 flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider text-primary/70 transition-colors hover:text-primary">
              <BookOpen className="h-3 w-3" />
              {pendingRegrets} PENDING
            </Link>
          )}
        </button>

        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            className="grid grid-cols-1 gap-4 lg:grid-cols-[1.6fr_1fr]"
          >
            <BriefingCard />
            <ApertureCard />
          </motion.div>
        )}
      </div>
    </div>
  )
}
