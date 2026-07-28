import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import {
  CORE_COMMUNITY_MODELS,
  DAILY_DISCOVERY_POOL,
  DAILY_DISCOVERY_COUNT,
  DAILY_DISCOVERY_HISTORY_DAYS,
  type BlackMarketEntry,
  type BlackMarketLiveStats,
  type BlackMarketModel,
} from '@/lib/lab/foundry'
import { resolveServability, listCommunityModels } from '@/lib/models/community'

export const maxDuration = 30

// The Foundry gallery merges curated editorial catalog entries with
// LIVE stats from the Hugging Face API. Stats are never stored or invented —
// on any fetch failure the entry gets ok:false and the UI renders "—".

interface HfModelInfo {
  downloads?: number
  likes?: number
  lastModified?: string
}

async function fetchHfStats(hfId: string): Promise<BlackMarketLiveStats> {
  try {
    const res = await fetch(`https://huggingface.co/api/models/${hfId}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return { downloads: null, likes: null, lastModified: null, ok: false }
    const data = (await res.json()) as HfModelInfo
    return {
      downloads: typeof data.downloads === 'number' ? data.downloads : null,
      likes: typeof data.likes === 'number' ? data.likes : null,
      lastModified: data.lastModified ?? null,
      ok: true,
    }
  } catch {
    return { downloads: null, likes: null, lastModified: null, ok: false }
  }
}

// ── Daily discovery selection ──────────────────────────────────────
// Pick N servable models from the discovery pool, avoiding models shown in
// the last N days. Persist today's selection so the same set is shown all day.

function hashString(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (h << 5) - h + str.charCodeAt(i)
    h |= 0
  }
  return Math.abs(h)
}

function seededShuffle<T>(array: T[], seed: number): T[] {
  const arr = [...array]
  const random = (i: number) => {
    const s = Math.sin(seed + i) * 10000
    return s - Math.floor(s)
  }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(random(i) * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

async function getTodaysDiscovery(): Promise<BlackMarketModel[]> {
  const today = new Date().toISOString().split('T')[0]

  // 1. Return today's selection if it already exists.
  const { data: todayRow } = await supabase
    .from('daily_discovery_history')
    .select('hf_ids')
    .eq('date', today)
    .single()

  if (todayRow?.hf_ids && todayRow.hf_ids.length > 0) {
    const ids = todayRow.hf_ids as string[]
    return DAILY_DISCOVERY_POOL.filter((m) => ids.includes(m.hfId))
  }

  // 2. Build exclusion list from recent history.
  const since = new Date()
  since.setDate(since.getDate() - DAILY_DISCOVERY_HISTORY_DAYS)
  const { data: historyRows } = await supabase
    .from('daily_discovery_history')
    .select('hf_ids')
    .gte('date', since.toISOString().split('T')[0])

  const excluded = new Set<string>((historyRows ?? []).flatMap((r) => r.hf_ids as string[]))

  // 3. Shuffle remaining pool deterministically by date, then iterate until we
  //    find enough servable models. Use a larger candidate window to give
  //    servability checks room to find valid models.
  const seed = hashString(today)
  const candidates = seededShuffle(
    DAILY_DISCOVERY_POOL.filter((m) => !excluded.has(m.hfId)),
    seed,
  )

  const selected: BlackMarketModel[] = []
  let idx = 0
  // Resolve servability in small batches to minimize HF API calls while
  // still exploring enough of the pool.
  while (selected.length < DAILY_DISCOVERY_COUNT && idx < candidates.length) {
    const batchSize = Math.min(4, candidates.length - idx)
    const batch = candidates.slice(idx, idx + batchSize)
    const results = await Promise.all(batch.map((m) => resolveServability(m.hfId)))
    for (let i = 0; i < batch.length; i++) {
      if (results[i].servable) {
        selected.push(batch[i])
        if (selected.length >= DAILY_DISCOVERY_COUNT) break
      }
    }
    idx += batchSize
  }

  // 4. If we still don't have enough, fall back to any servable discovery
  //    model, even if it was recently shown.
  if (selected.length < DAILY_DISCOVERY_COUNT) {
    const already = new Set(selected.map((m) => m.hfId))
    const fallbackCandidates = DAILY_DISCOVERY_POOL.filter((m) => !already.has(m.hfId))
    for (const m of fallbackCandidates) {
      if (selected.length >= DAILY_DISCOVERY_COUNT) break
      const serv = await resolveServability(m.hfId)
      if (serv.servable) selected.push(m)
    }
  }

  // 5. Persist today's selection.
  if (selected.length > 0) {
    await supabase
      .from('daily_discovery_history')
      .upsert({ date: today, hf_ids: selected.map((m) => m.hfId) }, { onConflict: 'date' })
  }

  return selected
}

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Which of these has the user already added? (by hfId)
  let added = new Set<string>()
  try {
    added = new Set((await listCommunityModels(uid)).map((m) => m.hfId))
  } catch {
    /* browse still works; cards just won't show an "added" state */
  }

  // Determine today's discovery models (server-side selection with history).
  const discoveryModels = await getTodaysDiscovery()
  const coreModels = CORE_COMMUNITY_MODELS

  // Fetch live HF stats and servability for every model shown.
  const toEntry = async (model: BlackMarketModel): Promise<BlackMarketEntry> => {
    const [stats, serv] = await Promise.all([
      fetchHfStats(model.hfId),
      resolveServability(model.hfId),
    ])
    return {
      ...model,
      stats,
      servable: serv.servable,
      unservableReason: serv.servable ? null : serv.reason,
      added: added.has(model.hfId),
    }
  }

  const coreEntries = await Promise.all(coreModels.map(toEntry))
  const discoveryEntries = await Promise.all(discoveryModels.map(toEntry))

  return Response.json({
    core: coreEntries,
    discovery: discoveryEntries,
    date: new Date().toISOString().split('T')[0],
  })
}
