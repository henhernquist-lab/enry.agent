import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { embedSignature } from '@/lib/root-cause'
import type { RootCausePayload } from '@/lib/resources'
import type { FailureDomain } from '@/lib/synthesis'

export const maxDuration = 30

const DOMAINS: FailureDomain[] = ['training', 'academic', 'project', 'other']

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function POST(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const failureDescription = String(body.failure_description ?? '').trim()
  const failureDate = String(body.failure_date ?? '').slice(0, 10)
  const domain: FailureDomain = DOMAINS.includes(body.domain) ? body.domain : 'other'

  if (!failureDescription || !Array.isArray(body.causal_chain)) {
    return Response.json({ error: 'Incomplete root cause' }, { status: 400 })
  }

  const signatureDescription = String(body.signature_description ?? '')

  const payload: RootCausePayload = {
    failure_description: failureDescription,
    failure_date: failureDate,
    domain,
    causal_chain: body.causal_chain,
    root_cause: String(body.root_cause ?? ''),
    preventions: Array.isArray(body.preventions) ? body.preventions.filter((p: unknown) => typeof p === 'string') : [],
    failure_signature: { description: signatureDescription },
    resolved_at: new Date().toISOString(),
  }

  const title = failureDescription.slice(0, 200)

  const { data, error } = await supabase
    .from('resources')
    .insert({ user_id: uid, type: 'root_cause', source: 'user', title, payload })
    .select('id')
    .single()

  if (error) {
    console.error('[root-cause] save failed:', error)
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }

  // Embed the failure-signature description for future shape-matching. The
  // embedding lives on the shared resources.embedding column that
  // match_failure_signatures reads.
  if (signatureDescription) {
    embedSignature(signatureDescription)
      .then((embedding) => {
        if (embedding) supabase.from('resources').update({ embedding }).eq('id', data.id).then()
      })
      .catch((e) => console.error('[root-cause] signature embedding failed:', e))
  }

  return Response.json({ ok: true, id: data.id })
}
