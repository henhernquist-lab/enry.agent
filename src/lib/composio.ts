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

export type ComposioToolkit = 'gmail' | 'googlecalendar'

let _client: Composio | null = null

function client(): Composio {
  if (_client) return _client
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) throw new Error('COMPOSIO_API_KEY is not set')
  _client = new Composio({ apiKey })
  return _client
}

// Finds this app's existing Composio-managed auth config for a toolkit, or
// creates one. Auth configs are app-level (one per toolkit, not per user) —
// reused across every user's connection to that toolkit. Created unrestricted
// (no toolAccessConfig) here: Phase 1 exposes no tools to any model, so there's
// nothing to over-scope yet. Phase 2 locks this down to a verified read-only
// tool list via authConfigs.update() before any tool reaches the model.
export async function getOrCreateAuthConfig(toolkit: ComposioToolkit): Promise<string> {
  const c = client()
  const existing = await c.authConfigs.list({ toolkit, isComposioManaged: true })
  if (existing.items.length > 0) return existing.items[0].id
  const created = await c.authConfigs.create(toolkit, {
    type: 'use_composio_managed_auth',
    name: `enry-${toolkit}`,
  })
  return created.id
}

// Creates a Composio Connect Link for `userId` (our profiles.id) to authorize
// `toolkit`. Returns the redirect URL to send the browser to, plus Composio's
// connected_account_id (the reference to poll/store — never a credential).
export async function createConnectionLink(
  toolkit: ComposioToolkit,
  userId: string,
  callbackUrl: string,
): Promise<{ connectedAccountId: string; redirectUrl: string }> {
  const c = client()
  const authConfigId = await getOrCreateAuthConfig(toolkit)
  const req = await c.connectedAccounts.link(userId, authConfigId, { callbackUrl })
  if (!req.redirectUrl) throw new Error('Composio did not return a redirect URL')
  return { connectedAccountId: req.id, redirectUrl: req.redirectUrl }
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
