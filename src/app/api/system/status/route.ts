import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'

export const maxDuration = 30

const NIM_BASE = 'https://integrate.api.nvidia.com/v1'

// Each model has its own key but all share the integrate.api.nvidia.com
// catalog. "Ready" = the model ID is in the /v1/models catalog AND its key
// env var is set. The catalog call is made once and cached 60s so page
// renders / polls don't re-hit NIM.
const MODELS: { id: string; keyEnv: string }[] = [
  { id: 'deepseek-ai/deepseek-v4-pro', keyEnv: 'DEEPSEEK_API_KEY' },
  { id: 'minimaxai/minimax-m3',          keyEnv: 'MINIMAX_API_KEY' },
  { id: 'qwen/qwen3.5-397b-a17b',      keyEnv: 'QWEN_API_KEY' },
  { id: 'z-ai/glm-5.2',                keyEnv: 'GLM_API_KEY' },
]

const CACHE_TTL_MS = 60_000

let modelCache: { checkedAt: number; ready: number; total: number } | null = null

async function fetchCatalogIds(): Promise<Set<string> | null> {
  // Use whichever configured key we can find for the single catalog call.
  const key = MODELS.map((m) => process.env[m.keyEnv]).find((k) => k && k.length > 0)
  if (!key) return null
  try {
    const res = await fetch(`${NIM_BASE}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      // Never let a slow NIM hang the status strip.
      signal: AbortSignal.timeout(5000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const list = (data?.data ?? []) as { id?: string }[]
    return new Set(list.map((m) => m.id).filter((id): id is string => typeof id === 'string'))
  } catch {
    return null
  }
}

async function getModelStatus(): Promise<{ ready: number; total: number }> {
  const now = Date.now()
  if (modelCache && now - modelCache.checkedAt < CACHE_TTL_MS) {
    return { ready: modelCache.ready, total: modelCache.total }
  }

  const catalog = await fetchCatalogIds()
  let ready = 0
  for (const m of MODELS) {
    const keySet = !!process.env[m.keyEnv]
    // If the catalog call failed entirely, fall back to key-presence so the
    // strip degrades to a plausible signal instead of showing 0/4 on a blip.
    const inCatalog = catalog ? catalog.has(m.id) : true
    if (keySet && inCatalog) ready++
  }

  modelCache = { checkedAt: now, ready, total: MODELS.length }
  return { ready, total: MODELS.length }
}

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function GET() {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [models, countRes, lastRes] = await Promise.all([
    getModelStatus(),
    supabase.from('resources').select('*', { count: 'exact', head: true }).eq('user_id', uid),
    supabase
      .from('resources')
      .select('updated_at')
      .eq('user_id', uid)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return Response.json({
    modelsReady: models.ready,
    modelsTotal: models.total,
    resourceCount: countRes.count ?? 0,
    lastSync: (lastRes.data as { updated_at?: string } | null)?.updated_at ?? null,
  })
}
