import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { resolveResourceUserId } from '@/lib/resource-user'

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
  if (!query) return Response.json({ error: 'query required' }, { status: 400 })

  const embedding = await generateEmbedding(query)

  if (!embedding) {
    const { data } = await supabase
      .from('resources')
      .select('id, type, title, payload, created_at, updated_at')
      .eq('user_id', uid)
      .eq('type', 'article_note')
      .order('created_at', { ascending: false })
      .limit(20)
    return Response.json({ resources: data ?? [], semantic: false })
  }

  const { data, error } = await supabase.rpc('match_article_notes', {
    query_embedding: embedding,
    match_user_id: uid,
    match_threshold: 0.3,
    match_count: 15,
  })

  if (error) {
    console.error('[article-notes/search] RPC error:', error)
    return Response.json({ error: 'Search failed' }, { status: 500 })
  }

  return Response.json({ resources: data ?? [], semantic: true })
}
