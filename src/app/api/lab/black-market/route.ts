import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { BLACK_MARKET_CATALOG, type BlackMarketEntry, type BlackMarketLiveStats } from '@/lib/lab/black-market'

export const maxDuration = 15

// The Black Market gallery merges curated editorial catalog entries with
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
      // Cache at the edge for an hour — these numbers move slowly and we
      // don't want to hammer HF (or block the page) on every load.
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

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const entries: BlackMarketEntry[] = await Promise.all(
    BLACK_MARKET_CATALOG.map(async (model) => ({
      ...model,
      stats: await fetchHfStats(model.hfId),
    })),
  )

  return Response.json({ entries })
}
