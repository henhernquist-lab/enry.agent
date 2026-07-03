import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { sendSMS } from '@/lib/sms'

export const maxDuration = 30

export async function POST() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('profiles')
    .select('tools_data, name')
    .eq('google_id', googleId)
    .maybeSingle()

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const sms = (data?.tools_data as Record<string, unknown> | null)?.sms as { phone?: string } | undefined
  if (!sms?.phone) {
    return Response.json({ error: 'No phone number saved' }, { status: 400 })
  }

  const name = data?.name ?? 'there'
  const message = `Hey ${name}! This is a test from enry.agent. Your daily SMS summaries are active and working.`

  const { success, error: smsError } = await sendSMS(sms.phone, message)
  if (!success) return Response.json({ error: smsError }, { status: 500 })
  return Response.json({ ok: true })
}
