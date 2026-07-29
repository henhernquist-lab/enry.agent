import { notify } from '@/lib/notify'

export const maxDuration = 10

/**
 * Vercel deploy webhook receiver.
 *
 * Henry sets this up in Vercel Dashboard → Project → Settings → Webhooks:
 *   - Event: "deployment.error"
 *   - URL: https://golemhq.vercel.app/api/webhooks/vercel-deploy
 *
 * On deploy failures, it sends a one-line ntfy push notification.
 * Silent on success — signal-to-noise matters.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null)
    if (!body) return Response.json({ ok: true })

    // Vercel sends { type, payload: { deployment: { state, ... }, ... } }
    const type = body.type as string | undefined
    const state = (body.payload as Record<string, unknown> | undefined)?.deployment as Record<string, unknown> | undefined
    const deployState = state?.state as string | undefined
    const commitSha = (state?.meta as Record<string, unknown> | undefined)?.githubCommitSha as string | undefined ?? ''
    const shortSha = commitSha.slice(0, 7)

    if (type === 'deployment.error' || deployState === 'ERROR') {
      void notify(`Build failed: ${shortSha || 'unknown commit'}`)
    }

    return Response.json({ ok: true })
  } catch {
    // Never fail the webhook call
    return Response.json({ ok: true })
  }
}
