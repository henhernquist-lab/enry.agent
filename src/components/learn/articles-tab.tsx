'use client'

// Articles (Reading List) — moved into Learn as a tab.
// Re-uses the existing ArticleNotes / ArticleNotesSavedList / StudySession
// components from tools — the file already exports all three. The tab adds
// a tiny Library/Add sub-bar because the original ArticleNotes was designed
// to live as a standalone card (tools/library wrapper), not nested.
//
// Zero-prop pattern — matches grade-calc-tab.tsx and the rest of LEARN_TABS.

import { useCallback, useState } from 'react'
import { Library, Newspaper, Plus } from 'lucide-react'
import {
  ArticleNotes,
  ArticleNotesSavedList,
  StudySession,
} from '@/components/tools/article-notes'

type View = 'list' | 'add'

export default function ArticlesTab() {
  const [view, setView] = useState<View>('list')
  const [refreshKey, setRefreshKey] = useState(0)
  // Held at the tab level so the "Study all flashcards" button in the saved
  // list can pop the full-screen StudySession layered above the tab — the
  // per-session "Study these" inside each card still uses the saved list's
  // own internal StudySession, both pathways reach the same overlay.
  const [studyCards, setStudyCards] = useState<{ q: string; a: string }[] | null>(null)

  const handleSaved = useCallback(() => {
    setRefreshKey((k) => k + 1)
    setView('list')
  }, [])

  return (
    <div className="flex h-full flex-col overflow-hidden bg-background">
      <div className="flex flex-shrink-0 items-center gap-1.5 border-b border-border px-3 py-2">
        <button
          onClick={() => setView('list')}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
            view === 'list'
              ? 'border border-primary/40 bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Library className="h-3.5 w-3.5" /> Library
        </button>
        <button
          onClick={() => setView('add')}
          className={`flex items-center gap-1.5 rounded px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
            view === 'add'
              ? 'border border-primary/40 bg-primary/10 text-primary'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Plus className="h-3.5 w-3.5" /> Add article
        </button>
        <span className="ml-auto font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
          Reading
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-5 scrollbar-hidden">
        {view === 'list' ? (
          <div className="mx-auto max-w-3xl">
            <ArticleNotesSavedList
              refreshKey={refreshKey}
              onStudyAll={setStudyCards}
            />
          </div>
        ) : (
          <div className="mx-auto max-w-2xl">
            <div className="mb-3 flex items-center gap-2">
              <Newspaper className="h-4 w-4 text-primary" />
              <h2 className="font-mono text-sm text-foreground">Save a new article</h2>
            </div>
            <p className="mb-4 font-mono text-[11px] leading-relaxed text-muted-foreground/70">
              Fetches the article · generates a summary, key claims, and Anki-style flashcards · saves to your reading library.
            </p>
            <ArticleNotes
              onClose={() => setView('list')}
              mode="page"
              onSave={handleSaved}
            />
          </div>
        )}
      </div>

      {studyCards && (
        <StudySession cards={studyCards} onClose={() => setStudyCards(null)} />
      )}
    </div>
  )
}
