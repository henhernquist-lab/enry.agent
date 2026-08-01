import { auth } from '@/lib/auth'
import { createRepo } from '@/lib/github-write'

export const maxDuration = 15

// POST /api/github/create-repo — Create a new GitHub repo under the authenticated user's
// account using their stored OAuth token. Mirrors the auth pattern from
// src/app/api/cruise/repos/enable/route.ts.
export async function POST(req: Request) {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  if (!googleId) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!githubToken) {
    return Response.json(
      { error: 'GitHub not connected. Sign in with GitHub from the login screen first.' },
      { status: 400 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const description = String(body.description ?? '').trim()
  const isPrivate = body.private === true

  // Validate repo name — alphanumeric, hyphens, underscores, dots; 1-100 chars
  if (!name || !/^[\w.-]{1,100}$/.test(name)) {
    return Response.json({ error: 'Invalid repo name. Use letters, numbers, hyphens, underscores, or dots (1-100 characters).' }, { status: 400 })
  }

  const result = await createRepo(githubToken, name, description, isPrivate)

  if (!result.ok) {
    // Surface the error clearly — name collision, auth failure, etc.
    return Response.json({ error: result.error ?? 'Failed to create repository.' }, { status: 422 })
  }

  return Response.json({ url: result.url, name })
}
