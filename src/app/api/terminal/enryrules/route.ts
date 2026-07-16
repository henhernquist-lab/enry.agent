import { auth } from '@/lib/auth'
import { resolveResourceUserId } from '@/lib/resource-user'
import { getFileContent } from '@/lib/github'
import { createFile, updateFile, createBranch } from '@/lib/github-write'

const ENRYRULES_PATH = '.enryrules'

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function GET(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  if (!githubToken) {
    return Response.json({ error: 'GitHub not connected' }, { status: 400 })
  }

  const { searchParams } = new URL(req.url)
  const repo = searchParams.get('repo') ?? ''
  const [owner, name] = repo.split('/')
  if (!owner || !name) {
    return Response.json({ error: 'Invalid repo. Use owner/name.' }, { status: 400 })
  }

  const { content, error } = await getFileContent(githubToken, owner, name, ENRYRULES_PATH)
  if (error) return Response.json({ error }, { status: 500 })

  return Response.json({ exists: content !== null, content: content ?? '' })
}

export async function PUT(req: Request) {
  const session = await auth()
  const uid = await resolveResourceUserId(userId(session))
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  if (!githubToken) {
    return Response.json({ error: 'GitHub not connected' }, { status: 400 })
  }

  const body = await req.json()
  const repo = String(body.repo ?? '').trim()
  const content = String(body.content ?? '')
  const [owner, name] = repo.split('/')
  if (!owner || !name) {
    return Response.json({ error: 'Invalid repo. Use owner/name.' }, { status: 400 })
  }

  // Read existing file to check if it exists (for SHA if updating) and get default branch
  const { content: existing, error: readErr } = await getFileContent(githubToken, owner, name, ENRYRULES_PATH)
  if (readErr && !readErr.includes('404')) {
    return Response.json({ error: `Could not read .enryrules: ${readErr}` }, { status: 500 })
  }

  const branch = 'main' // enryrules changes go to default branch
  const message = existing !== null
    ? 'Update .enryrules'
    : 'Create .enryrules'

  let result
  if (existing !== null) {
    result = await updateFile(githubToken, owner, name, ENRYRULES_PATH, content, message, branch)
  } else {
    result = await createFile(githubToken, owner, name, ENRYRULES_PATH, content, message, branch)
  }

  if (!result.ok) {
    return Response.json({ error: result.error ?? 'Failed to save .enryrules' }, { status: 500 })
  }

  return Response.json({ ok: true, url: result.url })
}
