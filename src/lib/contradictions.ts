import { supabase } from './supabase'
import { generateEmbedding } from './embeddings'
import { nimClientFor, DEFAULT_NIM_MODEL } from './nim'

export interface ContradictionEntry {
  id: string
  user_id: string
  entries_referenced: { source_id: string; type: string; title: string; snippet: string }[]
  summary: string
  status: 'open' | 'dismissed' | 'reflected'
  created_at: string
  updated_at: string
}

function parseContradictionRow(row: Record<string, unknown>): ContradictionEntry {
  return {
    id: row.id as string,
    user_id: row.user_id as string,
    entries_referenced: (row.entries_referenced as { source_id: string; type: string; title: string; snippet: string }[]) ?? [],
    summary: (row.summary as string) ?? '',
    status: (row.status as ContradictionEntry['status']) ?? 'open',
    created_at: row.created_at as string,
    updated_at: row.updated_at as string,
  }
}

export async function getContradictions(userId: string): Promise<ContradictionEntry[]> {
  const { data, error } = await supabase
    .from('contradictions')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) { console.error('[contradictions] fetch failed:', error); return [] }
  return (data ?? []).map(parseContradictionRow)
}

export async function updateContradictionStatus(
  userId: string,
  id: string,
  status: 'dismissed' | 'reflected',
): Promise<boolean> {
  const { error } = await supabase
    .from('contradictions')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', userId)

  if (error) { console.error('[contradictions] update failed:', error); return false }
  return true
}

const SCAN_WINDOW_DAYS = 90
const SCAN_TYPES = ['note', 'article_note', 'briefing']
const MAX_PAIRS_TO_CHECK = 50

// Pair scored for potential contradiction — used internally during scan.
interface CandidatePair {
  a: { id: string; type: string; title: string; snippet: string }
  b: { id: string; type: string; title: string; snippet: string }
  distance: number // embedding cosine distance (lower = more similar = more likely contradiction pair)
}

export async function scanForContradictions(userId: string): Promise<{ created: number; message: string }> {
  const since = new Date(Date.now() - SCAN_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  // Fetch all entries of the types we scan.
  const { data: entries, error } = await supabase
    .from('resources')
    .select('id, type, title, payload, embedding')
    .eq('user_id', userId)
    .in('type', SCAN_TYPES)
    .gte('created_at', since)
    .not('embedding', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error || !entries || entries.length < 2) {
    return { created: 0, message: error ? `DB error: ${error.message}` : `Not enough entries with embeddings to scan (need 2+, found ${entries?.length ?? 0})` }
  }

  // Get text snippets from entries.
  const texts: { id: string; type: string; title: string; snippet: string; embedding: number[] }[] = []
  for (const e of entries) {
    const p = (e.payload ?? {}) as Record<string, unknown>
    let snippet = ''
    if (e.type === 'note') snippet = (p.content as string)?.slice(0, 300) ?? ''
    else if (e.type === 'article_note') snippet = ((p.summary as string) ?? '').slice(0, 300)
    else if (e.type === 'briefing') snippet = ((p.observations as { text: string }[])?.map(o => o.text).join(' ') ?? '').slice(0, 300)

    if (snippet && e.embedding) {
      texts.push({ id: e.id, type: e.type, title: e.title, snippet, embedding: e.embedding })
    }
  }

  if (texts.length < 2) return { created: 0, message: `Not enough entries with extractable text to scan` }

  // Compare pairs by embedding distance — closest pairs are candidates for contradiction.
  const pairs: CandidatePair[] = []
  for (let i = 0; i < texts.length && pairs.length < MAX_PAIRS_TO_CHECK * 2; i++) {
    for (let j = i + 1; j < texts.length && pairs.length < MAX_PAIRS_TO_CHECK * 2; j++) {
      const dist = cosineDistance(texts[i].embedding, texts[j].embedding)
      pairs.push({
        a: { id: texts[i].id, type: texts[i].type, title: texts[i].title, snippet: texts[i].snippet },
        b: { id: texts[j].id, type: texts[j].type, title: texts[j].title, snippet: texts[j].snippet },
        distance: dist,
      })
    }
  }

  // Sort by closest pairs first (lower distance = more similar = more likely to contain contradictions).
  pairs.sort((a, b) => a.distance - b.distance)
  const topPairs = pairs.slice(0, MAX_PAIRS_TO_CHECK)

  // Use LLM to judge which pairs are actual contradictions.
  const contradictions: { entries_referenced: ContradictionEntry['entries_referenced']; summary: string }[] = []

  const client = nimClientFor()
  for (const pair of topPairs) {
    const prompt = `You are checking for CONTRADICTIONS in Henry's personal notes and journal. Below are two entries he wrote. Determine if they contain statements that MEANINGFULLY contradict each other — where he has directly stated opposing positions, beliefs, or claims on the same topic.

Not every difference is a contradiction. Only flag actual contradictions: "I need to ship faster" vs "I should slow down and be careful" is a contradiction. "I like coffee" and "I like tea" is not.

ENTRY A (${pair.a.type}, "${pair.a.title}"):
${pair.a.snippet}

ENTRY B (${pair.b.type}, "${pair.b.title}"):
${pair.b.snippet}

Respond with valid JSON only:
{ "contradiction": true/false, "summary": "one sentence explaining the contradiction, empty string if false" }`

    try {
      const { generateText } = await import('ai')
      const { text } = await generateText({
        model: client.chat(DEFAULT_NIM_MODEL),
        prompt,
        temperature: 0.3,
        maxOutputTokens: 300,
      })
      const json = extractJson(text)
      if (json?.contradiction === true && typeof json.summary === 'string' && json.summary.trim()) {
        contradictions.push({
          entries_referenced: [
            { source_id: pair.a.id, type: pair.a.type, title: pair.a.title, snippet: pair.a.snippet.slice(0, 200) },
            { source_id: pair.b.id, type: pair.b.type, title: pair.b.title, snippet: pair.b.snippet.slice(0, 200) },
          ],
          summary: json.summary.trim(),
        })
      }
    } catch (e) {
      console.error('[contradictions] LLM call failed for pair:', e)
    }
  }

  // Insert into DB.
  let created = 0
  for (const c of contradictions) {
    const { error: insertErr } = await supabase
      .from('contradictions')
      .insert({ user_id: userId, entries_referenced: c.entries_referenced, summary: c.summary })

    if (!insertErr) created++
    else console.error('[contradictions] insert failed:', insertErr)
  }

  return { created, message: `Scanned ${texts.length} entries, checked ${topPairs.length} pairs, found ${created} contradiction${created !== 1 ? 's' : ''}` }
}

function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 1
  return 1 - (dot / (Math.sqrt(normA) * Math.sqrt(normB)))
}

function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try { return JSON.parse(match[0]) } catch { return null }
}
