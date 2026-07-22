'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { BarChart3, Activity } from 'lucide-react'

export function ModelTabNav() {
  const pathname = usePathname()
  const isBenchmark = pathname.includes('/benchmark')
  const isHealth = pathname.includes('/health')

  return (
    <div className="mb-8 flex items-center gap-1 border-b border-border">
      <Link
        href="/models/benchmark"
        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-mono text-xs font-medium transition-colors ${
          isBenchmark
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        <BarChart3 className="h-3.5 w-3.5" />
        Benchmark
      </Link>
      <Link
        href="/models/health"
        className={`flex items-center gap-2 border-b-2 px-4 py-2.5 font-mono text-xs font-medium transition-colors ${
          isHealth
            ? 'border-primary text-primary'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        <Activity className="h-3.5 w-3.5" />
        Health
      </Link>
    </div>
  )
}
