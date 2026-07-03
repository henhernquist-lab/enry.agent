import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export const maxDuration = 30

async function getGoogleId(): Promise<string | null> {
  const session = await auth()
  return (session?.user as { id?: string })?.id ?? null
}

export async function GET() {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('tools_data')
    .eq('google_id', googleId)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  const sms = (data?.tools_data as Record<string, unknown> | null)?.sms ?? null
  return Response.json({ sms })
}

export async function PUT(req: Request) {
  const googleId = await getGoogleId()
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { phone, time } = await req.json()

  // Read existing tools_data, merge sms field
  const { data: existing } = await supabase
    .from('profiles')
    .select('tools_data')
    .eq('google_id', googleId)
    .maybeSingle()

  const current = (existing?.tools_data as Record<string, unknown> | null) ?? {}
  const updated = { ...current, sms: { phone, time } }

  const { error } = await supabase
    .from('profiles')
    .update({ tools_data: updated })
    .eq('google_id', googleId)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ success: true })
}
