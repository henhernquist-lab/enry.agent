// Server-side Composio wrapper for the Connectors feature (Gmail + Google
// Calendar, v1). Every function here is verified against @composio/core's
// actual packaged TypeScript source (node_modules/@composio/core/src) rather
// than doc pages, because Composio's own SDK retired the older `initiate()`
// connected-account flow (cutover 2026-07-03) in favor of `link()` — a doc
// summary would have shipped a dead code path.
//
// Composio fully custodies the resulting Gmail/Calendar OAuth tokens; nothing
// Google-scoped is ever returned by these functions or stored by callers.

import { Composio } from '@composio/core'

export type ComposioToolkit = 'gmail' | 'composio_search' | 'firecrawl'

let _client: Composio | null = null

function client(): Composio {
  if (_client) return _client
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) throw new Error('COMPOSIO_API_KEY is not set')
  _client = new Composio({ apiKey })
  return _client
}

// Finds this app's existing Composio-managed auth config for a toolkit, or
// creates one. Preferred path (v1): read a pre-existing auth_config_id the
// project owner created in the Composio dashboard from env vars — this honors
// the exact OAuth app config they set up (specific scopes, branding, etc.)
// instead of auto-creating a new Composio-managed config that re-prompts for
// every possible scope. Fallback to list+create only if the env var is unset.
const AUTH_CONFIG_ENV: Record<ComposioToolkit, string | undefined> = {
  gmail: process.env.COMPOSIO_GMAIL_AUTH_CONFIG_ID,
  composio_search: process.env.COMPOSIO_SEARCH_AUTH_CONFIG_ID,
  firecrawl: process.env.COMPOSIO_FIRECRAWL_AUTH_CONFIG_ID,
}

// Synchronous resolver: env-var wins, no SDK call. Used by the hot connect path
// (we don't want to pay a list roundtrip when the dashboard config is known).
function getEnvAuthConfigId(toolkit: ComposioToolkit): string | null {
  const id = AUTH_CONFIG_ENV[toolkit]
  return id && id.trim().length > 0 ? id.trim() : null
}

export async function resolveAuthConfigId(toolkit: ComposioToolkit): Promise<string> {
  const fromEnv = getEnvAuthConfigId(toolkit)
  if (fromEnv) return fromEnv
  // Fallback: discover or create a Composio-managed config. Reused across every
  // user's connection to that toolkit. Created unrestricted here: Phase 1
  // exposes no tools to any model, so there's nothing to over-scope yet.
  const c = client()
  const existing = await c.authConfigs.list({ toolkit, isComposioManaged: true })
  if (existing.items.length > 0) return existing.items[0].id
  const created = await c.authConfigs.create(toolkit, {
    type: 'use_composio_managed_auth',
    name: `enry-${toolkit}`,
  })
  return created.id
}

// Verifies an auth config exists and is reachable with the current API key.
// Throws a descriptive error if the auth config is missing, inaccessible, or
// belongs to a different Composio project than the API key.
export async function verifyAuthConfig(authConfigId: string): Promise<{ id: string; toolkitSlug: string; status: string }> {
  const c = client()
  const config = await c.authConfigs.get(authConfigId)
  return { id: config.id, toolkitSlug: config.toolkit.slug, status: config.status }
}

// Creates a Composio Connect Link for `userId` (our profiles.id) to authorize
// `toolkit`. Returns the redirect URL to send the browser to, plus Composio's
// connected_account_id (the reference to poll/store — never a credential).
export async function createConnectionLink(
  toolkit: ComposioToolkit,
  userId: string,
  callbackUrl: string,
): Promise<{ connectedAccountId: string; redirectUrl: string; authConfigId: string }> {
  const c = client()
  const authConfigId = await resolveAuthConfigId(toolkit)
  const req = await c.connectedAccounts.link(userId, authConfigId, { callbackUrl })
  if (!req.redirectUrl) throw new Error('Composio did not return a redirect URL')
  return { connectedAccountId: req.id, redirectUrl: req.redirectUrl, authConfigId }
}

// Executes one Composio tool action for a connected account. Returns the raw
// data the tool produces (Gmail message list, calendar event list, etc.).
// Used by the chat/route.ts buildComposioTools wrappers to surface real Gmail
// + Calendar actions to Enry Engine as AI-SDK tools. Never surfaces Google's
// raw data to logs — returns it directly to the LLM tool result.
//
// Composio's SDK signature (verified against @composio/core@0.13.1's actual
// Tools.ts): c.tools.execute(slug, body, options?) where body is
// {userId, arguments, version?, dangerouslySkipVersionCheck?, sessionId?}. The
// connected_account_id is resolved internally from the (userId, authConfigId)
// pair registered during c.connectedAccounts.link() — we don't pass it.
export async function executeTool(
  userId: string,
  slug: string,
  body: Record<string, unknown>,
): Promise<{ data: unknown; error: string | null }> {
  try {
    const c = client()
    const result = await c.tools.execute(slug, {
      userId,
      arguments: body,
      dangerouslySkipVersionCheck: true,
    })
    return { data: (result as { data?: unknown })?.data ?? result, error: null }
  } catch (e) {
    return { data: null, error: String((e as Error)?.message ?? e) }
  }
}

export async function getConnectionStatus(connectedAccountId: string): Promise<{
  status: 'INITIALIZING' | 'INITIATED' | 'ACTIVE' | 'FAILED' | 'EXPIRED' | 'INACTIVE' | 'REVOKED'
  toolkitSlug: string
}> {
  const c = client()
  const account = await c.connectedAccounts.get(connectedAccountId)
  return { status: account.status, toolkitSlug: account.toolkit.slug }
}

// Permanently removes the connected account on Composio's side (revokes the
// underlying OAuth token). Safe to call even if already gone — Composio 404s
// are treated as already-disconnected by the caller, not surfaced as errors.
export async function disconnectConnection(connectedAccountId: string): Promise<void> {
  const c = client()
  await c.connectedAccounts.delete(connectedAccountId)
}
