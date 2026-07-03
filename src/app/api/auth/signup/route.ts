import { randomUUID } from 'crypto'
import bcrypt from 'bcryptjs'
import { supabase } from '@/lib/supabase'

export async function POST(req: Request) {
  const { email: rawEmail, password } = await req.json()
  const email = (rawEmail as string | undefined)?.toLowerCase().trim()

  if (!email || !password || typeof password !== 'string') {
    return Response.json({ error: 'INVALID_INPUT' }, { status: 400 })
  }

  if (password.length < 8) {
    return Response.json({ error: 'PASSWORD_TOO_SHORT' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('google_id, password_hash')
    .eq('email', email)
    .maybeSingle()

  if (existing) {
    // Google-only user trying to add a password account
    if (!existing.password_hash) {
      return Response.json({ error: 'USE_GOOGLE' }, { status: 409 })
    }
    return Response.json({ error: 'EMAIL_TAKEN' }, { status: 409 })
  }

  const userId = `cred_${randomUUID()}`
  const hash   = await bcrypt.hash(password, 12)

  const { error } = await supabase.from('profiles').insert({
    google_id:     userId,
    email,
    name:          email.split('@')[0],
    password_hash: hash,
    updated_at:    new Date().toISOString(),
  })

  if (error) {
    console.error('[signup] insert error:', error)
    return Response.json({ error: 'SERVER_ERROR' }, { status: 500 })
  }

  return Response.json({ ok: true })
}
