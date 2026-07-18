import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { GitCompare, Library, Map as MapIcon } from 'lucide-react'
import { ClaimMap } from './claim-map'

// ── Learn tab-registration contract ────────────────────────────────────────
// THE single point for making a Learn feature openable as its own tab. To add
// one (Confidence Casino, Enemy Claims dashboard, Receipts log, ...), append
// ONE entry to LEARN_TABS below — nothing else in the Learn page changes. The
// page reads this array to render the tab bar, the "+" menu, and the active
// tab's content; it hard-codes none of these ids.
//
// Chat is deliberately NOT in this registry: it's the fixed home tab that
// hosts the shared input box, session id, and pending-probe state, so it can't
// be closed and isn't opened from "+". Everything that ISN'T the chat console
// is a registered feature tab (enforcing the "every feature is its own tab"
// rule — LLM skills are the only in-Chat exception, per spec).
export interface LearnTabDef {
  id: string
  label: string
  icon: LucideIcon
  // Open (and closeable) on first load without needing the "+" menu. Omit for
  // a tab that starts closed and is opened on demand.
  defaultOpen?: boolean
  // The tab's content. A thunk (not a component ref) so a tab can pass its own
  // props/config here without the page knowing anything feature-specific.
  render: () => ReactNode
}

function ComingSoon({ icon: Icon, description }: { icon: LucideIcon; description: string }) {
  return (
    <div className="flex flex-1 items-center justify-center">
      <div className="flex max-w-xs flex-col items-center gap-3 text-center">
        <div className="rounded-full border border-border bg-surface-secondary p-4">
          <Icon className="h-6 w-6 text-muted-foreground/40" />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/50">Coming soon</p>
        <p className="font-sans text-[12px] leading-relaxed text-muted-foreground/40">{description}</p>
      </div>
    </div>
  )
}

export const LEARN_TABS: LearnTabDef[] = [
  { id: 'map', label: 'Map', icon: MapIcon, defaultOpen: true, render: () => <ClaimMap /> },
  { id: 'diff', label: 'Diff', icon: GitCompare, render: () => <ComingSoon icon={GitCompare} description="What changed in your understanding over time. Not built yet." /> },
  { id: 'sources', label: 'Sources', icon: Library, render: () => <ComingSoon icon={Library} description="Where your claims came from, gathered in one place. Not built yet." /> },
]

export function getLearnTab(id: string): LearnTabDef | undefined {
  return LEARN_TABS.find((t) => t.id === id)
}
