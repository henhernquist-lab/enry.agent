import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import {
  assembleEvidence,
  computeSignatureInputs,
  buildSignatureDescription,
  matchPastFailures,
  runInterviewTurn,
} from '@/lib/root-cause'
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
  const failureDate = String(body.failure_date ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10)
  const domain: FailureDomain = DOMAINS.includes(body.domain) ? body.domain : 'other'

  if (!failureDescription) {
    return Response.json({ error: 'Describe the failure in one sentence.' }, { status: 400 })
  }

  // Assemble evidence + compute the failure signature, then check whether this
  // shape matches any past root cause BEFORE the interview begins.
  const [pack, sigInputs] = await Promise.all([
    assembleEvidence(uid, failureDate, domain),
    computeSignatureInputs(uid, failureDate, domain),
  ])
  const signatureDescription = buildSignatureDescription(pack, sigInputs)
  const matches = await matchPastFailures(uid, signatureDescription)

  // First probe (layer 1).
  const firstTurn = await runInterviewTurn({
    failureDescription,
    failureDate,
    domain,
    evidenceText: pack.text,
    currentLayer: 1,
    acceptedChain: [],
    history: [],
  })

  return Response.json({
    evidence: pack,
    signature_description: signatureDescription,
    matches,
    first_turn: firstTurn,
  })
}
