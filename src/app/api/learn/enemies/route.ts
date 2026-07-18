// Enemy Claims API — list active/caught/defended enemies, add new enemies.

import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { addEnemy, getActiveEnemies, getCaughtEnemies, getDefendedEnemies, getEnemyCount } from '@/lib/learn/enemies'

export const maxDuration = 30

export async function GET(req: Request) {
  const session = await auth()
  const rawId = (session?.user as { id?: string })?.id ?? null
  const uid = await resolveResourceUserId(rawId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(req.url)
  const action = url.searchParams.get('action') ?? 'active'

  try {
    switch (action) {
      case 'active':
        return Response.json({ enemies: await getActiveEnemies(uid) })
      case 'caught':
        return Response.json({ enemies: await getCaughtEnemies(uid) })
      case 'defended':
        return Response.json({ enemies: await getDefendedEnemies(uid) })
      case 'count':
        return Response.json({ count: await getEnemyCount(uid) })
      default:
        return Response.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await auth()
  const rawId = (session?.user as { id?: string })?.id ?? null
  const uid = await resolveResourceUserId(rawId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  try {
    const result = await addEnemy(uid, body.content, body.topic ?? '')
    return Response.json(result)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
