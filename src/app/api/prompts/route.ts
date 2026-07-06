import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const maxDuration = 30

const VALID_CATEGORIES = new Set(['coding', 'writing', 'study', 'training', 'general'])

/*
  Expected Supabase table schema:

  CREATE TABLE IF NOT EXISTS user_prompts (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    text NOT NULL,
    title      text NOT NULL,
    body       text NOT NULL,
    category   text NOT NULL DEFAULT 'general',
    tags       jsonb NOT NULL DEFAULT '[]'::jsonb,
    notes      text NOT NULL DEFAULT '',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE INDEX idx_user_prompts_user_id ON user_prompts (user_id);
  ALTER TABLE user_prompts ENABLE ROW LEVEL SECURITY;
  -- Service role bypasses RLS, so no policy needed for server routes.
*/

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function GET() {
  const session = await auth()
  const uid = userId(session)
  if (!uid) return Response.json({ prompts: [] })

  const { data, error } = await supabase
    .from('user_prompts')
    .select('*')
    .eq('user_id', uid)
    .order('created_at', { ascending: false })

  if (error) return Response.json({ error: 'Failed to fetch' }, { status: 500 })
  return Response.json({ prompts: data ?? [] })
}

export async function POST(req: Request) {
  const session = await auth()
  const uid = userId(session)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { title, body, category, tags, notes } = await req.json()

  if (typeof title !== 'string' || !title.trim()) {
    return Response.json({ error: 'Title is required' }, { status: 400 })
  }
  if (typeof body !== 'string' || !body.trim()) {
    return Response.json({ error: 'Body is required' }, { status: 400 })
  }
  if (category && !VALID_CATEGORIES.has(category)) {
    return Response.json({ error: 'Invalid category' }, { status: 400 })
  }
  if (tags && (!Array.isArray(tags) || tags.some((t: unknown) => typeof t !== 'string'))) {
    return Response.json({ error: 'Tags must be an array of strings' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('user_prompts')
    .insert({
      user_id: uid,
      title: title.trim(),
      body: body.trim(),
      category: category ?? 'general',
      tags: JSON.stringify(tags ?? []),
      notes: notes ?? '',
    })
    .select()
    .single()

  if (error) return Response.json({ error: 'Failed to save' }, { status: 500 })
  return Response.json({ prompt: data })
}

export async function PUT(req: Request) {
  const session = await auth()
  const uid = userId(session)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, title, body, category, tags, notes } = await req.json()
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const updates: Record<string, unknown> = {}
  if (typeof title === 'string') updates.title = title.trim()
  if (typeof body === 'string') updates.body = body.trim()
  if (category) {
    if (!VALID_CATEGORIES.has(category)) return Response.json({ error: 'Invalid category' }, { status: 400 })
    updates.category = category
  }
  if (tags) {
    if (!Array.isArray(tags) || tags.some((t: unknown) => typeof t !== 'string')) {
      return Response.json({ error: 'Tags must be an array of strings' }, { status: 400 })
    }
    updates.tags = JSON.stringify(tags)
  }
  if (typeof notes === 'string') updates.notes = notes
  updates.updated_at = new Date().toISOString()

  const { data, error } = await supabase
    .from('user_prompts')
    .update(updates)
    .eq('id', id)
    .eq('user_id', uid)
    .select()
    .single()

  if (error) return Response.json({ error: 'Failed to update' }, { status: 500 })
  return Response.json({ prompt: data })
}

export async function DELETE(req: Request) {
  const session = await auth()
  const uid = userId(session)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase
    .from('user_prompts')
    .delete()
    .eq('id', id)
    .eq('user_id', uid)

  if (error) return Response.json({ error: 'Failed to delete' }, { status: 500 })
  return Response.json({ success: true })
}
