import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { runInterviewTurn, type InterviewMessage } from '@/lib/root-cause'
import type { FailureDomain } from '@/lib/synthesis'

export const maxDuration = 60

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
  const evidenceText = String(body.evidence_text ?? '')
  const currentLayer = Number(body.current_layer ?? 1)
  const acceptedChain = Array.isArray(body.accepted_chain) ? body.accepted_chain : []
  const history: InterviewMessage[] = Array.isArray(body.history) ? body.history : []
  const forceSynthesis = !!body.force_synthesis

  if (!failureDescription) {
    return Response.json({ error: 'Missing failure context' }, { status: 400 })
  }

  const turn = await runInterviewTurn({
    failureDescription,
    failureDate,
    domain,
    evidenceText,
    currentLayer,
    acceptedChain,
    history,
    forceSynthesis,
  })

  if (!turn) return Response.json({ error: 'Interview generation failed' }, { status: 500 })
  return Response.json({ turn })
}
