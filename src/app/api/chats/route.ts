import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const maxDuration = 30

async function getGoogleId(): Promise<string | null> {
  const session = await auth()
  return (session?.user as { id?: string })?.id ?? null
}

// GET /api/chats — list all chats for the current user (no messages, for performance)
export async function GET() {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('chats')
    .select('id, title, model, created_at, updated_at')
    .eq('google_id', googleId)
    .order('updated_at', { ascending: false })
    .limit(50)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ chats: data })
}

// POST /api/chats — upsert a chat + replace its messages
export async function POST(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, title, model, messages } = await req.json()
  if (!id || !Array.isArray(messages)) {
    return Response.json({ error: 'Missing id or messages' }, { status: 400 })
  }

  // Upsert the chat row
  const { error: chatError } = await supabase
    .from('chats')
    .upsert(
      {
        id,
        google_id: googleId,
        title: title ?? 'New chat',
        model: model ?? 'deepseek/deepseek-v4-pro',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    )

  if (chatError) return Response.json({ error: chatError.message }, { status: 500 })

  // Verify ownership before touching messages (prevents ID-squatting)
  const { data: owned } = await supabase
    .from('chats')
    .select('id')
    .eq('id', id)
    .eq('google_id', googleId)
    .maybeSingle()

  if (!owned) return Response.json({ error: 'Forbidden' }, { status: 403 })

  // Replace all messages for this chat atomically
  await supabase.from('messages').delete().eq('chat_id', id)

  if (messages.length > 0) {
    const rows = messages.map((msg: unknown, position: number) => ({
      chat_id: id,
      google_id: googleId,
      message_data: msg,
      position,
    }))
    const { error: msgError } = await supabase.from('messages').insert(rows)
    if (msgError) return Response.json({ error: msgError.message }, { status: 500 })
  }

  return Response.json({ success: true })
}
