import { auth } from '@/lib/auth'
import { getAutoTriggeredSkills, setAutoTrigger, removeAutoTrigger } from '@/lib/skills/auto-trigger'
import { resolveResourceUserId } from '@/lib/resource-user'

// GET  /api/skills/auto-triggers — list user's auto-triggered skills
// POST /api/skills/auto-triggers — enable auto-trigger for a skill
// DELETE /api/skills/auto-triggers — disable auto-trigger for a skill

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const slugs = await getAutoTriggeredSkills(uid)
  return Response.json({ slugs })
}

export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { skill_slug } = await req.json()
  if (!skill_slug || typeof skill_slug !== 'string') {
    return Response.json({ error: 'Missing skill_slug' }, { status: 400 })
  }

  const ok = await setAutoTrigger(uid, skill_slug)
  if (!ok) {
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }
  return Response.json({ success: true })
}

export async function DELETE(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)
  if (!uid) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { skill_slug } = await req.json()
  if (!skill_slug || typeof skill_slug !== 'string') {
    return Response.json({ error: 'Missing skill_slug' }, { status: 400 })
  }

  const ok = await removeAutoTrigger(uid, skill_slug)
  if (!ok) {
    return Response.json({ error: 'Failed to remove' }, { status: 500 })
  }
  return Response.json({ success: true })
}
