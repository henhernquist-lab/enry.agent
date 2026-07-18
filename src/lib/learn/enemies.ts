// Enemy Claims — false claims blended silently into the probe rotation.
// The user marks claims they believe are FALSE. These claims are mixed into
// regular probes without any visual distinction — the user doesn't know
// which probe is an enemy. If they correctly identify it as false
// (enemy_caught), the claim retires. If they defend it as true (enemy_defended),
// that's the interesting failure — it's logged prominently and surfaced in
// the tab as "claims you couldn't tell were false."

import { supabase } from '../supabase'
import { generateEmbedding } from '../embeddings'

export interface ActiveEnemy {
  id: string
  content: string
  topic: string
  created_at: string
}

export interface CaughtEnemy {
  id: string
  content: string
  topic: string
  created_at: string
  caught_at: string
}

export interface DefendedEnemy {
  id: string
  content: string
  topic: string
  created_at: string
  defended_at: string
  answer_given: string
}

// ── Add an enemy claim ───────────────────────────────────────────────────
export async function addEnemy(
  userId: string,
  content: string,
  topic: string,
): Promise<{ id: string } | { error: string }> {
  const embedding = await generateEmbedding(content, 'passage')

  const { data, error } = await supabase
    .from('claims')
    .insert({
      user_id: userId,
      content,
      topic,
      source_type: 'manual',
      is_enemy: true,
      embedding: embedding ? JSON.stringify(embedding) : null,
      strength: 1.0,
      half_life: 24,
      status: 'active',
      next_probe_at: new Date().toISOString(), // due immediately
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}

// ── List active enemies (not yet caught) ─────────────────────────────────
export async function getActiveEnemies(userId: string): Promise<ActiveEnemy[]> {
  const { data, error } = await supabase
    .from('claims')
    .select('id, content, topic, created_at')
    .eq('user_id', userId)
    .eq('is_enemy', true)
    .is('enemy_caught_at', null)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error || !data) return []
  return data
}

// ── List caught enemies ──────────────────────────────────────────────────
export async function getCaughtEnemies(userId: string): Promise<CaughtEnemy[]> {
  const { data, error } = await supabase
    .from('claims')
    .select('id, content, topic, created_at, enemy_caught_at')
    .eq('user_id', userId)
    .eq('is_enemy', true)
    .not('enemy_caught_at', 'is', null)
    .order('enemy_caught_at', { ascending: false })

  if (error || !data) return []
  return data.map((c) => ({
    id: c.id,
    content: c.content,
    topic: c.topic,
    created_at: c.created_at,
    caught_at: c.enemy_caught_at!,
  }))
}

// ── List enemies the user failed to catch (defended as true) ─────────────
// These are from claim_events of type 'enemy_defended' — the user answered
// as if the enemy claim was true.
export async function getDefendedEnemies(userId: string) {
  const { data: claims } = await supabase
    .from('claims')
    .select('id, content, topic, created_at')
    .eq('user_id', userId)
    .eq('is_enemy', true)

  if (!claims || claims.length === 0) return []

  const claimMap = new Map(claims.map((c) => [c.id, c]))
  const claimIds = claims.map((c) => c.id)

  const { data: events } = await supabase
    .from('claim_events')
    .select('claim_id, payload, created_at')
    .in('claim_id', claimIds)
    .eq('event_type', 'enemy_defended')
    .order('created_at', { ascending: false })

  if (!events) return []

  return events.map((e) => {
    const p = e.payload as { answer?: string }
    const claim = claimMap.get(e.claim_id)
    return {
      id: e.claim_id,
      content: claim?.content ?? '(deleted)',
      topic: claim?.topic ?? '',
      created_at: claim?.created_at ?? '',
      defended_at: e.created_at,
      answer_given: p.answer ?? '(no answer recorded)',
    }
  })
}

// ── Count of active enemies (for tab badge) ──────────────────────────────
export async function getEnemyCount(userId: string): Promise<number> {
  const { count, error } = await supabase
    .from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_enemy', true)
    .is('enemy_caught_at', null)
    .eq('status', 'active')

  if (error) return 0
  return count ?? 0
}
