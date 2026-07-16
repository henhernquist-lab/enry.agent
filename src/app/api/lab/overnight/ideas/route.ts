import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { insertOvernightIdea, getOvernightIdeas, updateOvernightIdea, deleteOvernightIdea } from '@/lib/lab/db'

export const maxDuration = 10

// GET — list all ideas for the user
export async function GET(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || undefined
  const ideas = await getOvernightIdeas(uid, status ? { status: status as any } : undefined)
  return Response.json({ ideas })
}

// POST — create a new idea
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const title = String(body.title ?? '').trim()
  const description = String(body.description ?? '').trim()
  const scratchRepoOwner = String(body.scratch_repo_owner ?? '').trim()
  const scratchRepoName = String(body.scratch_repo_name ?? '').trim()

  if (!title) return Response.json({ error: 'Title is required' }, { status: 400 })
  if (!scratchRepoOwner) return Response.json({ error: 'scratch_repo_owner is required' }, { status: 400 })
  if (!scratchRepoName) return Response.json({ error: 'scratch_repo_name is required' }, { status: 400 })

  const idea = await insertOvernightIdea(uid, {
    title,
    description: description || title,
    scratch_repo_owner: scratchRepoOwner,
    scratch_repo_name: scratchRepoName,
  })

  if (!idea) return Response.json({ error: 'Failed to create idea' }, { status: 500 })
  return Response.json({ idea })
}

// PATCH — update an idea (status, verdict, morning_note)
export async function PATCH(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '').trim()
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  const updates: Record<string, any> = {}
  if (body.status !== undefined) updates.status = body.status
  if (body.verdict !== undefined) updates.verdict = body.verdict
  if (body.verdict_reasoning !== undefined) updates.verdict_reasoning = body.verdict_reasoning
  if (body.morning_note !== undefined) updates.morning_note = body.morning_note

  if (Object.keys(updates).length === 0) {
    return Response.json({ error: 'No fields to update' }, { status: 400 })
  }

  await updateOvernightIdea(id, uid, updates)
  return Response.json({ ok: true })
}

// DELETE — remove an idea
export async function DELETE(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 })

  await deleteOvernightIdea(id, uid)
  return Response.json({ ok: true })
}
