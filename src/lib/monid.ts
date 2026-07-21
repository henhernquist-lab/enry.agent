// Monid — general-purpose API discovery and execution.
// https://monid.ai/docs
//
// Fallback tool: the model calls monid_api with a natural-language description
// of what API it needs. Monid discovers the right endpoint, inspects its schema,
// and executes it — no per-connector auth flow needed.
//
// Key difference from Composio: Monid is ONE tool, not a list of connectors to
// individually authorize. The model sends a query; Monid resolves the API at
// runtime from its pool.

const BASE_URL = 'https://api.monid.ai'

interface MonidDiscoverResult {
  provider: string
  providerName: string
  endpoint: string
  description: string
  price?: { type: string; amount: number; currency: string }
}

interface MonidRunResult {
  runId: string
  status: 'COMPLETED' | 'RUNNING' | 'FAILED' | 'QUEUED'
  output?: unknown
  error?: string
}

function headers(): Record<string, string> {
  const apiKey = process.env.MONID_API_KEY ?? ''
  const workspaceId = process.env.MONID_WORKSPACE_ID ?? ''
  return {
    'Authorization': `Bearer ${apiKey}`,
    'x-workspace-id': workspaceId,
    'Content-Type': 'application/json',
  }
}

function isConfigured(): boolean {
  return !!(process.env.MONID_API_KEY && process.env.MONID_WORKSPACE_ID)
}

/** Discover APIs matching a natural-language query. */
export async function monidDiscover(query: string): Promise<{
  results: MonidDiscoverResult[]
  error?: string
}> {
  if (!isConfigured()) return { results: [], error: 'Monid not configured — MONID_API_KEY and MONID_WORKSPACE_ID required.' }
  try {
    const res = await fetch(`${BASE_URL}/v1/discover`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ query, limit: 3 }),
    })
    const data = await res.json()
    if (!res.ok) return { results: [], error: data.error ?? data.message ?? `Monid discover failed (HTTP ${res.status})` }
    return { results: (data.results ?? []) as MonidDiscoverResult[] }
  } catch (err) {
    return { results: [], error: `Monid discover error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Inspect a discovered endpoint to get its input schema. */
export async function monidInspect(
  provider: string,
  endpoint: string,
): Promise<{ schema: unknown; error?: string }> {
  if (!isConfigured()) return { schema: null, error: 'Monid not configured.' }
  try {
    const res = await fetch(`${BASE_URL}/v1/inspect`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ provider, endpoint }),
    })
    const data = await res.json()
    if (!res.ok) return { schema: null, error: data.error ?? `Monid inspect failed (HTTP ${res.status})` }
    return { schema: data }
  } catch (err) {
    return { schema: null, error: `Monid inspect error: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** Run a discovered endpoint. Handles sync (200) and async (202) responses. */
export async function monidRun(
  provider: string,
  endpoint: string,
  input: Record<string, unknown>,
): Promise<{ output: unknown; runId: string; status: string; error?: string }> {
  if (!isConfigured()) return { output: null, runId: '', status: 'FAILED', error: 'Monid not configured.' }
  try {
    const res = await fetch(`${BASE_URL}/v1/run`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ provider, endpoint, input }),
    })
    const data = await res.json()

    if (!res.ok) {
      return {
        output: null,
        runId: data.runId ?? '',
        status: 'FAILED',
        error: data.error ?? data.message ?? `Monid run failed (HTTP ${res.status})`,
      }
    }

    // Sync completion
    if (res.status === 200 && data.status === 'COMPLETED') {
      return { output: data.output, runId: data.runId, status: 'COMPLETED' }
    }

    // Async — poll up to 30 seconds
    const runId = data.runId
    if (!runId) return { output: null, runId: '', status: 'FAILED', error: 'No runId returned.' }

    for (let i = 0; i < 15; i++) {
      await new Promise((r) => setTimeout(r, 2000))
      const pollRes = await fetch(`${BASE_URL}/v1/runs/${runId}`, {
        headers: headers(),
      })
      const pollData = await pollRes.json()
      if (pollData.status === 'COMPLETED') {
        return { output: pollData.output, runId, status: 'COMPLETED' }
      }
      if (pollData.status === 'FAILED') {
        return { output: null, runId, status: 'FAILED', error: pollData.error ?? 'Run failed' }
      }
    }

    return { output: null, runId, status: 'RUNNING', error: 'Run still in progress after 30s — try checking the run ID later.' }
  } catch (err) {
    return {
      output: null,
      runId: '',
      status: 'FAILED',
      error: `Monid run error: ${err instanceof Error ? err.message : String(err)}`,
    }
  }
}
