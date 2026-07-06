import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import type { ResourceType } from '@/lib/resources'

export const maxDuration = 30

const VALID_TYPES = new Set<ResourceType>([
  'flashcards',
  'grade_calc',
  'workout',
  'meal',
  'repo_scan',
  'habit_streak',
  'race_pace',
])

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

// resources table uses user_id uuid (references auth.users), not google_id text

export async function GET(req: Request) {
  const session = await auth()
  const uid = userId(session)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') as ResourceType | null

  if (!type || !VALID_TYPES.has(type)) {
    return Response.json({ error: 'Invalid type' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('resources')
    .select('id, type, title, payload, created_at, updated_at')
    .eq('user_id', uid)
    .eq('type', type)
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  return Response.json({ resources: data ?? [] })
}

export async function POST(req: Request) {
  const session = await auth()
  const uid = userId(session)
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
    .insert({ user_id: uid, type, title: title.trim().slice(0, 200), payload: payload ?? {} })
    .select('id, type, title, payload, created_at, updated_at')
    .single()

  if (error) return Response.json({ error: 'Failed to save' }, { status: 500 })
  return Response.json({ resource: data })
}
