import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

interface MatchRow {
  id: string
  title?: string
  similarity?: number
  [key: string]: unknown
}

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

// Powers the command palette's "Search Resources" section — same
// bge-m3 + match_prompts/match_article_notes RPCs the Prompt Library and
// Article Notes search already use, just merged and reranked into one list.
export async function POST(req: Request) {
  try {
    const session = await auth()
    const uid = await resolveResourceUserId(userId(session))
    if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const query = typeof body.query === 'string' ? body.query.trim() : ''
    if (!query || query.length < 2) return Response.json({ results: [] })

    const embedding = await generateEmbedding(query)
    if (!embedding) return Response.json({ results: [] })

    const [promptsRes, articlesRes] = await Promise.all([
      supabase.rpc('match_prompts', {
        query_embedding: embedding,
        match_user_id: uid,
        match_threshold: 0.3,
        match_count: 5,
      }),
      supabase.rpc('match_article_notes', {
        query_embedding: embedding,
        match_user_id: uid,
        match_threshold: 0.3,
        match_count: 5,
      }),
    ])

    const prompts = ((promptsRes.data ?? []) as MatchRow[]).map((r) => ({ ...r, resultType: 'prompt' as const }))
    const articles = ((articlesRes.data ?? []) as MatchRow[]).map((r) => ({ ...r, resultType: 'article_note' as const }))

    const merged = [...prompts, ...articles]
      .sort((a, b) => (b.similarity ?? 0) - (a.similarity ?? 0))
      .slice(0, 5)
      .map((r) => ({
        id: r.id,
        title: r.title ?? 'Untitled',
        type: r.resultType,
      }))

    return Response.json({ results: merged })
  } catch (err) {
    console.error('[search/quick] unhandled error:', err)
    return Response.json({ results: [], error: 'Search failed' }, { status: 500 })
  }
}
