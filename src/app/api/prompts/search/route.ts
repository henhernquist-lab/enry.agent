import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { resolveResourceUserId } from '@/lib/resource-user'
import type { ResourceSource } from '@/lib/resource-source'

export const maxDuration = 30

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function POST(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const query = typeof body.query === 'string' ? body.query.trim() : ''
  const source = (typeof body.source === 'string' ? body.source : null) as ResourceSource | null

  if (!query) return Response.json({ error: 'query required' }, { status: 400 })

  const embedding = await generateEmbedding(query)

  if (!embedding) {
    // Fallback to recency listing — embedding unavailable
    let fallback = supabase
      .from('resources')
      .select('id, type, source, title, payload, created_at, updated_at')
      .eq('user_id', uid)
      .eq('type', 'prompt')
      .order('created_at', { ascending: false })
      .limit(20)
    if (source) fallback = fallback.eq('source', source)
    const { data } = await fallback
    return Response.json({ resources: data ?? [], semantic: false })
  }

  const { data, error } = await supabase.rpc('match_prompts', {
    query_embedding: embedding,
    match_user_id: uid,
    match_threshold: 0.3,
    match_count: 15,
  })

  if (error) {
    console.error('[prompts/search] RPC error:', error)
    return Response.json({ error: 'Search failed' }, { status: 500 })
  }

  // match_prompts predates the `source` column and doesn't filter by it —
  // post-filter here so semantic search can't leak daily_auto/featured rows
  // into a source-scoped view (e.g. "Mine").
  let results = data ?? []
  if (source && results.length > 0) {
    const { data: sourceRows } = await supabase
      .from('resources')
      .select('id, source')
      .in('id', results.map((r: { id: string }) => r.id))
    const allowed = new Set((sourceRows ?? []).filter((r) => r.source === source).map((r) => r.id))
    results = results.filter((r: { id: string }) => allowed.has(r.id))
  }

  return Response.json({ resources: results, semantic: true })
}
