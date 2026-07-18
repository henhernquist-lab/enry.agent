'use client'

// Flashcards — moved into Learn as a tab.
// Wraps the existing FlashcardGenerator component from tools, unchanged.
// Same zero-prop pattern as grade-calc-tab.tsx.

import { FlashcardGenerator } from '@/components/tools/flashcard-generator'

export default function FlashcardsTab() {
  return <FlashcardGenerator onClose={() => {}} mode="page" onSave={() => {}} />
}
