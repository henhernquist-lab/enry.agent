import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { listCommunityModels, addCommunityModel, removeCommunityModel } from '@/lib/models/community'

export const maxDuration = 15
export const dynamic = 'force-dynamic'

async function requireUser(): Promise<string | null> {
  const session = await auth()
  const googleId = (session?.user as { id?: string } | undefined)?.id ?? null
  return resolveResourceUserId(googleId)
}

// List the user's added community models (for the pickers).
export async function GET() {
  const uid = await requireUser()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const models = await listCommunityModels(uid)
    return Response.json({ models })
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Failed to list models' }, { status: 500 })
  }
}

// Add a catalog model to the registry. Body: { hfId }.
export async function POST(req: NextRequest) {
  const uid = await requireUser()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { hfId?: string }
  try {
    body = (await req.json()) as { hfId?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (!body.hfId) return Response.json({ error: 'hfId is required' }, { status: 400 })

  const result = await addCommunityModel(uid, body.hfId)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  return Response.json({ model: result.model }, { status: 201 })
}

// Remove a community model. Query: ?modelId=community:... or ?hfId=org/repo
export async function DELETE(req: NextRequest) {
  const uid = await requireUser()
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(req.url).searchParams
  const modelId = params.get('modelId') ?? undefined
  const hfId = params.get('hfId') ?? undefined
  if (!modelId && !hfId) return Response.json({ error: 'modelId or hfId is required' }, { status: 400 })

  const result = await removeCommunityModel(uid, { modelId, hfId })
  if (!result.ok) return Response.json({ error: result.error }, { status: 500 })
  return Response.json({ ok: true })
}
