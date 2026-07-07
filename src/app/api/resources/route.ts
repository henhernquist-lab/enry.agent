import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { resolveResourceUserId } from '@/lib/resource-user'
import type { ResourceType } from '@/lib/resources'
import type { ResourceSource } from '@/lib/resource-source'

const VALID_SOURCES = new Set<ResourceSource>(['user', 'daily_auto', 'featured'])

export const maxDuration = 30

const VALID_TYPES = new Set<ResourceType>([
  'flashcards',
  'grade_calc',
  'workout',
  'meal',
  'repo_scan',
  'habit_streak',
  'race_pace',
  'prompt',
  'article_note',
])

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

// resources table uses user_id uuid (references profiles.id) — resolved from
// the session's google_id via resolveResourceUserId, not used directly

export async function GET(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') as ResourceType | null
  const source = searchParams.get('source') as ResourceSource | null

  if (!type || !VALID_TYPES.has(type)) {
    return Response.json({ error: 'Invalid type' }, { status: 400 })
  }
  if (source && !VALID_SOURCES.has(source)) {
    return Response.json({ error: 'Invalid source' }, { status: 400 })
  }

  let query = supabase
    .from('resources')
    .select('id, type, source, title, payload, created_at, updated_at')
    .eq('user_id', uid)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(source === 'daily_auto' ? 500 : type === 'prompt' ? 100 : 50)

  if (source) query = query.eq('source', source)

  const { data, error } = await query

  if (error) return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  return Response.json({ resources: data ?? [] })
}

export async function POST(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { type, title, payload } = body

  if (!type || !VALID_TYPES.has(type as ResourceType)) {
    return Response.json({ error: 'Invalid type' }, { status: 400 })
  }
  if (typeof title !== 'string' || !title.trim()) {
    return Response.json({ error: 'Title required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('resources')
    .insert({ user_id: uid, type, source: 'user', title: title.trim().slice(0, 200), payload: payload ?? {} })
    .select('id, type, source, title, payload, created_at, updated_at')
    .single()

  if (error) {
    console.error('[resources] insert failed:', error)
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }

  // Generate embedding for prompt type — fire-and-forget, doesn't block the response
  if (type === 'prompt' && data?.id) {
    const pp = payload as { title?: string; body?: string; tags?: string[] }
    const text = [pp.title, pp.body, ...(pp.tags ?? [])].filter(Boolean).join('\n\n')
    generateEmbedding(text)
      .then((embedding) => {
        if (embedding) supabase.from('resources').update({ embedding }).eq('id', data.id).then()
      })
      .catch(console.error)
  }

  return Response.json({ resource: data })
}
