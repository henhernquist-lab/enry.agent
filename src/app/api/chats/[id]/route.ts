import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const maxDuration = 30

async function getGoogleId(): Promise<string | null> {
  const session = await auth()
  return (session?.user as { id?: string })?.id ?? null
}

// GET /api/chats/[id] — fetch a chat with its messages; 403 if it doesn't belong to caller
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const { data: chat, error: chatError } = await supabase
    .from('chats')
    .select('id, title, model, created_at, updated_at')
    .eq('id', id)
    .eq('google_id', googleId)  // ownership check
    .maybeSingle()

  if (chatError) return Response.json({ error: chatError.message }, { status: 500 })
  if (!chat) return Response.json({ error: 'Not found' }, { status: 403 })

  const { data: msgRows, error: msgError } = await supabase
    .from('messages')
    .select('message_data')
    .eq('chat_id', id)
    .eq('google_id', googleId)  // redundant but defense-in-depth
    .order('position', { ascending: true })

  if (msgError) return Response.json({ error: msgError.message }, { status: 500 })

  return Response.json({
    ...chat,
    messages: (msgRows ?? []).map((r) => r.message_data),
  })
}

// DELETE /api/chats/[id] — delete a chat; 403 if not owned by caller
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  // Verify ownership first, then delete
  const { data: owned } = await supabase
    .from('chats')
    .select('id')
    .eq('id', id)
    .eq('google_id', googleId)
    .maybeSingle()

  if (!owned) return Response.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await supabase.from('chats').delete().eq('id', id)
  if (error) return Response.json({ error: error.message }, { status: 500 })

  return Response.json({ success: true })
}
