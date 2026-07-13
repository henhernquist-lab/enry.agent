import { supabase } from './supabase'
import { nimClientFor, DEFAULT_NIM_MODEL } from './nim'

export interface RegretEntry {
  id: string
  user_id: string
  decision_text: string
  why_uncertain: string
  alternative_considered: string | null
  worry: string | null
  resurface_at: string
  resurface_interval_days: number
  status: 'open' | 'resolved'
  created_at: string
  updated_at: string
  reflections?: RegretReflection[]
}

export interface RegretReflection {
  id: string
  entry_id: string
  resurface_number: number
  outcome: 'held_up' | 'dissolved' | 'morphed'
  reflection_text: string
  reflected_at: string
}

export interface RegretPattern {
  category: string
  observation: string
  count: number
}

function parseEntry(row: Record<string, unknown>): RegretEntry {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    decision_text: (row.decision_text as string) ?? '',
    why_uncertain: (row.why_uncertain as string) ?? '',
    alternative_considered: (row.alternative_considered as string) ?? null,
    worry: (row.worry as string) ?? null,
    resurface_at: row.resurface_at as string,
    resurface_interval_days: (row.resurface_interval_days as number) ?? 30,
    status: (row.status as RegretEntry['status']) ?? 'open',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

function parseReflection(row: Record<string, unknown>): RegretReflection {
  return {
    id: row.id as string,
    entry_id: row.entry_id as string,
    resurface_number: (row.resurface_number as number) ?? 1,
    outcome: (row.outcome as RegretReflection['outcome']) ?? 'held_up',
    reflection_text: (row.reflection_text as string) ?? '',
    reflected_at: row.reflected_at as string,
  }
}

export async function listEntries(userId: string): Promise<RegretEntry[]> {
  const { data: entries, error } = await supabase
    .from('regret_entries')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error || !entries) return []

  // Fetch reflections for all entries.
  const entryIds = entries.map(e => e.id)
  const { data: reflections } = await supabase
    .from('regret_reflections')
    .select('*')
    .in('entry_id', entryIds)
    .order('reflected_at', { ascending: true })

  return entries.map(e => ({
    ...parseEntry(e),
    reflections: (reflections ?? [])
      .filter(r => r.entry_id === e.id)
      .map(parseReflection),
  }))
}

export async function createEntry(
  userId: string,
  data: { decision_text: string; why_uncertain: string; alternative_considered?: string; worry?: string; resurface_interval_days?: number },
): Promise<RegretEntry | null> {
  const intervalDays = data.resurface_interval_days ?? 30
  const resurfaceAt = new Date(Date.now() + intervalDays * 24 * 60 * 60 * 1000).toISOString()

  const { data: entry, error } = await supabase
    .from('regret_entries')
    .insert({
      user_id: userId,
      decision_text: data.decision_text,
      why_uncertain: data.why_uncertain,
      alternative_considered: data.alternative_considered ?? null,
      worry: data.worry ?? null,
      resurface_at: resurfaceAt,
      resurface_interval_days: intervalDays,
    })
    .select()
    .single()

  if (error || !entry) { console.error('[regret] create failed:', error); return null }
  return parseEntry(entry)
}

export async function addReflection(
  userId: string,
  entryId: string,
  data: { outcome: 'held_up' | 'dissolved' | 'morphed'; reflection_text: string },
): Promise<RegretReflection | null> {
  // Verify ownership.
  const { data: entry } = await supabase
    .from('regret_entries')
    .select('id')
    .eq('id', entryId)
    .eq('user_id', userId)
    .single()

  if (!entry) return null

  // Get current reflection count.
  const { data: existing } = await supabase
    .from('regret_reflections')
    .select('id')
    .eq('entry_id', entryId)

  const resurfaceNumber = (existing?.length ?? 0) + 1
  const newResurfaceAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: reflection, error } = await supabase
    .from('regret_reflections')
    .insert({
      entry_id: entryId,
      resurface_number: resurfaceNumber,
      outcome: data.outcome,
      reflection_text: data.reflection_text,
    })
    .select()
    .single()

  if (error || !reflection) { console.error('[regret] reflection failed:', error); return null }

  // Update the entry's resurface date for next cycle.
  await supabase
    .from('regret_entries')
    .update({ resurface_at: newResurfaceAt, updated_at: new Date().toISOString() })
    .eq('id', entryId)

  return parseReflection(reflection)
}

export async function resolveEntry(userId: string, entryId: string): Promise<boolean> {
  const { error } = await supabase
    .from('regret_entries')
    .update({ status: 'resolved', updated_at: new Date().toISOString() })
    .eq('id', entryId)
    .eq('user_id', userId)

  return !error
}

export async function getPendingResurfaceCount(userId: string): Promise<number> {
  const now = new Date().toISOString()
  const { count, error } = await supabase
    .from('regret_entries')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('status', 'open')
    .lte('resurface_at', now)

  if (error) return 0
  return count ?? 0
}

export async function getPatterns(userId: string): Promise<{ patterns: RegretPattern[]; entryCount: number }> {
  const entries = await listEntries(userId)
  const resolved = entries.filter(e => e.status === 'resolved' || (e.reflections?.length ?? 0) > 0)

  if (resolved.length < 5) {
    return { patterns: [], entryCount: resolved.length }
  }

  // Build a combined summary of all resolved entries for the LLM.
  const summary = resolved.map(e => {
    const reflections = (e.reflections ?? []).map(r => `- ${r.outcome}: ${r.reflection_text.slice(0, 200)}`).join('\n')
    return `Decision: ${e.decision_text.slice(0, 300)}\nWhy uncertain: ${e.why_uncertain.slice(0, 200)}\nReflections:\n${reflections}`
  }).join('\n\n---\n\n')

  const client = nimClientFor()
  const prompt = `Analyze these regret logs from a user. Find common patterns across their decisions: which categories of decisions tend to result in actual regret vs. dissolve over time? Is their gut calibrated in a specific direction (e.g. overconfident, overly cautious)?

Respond with JSON only:
{ "patterns": [{ "category": "short label", "observation": "one sentence about the pattern", "count": number of entries this applies to }] }

Data:
${summary}`

  try {
    const { generateText } = await import('ai')
    const { text } = await generateText({
      model: client.chat(DEFAULT_NIM_MODEL),
      prompt,
      temperature: 0.5,
      maxOutputTokens: 600,
    })
    const match = text.match(/\{[\s\S]*\}/)
    const parsed = match ? JSON.parse(match[0]) : null
    return {
      patterns: (parsed?.patterns as RegretPattern[]) ?? [],
      entryCount: resolved.length,
    }
  } catch (e) {
    console.error('[regret] patterns generation failed:', e)
    return { patterns: [], entryCount: resolved.length }
  }
}
