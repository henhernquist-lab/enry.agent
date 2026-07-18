'use client'

// Quick Notes — moved into Learn as a tab.
// Wraps the existing QuickNotes component from tools, unchanged.
// Same zero-prop pattern as grade-calc-tab.tsx.

import { QuickNotes } from '@/components/tools/quick-notes'

export default function QuickNotesTab() {
  return <QuickNotes onClose={() => {}} mode="page" onSave={() => {}} />
}
