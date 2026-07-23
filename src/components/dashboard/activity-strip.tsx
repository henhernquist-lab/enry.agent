'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/card'

const MOCK_EVENTS = [
  { mode: 'Drive', task: 'Editing src/components/card.tsx' },
  { mode: 'Cruise', task: 'Scanning henhernquist-lab/enry.agent' },
  { mode: 'Learn', task: 'Reviewing spaced-repetition claims' },
  { mode: 'Chat', task: 'Answering dashboard design question' },
  { mode: 'Lab', task: 'Evolving prompt for benchmark suite' },
  { mode: 'Memory', task: 'Storing new fact from chat' },
]

export function ActivityStrip() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((prev) => (prev + 1) % MOCK_EVENTS.length)
    }, 4500)
    return () => clearInterval(id)
  }, [])

  const current = MOCK_EVENTS[index]

  return (
    <Card padding="lg" className="h-full">
      <div className="mb-3 flex items-center gap-2">
        <span className="relative flex h-2.5 w-2.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary/70" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-primary" />
        </span>
        <h3 className="text-sm font-semibold text-foreground">Live activity</h3>
      </div>
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs text-muted-foreground">Current mode</p>
          <p className="text-lg font-semibold text-foreground">{current.mode}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted-foreground">Current task</p>
          <p className="max-w-[16rem] text-sm text-foreground">{current.task}</p>
        </div>
      </div>
      <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-elevated">
        <div
          className="h-full bg-primary transition-all duration-500"
          style={{ width: `${((index + 1) / MOCK_EVENTS.length) * 100}%` }}
        />
      </div>
    </Card>
  )
}
