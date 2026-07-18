import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Brain,
  Calculator,
  Coins,
  Crosshair,
  FileText,
  GitCompare,
  Library,
  Map as MapIcon,
  Newspaper,
  StickyNote,
} from 'lucide-react'
import { ClaimMap } from './claim-map'
import CasinoTab from './casino-tab'
import EnemiesTab from './enemies-tab'
import ReceiptsTab from './receipts-tab'
import GradeCalcTab from './grade-calc-tab'
import FlashcardsTab from './flashcards-tab'
import ArticlesTab from './articles-tab'
import QuickNotesTab from './quick-notes-tab'

// ── Learn tab-registration contract ────────────────────────────────────────
// THE single point for making a Learn feature openable as its own tab. To add
// one, append ONE entry to LEARN_TABS below — nothing else in the Learn page
// changes. The page reads this array to render the tab bar, the "+" menu, and
// the active tab's content; it hard-codes none of these ids.
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
  // Tab components must accept ZERO props (gemini-validated).
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
  // Freebuff / Map / Fog of War — Claude Code's earlier work.
  { id: 'map', label: 'Map', icon: MapIcon, defaultOpen: true, render: () => <ClaimMap /> },
  { id: 'diff', label: 'Diff', icon: GitCompare, render: () => <ComingSoon icon={GitCompare} description="What changed in your understanding over time. Not built yet." /> },
  { id: 'sources', label: 'Sources', icon: Library, render: () => <ComingSoon icon={Library} description="Where your claims came from, gathered in one place. Not built yet." /> },

  // Tonight's session — Casino / Enemy Claims / Receipts / Grade Calc, all
  // registered as zero-prop feature tabs that read fresh state from the API
  // on render (no props means the page doesn't know anything feature-specific).
  { id: 'casino', label: 'Casino', icon: Coins, render: () => <CasinoTab /> },
  { id: 'enemies', label: 'Enemies', icon: Crosshair, render: () => <EnemiesTab /> },
  { id: 'receipts', label: 'Receipts', icon: FileText, render: () => <ReceiptsTab /> },
  { id: 'grades', label: 'Grades', icon: Calculator, render: () => <GradeCalcTab /> },

  // Migrated from /tools — the learning-shaped tools that belong here, not
  // in the general tools panel. Each is a thin wrapper over the existing
  // tool component (mode="page"), so the source of truth stays in tools/
  // and `/resources/[slug]` continues to render the same components inline.
  // Flashcards: paste notes → Anki-style cards. The article-driven "Study
  // cards" flow above (saved articles' flashcards) reuses StudySession.
  { id: 'cards', label: 'Cards', icon: Brain, render: () => <FlashcardsTab /> },
  // Articles (Reading List): URL ingest → summary/claims/flashcards via
  // /api/article-notes. The ArticlesTab wraps the previously standalone
  // ingest form + saved list + StudySession overlay into one tab.
  { id: 'articles', label: 'Articles', icon: Newspaper, render: () => <ArticlesTab /> },
  // Quick Notes: zero-friction text capture into the `note` resource table.
  // Kept general-purpose — saves into the same `note` resource any panel
  // (Drive, enry lite, command palette's "new note") can read from later.
  { id: 'notes', label: 'Notes', icon: StickyNote, render: () => <QuickNotesTab /> },
]

export function getLearnTab(id: string): LearnTabDef | undefined {
  return LEARN_TABS.find((t) => t.id === id)
}
