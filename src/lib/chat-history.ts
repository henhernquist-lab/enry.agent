import type { UIMessage } from 'ai'

export interface Conversation {
  id: string
  title: string
  model: string
  createdAt: number
  updatedAt: number
  messages: UIMessage[]
}

export type ActivityEvent = {
  id: string
  type: 'user-sent' | 'assistant-start' | 'assistant-complete' | 'error'
  content: string
  at: number
  model?: string
}

const STORAGE_KEY = 'enry_conversations'
const MAX_STORED = 50

export function loadConversations(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveConversation(conv: Conversation): void {
  const all = loadConversations()
  const idx = all.findIndex(c => c.id === conv.id)
  if (idx >= 0) all[idx] = conv
  else all.unshift(conv)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, MAX_STORED)))
  } catch {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(all.slice(0, 10)))
    } catch {}
  }
}

export function deleteConversation(id: string): void {
  const all = loadConversations().filter(c => c.id !== id)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {}
}

export function newConversationId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
