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

// ─── localStorage safety net ────────────────────────────────────────────────
// Restored 2026-07-16 after discovering the Supabase `chats`/`messages`
// tables referenced below didn't exist yet — migration 017 has since run and
// they're live now (verified against Supabase 2026-07-23). This remains a
// best-effort BACKUP layer only, not the primary store: it runs alongside
// every Supabase call so a conversation survives even if a save request
// fails for any reason (a network blip, an RLS misconfiguration) — the kind
// of failure that's otherwise invisible until someone loses a conversation.
// Single-user local cache, so no per-account scoping needed.
const LOCAL_KEY = 'enry_conversations_backup'
const LOCAL_MAX = 50

function loadLocal(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocal(conv: Conversation): void {
  if (typeof window === 'undefined') return
  try {
    const all = loadLocal()
    const idx = all.findIndex((c) => c.id === conv.id)
    if (idx >= 0) all[idx] = conv
    else all.unshift(conv)
    localStorage.setItem(LOCAL_KEY, JSON.stringify(all.slice(0, LOCAL_MAX)))
  } catch (err) {
    console.error('[chat-history] localStorage backup write failed:', err)
  }
}

function deleteLocal(id: string): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(loadLocal().filter((c) => c.id !== id)))
  } catch { /* best effort */ }
}

// ─── Supabase-backed API calls, with the localStorage backup as fallback ────
// All functions are async. Server enforces google_id scoping — no
// client-side user filtering needed, but caller must be authenticated.

export async function loadConversations(): Promise<Conversation[]> {
  try {
    const res = await fetch('/api/chats')
    if (!res.ok) {
      console.error('[chat-history] loadConversations failed:', res.status, await res.text().catch(() => ''))
      return loadLocal().map((c) => ({ ...c, messages: [] }))
    }
    const data = await res.json()
    const remote = (data.chats ?? []) as { id: string; title: string; model: string; created_at: string; updated_at: string }[]
    if (remote.length > 0) {
      return remote.map((c) => ({
        id: c.id,
        title: c.title,
        model: c.model,
        createdAt: new Date(c.created_at).getTime(),
        updatedAt: new Date(c.updated_at).getTime(),
        messages: [],
      }))
    }
    // Supabase genuinely has nothing (new user, or nothing saved there yet) —
    // surface the local backup instead of a false-empty list.
    return loadLocal().map((c) => ({ ...c, messages: [] }))
  } catch (err) {
    console.error('[chat-history] loadConversations threw:', err)
    return loadLocal().map((c) => ({ ...c, messages: [] }))
  }
}

export async function loadConversationMessages(id: string): Promise<UIMessage[]> {
  try {
    const res = await fetch(`/api/chats/${id}`)
    if (!res.ok) {
      console.error('[chat-history] loadConversationMessages failed:', res.status, await res.text().catch(() => ''))
      return loadLocal().find((c) => c.id === id)?.messages ?? []
    }
    const data = await res.json()
    const messages = data.messages ?? []
    if (messages.length > 0) return messages
    return loadLocal().find((c) => c.id === id)?.messages ?? []
  } catch (err) {
    console.error('[chat-history] loadConversationMessages threw:', err)
    return loadLocal().find((c) => c.id === id)?.messages ?? []
  }
}

export async function saveConversation(conv: Conversation): Promise<void> {
  saveLocal(conv) // best-effort backup, always, regardless of the Supabase outcome below
  try {
    const res = await fetch('/api/chats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: conv.id,
        title: conv.title,
        model: conv.model,
        messages: conv.messages,
      }),
    })
    if (!res.ok) {
      // Previously unchecked — a failing save was completely silent. This is
      // exactly the class of bug that let chat history go unsaved for 13 days
      // with nothing in any log pointing at it.
      console.error('[chat-history] saveConversation failed:', res.status, await res.text().catch(() => ''))
    }
  } catch (err) {
    console.error('[chat-history] saveConversation threw:', err)
  }
}

export async function deleteConversation(id: string): Promise<void> {
  deleteLocal(id)
  try {
    const res = await fetch(`/api/chats/${id}`, { method: 'DELETE' })
    if (!res.ok) console.error('[chat-history] deleteConversation failed:', res.status)
  } catch (err) {
    console.error('[chat-history] deleteConversation threw:', err)
  }
}
