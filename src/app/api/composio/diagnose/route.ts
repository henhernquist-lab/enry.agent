import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { Composio } from '@composio/core'
import { resolveAuthConfigId, type ComposioToolkit } from '@/lib/composio'

export const maxDuration = 30

const TOOLKITS: ComposioToolkit[] = ['gmail', 'composio_search']

// Diagnostic endpoint: exercises the Composio auth config + link creation path
// using the server's own credentials, and returns the full raw response or
// error chain. Protected by session auth.
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const toolkit = String(body.toolkit ?? 'gmail') as ComposioToolkit
  if (!TOOLKITS.includes(toolkit)) return Response.json({ error: 'Invalid toolkit' }, { status: 400 })

  const apiKey = process.env.COMPOSIO_API_KEY
  const envAuthConfigId = process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID

  type Step = { name: string } & Record<string, unknown>
  const report: { toolkit: string; userId: string; apiKeyPresent: boolean; envAuthConfigId: string | undefined; steps: Step[] } = {
    toolkit,
    userId: uid,
    apiKeyPresent: !!apiKey,
    envAuthConfigId,
    steps: [],
  }

  const addStep = (name: string, data: Record<string, unknown>) => { report.steps.push({ name, ...data }) }

  try {
    const composio = new Composio({ apiKey: apiKey ?? '' })

    // Step 1: list auth configs for this toolkit
    try {
      const list = await composio.authConfigs.list({ toolkit, isComposioManaged: true, limit: 10 })
      addStep('authConfigs.list', {
        success: true,
        totalItems: list.items.length,
        items: list.items.map(i => ({ id: i.id, name: i.name, toolkitSlug: i.toolkit?.slug, status: i.status })),
      })
    } catch (e) {
      addStep('authConfigs.list', { success: false, error: String((e as Error).message), name: (e as Error).name })
    }

    // Step 2: get the specific auth config we plan to use
    let authConfigId: string
    try {
      authConfigId = await resolveAuthConfigId(toolkit)
      addStep('resolveAuthConfigId', { success: true, authConfigId })
    } catch (e) {
      addStep('resolveAuthConfigId', { success: false, error: String((e as Error).message), name: (e as Error).name })
      throw e
    }

    try {
      const config = await composio.authConfigs.get(authConfigId)
      addStep('authConfigs.get', {
        success: true,
        id: config.id,
        name: config.name,
        status: config.status,
        toolkitSlug: config.toolkit?.slug,
        isComposioManaged: config.isComposioManaged,
      })
    } catch (e) {
      addStep('authConfigs.get', { success: false, authConfigId, error: String((e as Error).message), name: (e as Error).name })
      throw e
    }

    // Step 3: attempt the link creation
    const callbackUrl = `${process.env.NEXTAUTH_URL?.replace(/\/+$/, '') ?? ''}/api/composio/callback?toolkit=${toolkit}`
    try {
      const linkReq = await composio.connectedAccounts.link(uid, authConfigId, { callbackUrl })
      addStep('connectedAccounts.link', {
        success: true,
        connectedAccountId: linkReq.id,
        redirectUrl: linkReq.redirectUrl,
        status: linkReq.status,
      })
      return Response.json({ ok: true, report })
    } catch (e) {
      const err = e as Error & { cause?: unknown; code?: string; statusCode?: number }
      const cause = err.cause as Error & { status?: number; statusCode?: number; body?: unknown; response?: unknown; message?: string; headers?: unknown } | undefined
      addStep('connectedAccounts.link', {
        success: false,
        error: err.message,
        name: err.name,
        code: err.code,
        statusCode: err.statusCode ?? cause?.status ?? cause?.statusCode,
        causeMessage: cause?.message,
        causeBody: cause?.body,
        causeResponse: cause?.response,
        causeHeaders: cause?.headers,
      })
      return Response.json({ ok: false, report }, { status: 502 })
    }
  } catch (e) {
    const err = e as Error
    addStep('unexpected', { success: false, error: err.message, name: err.name })
    return Response.json({ ok: false, report }, { status: 502 })
  }
}
