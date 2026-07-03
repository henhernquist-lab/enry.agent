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

export function newConversationId(): string {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ─── Supabase-backed API calls ────────────────────────────────
// All functions are async. Server enforces google_id scoping — no
// client-side user filtering needed, but caller must be authenticated.

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const res = await fetch('/api/chats')
    if (!res.ok) return []
    const data = await res.json()
    return (data.chats ?? []).map((c: {
      id: string; title: string; model: string; created_at: string; updated_at: string
    }) => ({
      id: c.id,
      title: c.title,
      model: c.model,
      createdAt: new Date(c.created_at).getTime(),
      updatedAt: new Date(c.updated_at).getTime(),
      messages: [],
    }))
  } catch {
    return []
  }
}

export async function loadConversationMessages(id: string): Promise<UIMessage[]> {
  try {
    const res = await fetch(`/api/chats/${id}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.messages ?? []
  } catch {
    return []
  }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  try {
    await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: conv.id,
        title: conv.title,
        model: conv.model,
        messages: conv.messages,
      }),
    })
  } catch (err) {
    console.error('[chat-history] saveConversation failed:', err)
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    await fetch(`/api/chats/${id}`, { method: 'DELETE' })
  } catch (err) {
    console.error('[chat-history] deleteConversation failed:', err)
  }
}
