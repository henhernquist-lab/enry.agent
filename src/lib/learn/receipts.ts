// Receipts — contradiction detection between chat messages and stored claims.
// When the user sends a message in main chat, this module:
// 1. Embeds the user's message as a query
// 2. Searches claims for semantically similar items via match_claims RPC
// 3. Checks for opposite-polarity content (the user is now saying something
//    that contradicts a prior claim)
// 4. Returns contradictions for surfacing as an inline interrupt in chat
//
// The Receipts tab in Learn shows the full ledger of every contradiction
// ever surfaced, whether the user resolved it, and which claim "won."

import { supabase } from '../supabase'
import { generateEmbedding } from '../embeddings'

export interface Contradiction {
  claim_id: string
  claim_content: string
  similarity: number      // 0-1 cosine similarity to the user's message
  message_snippet: string // the user's message that triggered the hit
  message_embedding?: number[]
}

export interface ReceiptRecord {
  id: string
  claim_id: string
  claim_content: string
  message_snippet: string
  similarity: number
  resolved: boolean
  resolution?: 'affirmed' | 'reversed' | 'clarified' | 'dismissed'
  created_at: string
  resolved_at?: string
}

// ── Contradiction check ─────────────────────────────────────────────────
// The hook point called from main chat's message-send pipeline. Returns null
// if no contradictions found, or the top contradictions if found.
export async function checkContradictions(
  userMessage: string,
  userId: string,
): Promise<Contradiction[] | null> {
  if (!userMessage.trim()) return null

  const embedding = await generateEmbedding(userMessage, 'query')
  if (!embedding) return null

  // Search claims for semantically similar content
  const { data: matches, error } = await supabase.rpc('match_claims', {
    query_embedding: embedding,
    match_user_id: userId,
    match_count: 5,
  })

  if (error || !matches || matches.length === 0) return null

  // Filter to high-similarity hits (>0.7 threshold)
  const candidates = (matches as { id: string; content: string; similarity: number; is_enemy: boolean; status: string }[])
    .filter((m) => m.similarity > 0.7 && m.status === 'active')

  if (candidates.length === 0) return null

  // For now, return all strong-similarity hits as potential contradictions.
  // A future pass could do a more sophisticated polarity check (e.g., ask
  // a small model to compare the message and claim and decide if they truly
  // contradict), but for MVP, high similarity + same topic space is the
  // pragmatic signal.
  return candidates.map((c) => ({
    claim_id: c.id,
    claim_content: c.content,
    similarity: c.similarity,
    message_snippet: userMessage.slice(0, 200),
  }))
}

// ── Log a contradiction for the Receipts tab ─────────────────────────────
// Called when a contradiction is surfaced in chat. Stores a receipt record
// in claim_events so the Receipts tab can render the full ledger.
export async function logContradiction(
  claimId: string,
  messageSnippet: string,
  similarity: number,
): Promise<{ id: string } | { error: string }> {
  const { data, error } = await supabase
    .from('claim_events')
    .insert({
      claim_id: claimId,
      event_type: 'receipt_surfaced',
      payload: {
        message_snippet: messageSnippet,
        similarity,
      },
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}

// ── Resolve a contradiction ──────────────────────────────────────────────
// Called when the user addresses a contradiction (e.g., "March 4 claim was
// right, I changed my mind since then").
export async function resolveReceipt(
  receiptEventId: string,
  resolution: 'affirmed' | 'reversed' | 'clarified' | 'dismissed',
): Promise<{ ok: boolean }> {
  // We can't update claim_events (append-only by design), so we write a new
  // event of type 'receipt_resolved' with a reference to the original event.
  const { data: original } = await supabase
    .from('claim_events')
    .select('claim_id, payload')
    .eq('id', receiptEventId)
    .maybeSingle()

  if (!original) return { ok: false }

  const { error } = await supabase
    .from('claim_events')
    .insert({
      claim_id: original.claim_id,
      event_type: 'receipt_resolved',
      payload: {
        original_event_id: receiptEventId,
        resolution,
      },
    })

  if (error) {
    console.error('[receipts] resolveReceipt failed:', error)
    return { ok: false }
  }
  return { ok: true }
}

// ── Get the full receipt ledger ──────────────────────────────────────────
// Returns all surfaced contradictions for the user, with resolution status.
export async function getReceiptLedger(userId: string): Promise<ReceiptRecord[]> {
  const { data: claims } = await supabase
    .from('claims')
    .select('id, content')
    .eq('user_id', userId)

  if (!claims || claims.length === 0) return []

  const claimMap = new Map(claims.map((c) => [c.id, c.content]))
  const claimIds = claims.map((c) => c.id)

  // Get all receipt events
  const { data: surfaced } = await supabase
    .from('claim_events')
    .select('id, claim_id, payload, created_at')
    .in('claim_id', claimIds)
    .eq('event_type', 'receipt_surfaced')
    .order('created_at', { ascending: false })

  if (!surfaced) return []

  // Get all resolution events
  const { data: resolved } = await supabase
    .from('claim_events')
    .select('payload, created_at')
    .in('claim_id', claimIds)
    .eq('event_type', 'receipt_resolved')

  const resolvedMap = new Map<string, { resolution: string; resolved_at: string }>()
  if (resolved) {
    for (const r of resolved) {
      const p = r.payload as { original_event_id?: string; resolution?: string; created_at?: string }
      if (p.original_event_id) {
        resolvedMap.set(p.original_event_id, {
          resolution: p.resolution ?? 'dismissed',
          resolved_at: r.created_at ?? new Date().toISOString(),
        })
      }
    }
  }

  return surfaced.map((s) => {
    const p = s.payload as { message_snippet?: string; similarity?: number }
    const resolution = resolvedMap.get(s.id)
    return {
      id: s.id,
      claim_id: s.claim_id,
      claim_content: claimMap.get(s.claim_id) ?? '(deleted)',
      message_snippet: p.message_snippet ?? '',
      similarity: p.similarity ?? 0,
      resolved: !!resolution,
      resolution: resolution?.resolution as ReceiptRecord['resolution'],
      created_at: s.created_at,
      resolved_at: resolution?.resolved_at,
    }
  })
}
