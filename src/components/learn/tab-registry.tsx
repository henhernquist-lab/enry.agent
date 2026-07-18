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
import { SourcesPanel } from './sources-panel'
import { KnowledgeDiff } from './knowledge-diff'
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

export const LEARN_TABS: LearnTabDef[] = [
  // Freebuff / Map / Fog of War — Claude Code's earlier work.
  { id: 'map', label: 'Map', icon: MapIcon, defaultOpen: true, render: () => <ClaimMap /> },
  { id: 'diff', label: 'Diff', icon: GitCompare, render: () => <KnowledgeDiff /> },
  { id: 'sources', label: 'Sources', icon: Library, render: () => <SourcesPanel /> },

  // Casino / Enemy Claims / Receipts / Grade Calc — all registered as
  // zero-prop feature tabs that read fresh state from the API on render (no
  // props means the page doesn't know anything feature-specific).
  { id: 'casino', label: 'Casino', icon: Coins, render: () => <CasinoTab /> },
  { id: 'enemies', label: 'Enemies', icon: Crosshair, render: () => <EnemiesTab /> },
  { id: 'receipts', label: 'Receipts', icon: FileText, render: () => <ReceiptsTab /> },
  { id: 'grades', label: 'Grades', icon: Calculator, render: () => <GradeCalcTab /> },

  // Migrated from /tools — the learning-shaped tools that belong here, not
  // in the general tools panel. Each is a thin wrapper over the existing
  // tool component (mode="page"), so the source of truth stays in tools/
  // and `/resources/[slug]` continues to render the same components inline.
  //
  // Flashcards: paste notes → Anki-style cards. NOT wired to the `learn`
  // verb's claim-extraction path — this is a deliberate, documented split,
  // not an oversight. FlashcardGenerator saves to `resources` (type=
  // 'flashcards': static Q/A pairs, no spaced repetition), while `learn`
  // saves to `claims` (probed, gap-analyzed, defend/teach/retire-eligible,
  // visible in Sources/Diff/Ambient). Cards is a lightweight, disposable
  // study tool; `learn` is the durable path. If you want notes to actually
  // join the claim system, use `learn "<topic>"` in Chat instead.
  { id: 'cards', label: 'Cards', icon: Brain, render: () => <FlashcardsTab /> },
  // Articles (Reading List): URL ingest → summary/claims/flashcards via
  // /api/article-notes, saved as `resources` (type='article_note') — the
  // SAME resource this tab writes to is what Sources' "Imports" section
  // reads (by provenance). Not redundant: this tab is the workspace for
  // creating/managing article notes and running study sessions; Sources
  // browses them by where they came from and lets you pin custody.
  { id: 'articles', label: 'Articles', icon: Newspaper, render: () => <ArticlesTab /> },
  // Quick Notes: zero-friction text capture into the `note` resource table.
  // Kept general-purpose — saves into the same `note` resource any panel
  // (Drive, enry lite, command palette's "new note") can read from later.
  { id: 'notes', label: 'Notes', icon: StickyNote, render: () => <QuickNotesTab /> },
]

export function getLearnTab(id: string): LearnTabDef | undefined {
  return LEARN_TABS.find((t) => t.id === id)
}
