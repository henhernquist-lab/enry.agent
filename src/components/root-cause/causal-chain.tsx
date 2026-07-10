'use client'

import { ArrowDown, ShieldCheck, Target } from 'lucide-react'
import type { CausalLayer } from '@/lib/resources'

interface CausalChainProps {
  chain: CausalLayer[]
  rootCause: string
  preventions: string[]
}

// The final output: surface → root, top to bottom, then the root-cause
// statement and system-level preventions.
export function CausalChainView({ chain, rootCause, preventions }: CausalChainProps) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {chain.map((layer, i) => (
          <div key={layer.layer} className="space-y-2">
            <div className="rounded-lg border border-border bg-surface-secondary p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 font-mono text-[10px] font-semibold text-primary">
                  {layer.layer}
                </span>
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                  {i === 0 ? 'surface' : `why #${layer.layer}`}
                  {!layer.accepted_by_user && ' · unverified'}
                </span>
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{layer.cause}</p>
              {layer.evidence.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {layer.evidence.map((e, j) => (
                    <li key={j} className="font-mono text-[10px] leading-snug text-muted-foreground">— {e}</li>
                  ))}
                </ul>
              )}
            </div>
            {i < chain.length - 1 && (
              <div className="flex justify-center">
                <ArrowDown className="h-4 w-4 text-muted-foreground/40" />
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-primary/40 bg-primary/5 p-4">
        <div className="mb-1.5 flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-primary" />
          <span className="font-mono text-[9px] uppercase tracking-wider text-primary">root cause</span>
        </div>
        <p className="text-sm font-medium leading-relaxed text-foreground">{rootCause}</p>
      </div>

      {preventions.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-secondary p-4">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">preventions</span>
          </div>
          <ul className="space-y-2">
            {preventions.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-sm leading-relaxed text-foreground/90">
                <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-primary" />
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
