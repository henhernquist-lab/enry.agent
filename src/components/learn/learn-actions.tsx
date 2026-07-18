'use client'

import { createContext, useContext } from 'react'

// Cross-tab action seam. A feature tab sometimes needs to hand off to the Chat
// console — e.g. Knowledge Diff's "start studying this gap" drops a scoped
// `learn` invocation into Chat and switches to it. Rather than each such tab
// reaching into page state (which WOULD be touching the shell), the page
// provides these actions once and any tab consumes them via useLearnActions().
// Adding a new cross-tab action = one field here, not per-tab shell surgery.

export interface LearnActions {
  // Switch to the Chat tab and pre-load its input with `text` (not sent — the
  // user reviews and hits send).
  openChatWith: (text: string) => void
}

const noop: LearnActions = { openChatWith: () => {} }

const LearnActionsContext = createContext<LearnActions>(noop)

export function LearnActionsProvider({ value, children }: { value: LearnActions; children: React.ReactNode }) {
  return <LearnActionsContext.Provider value={value}>{children}</LearnActionsContext.Provider>
}

export function useLearnActions(): LearnActions {
  return useContext(LearnActionsContext)
}
