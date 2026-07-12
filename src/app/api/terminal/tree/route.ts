import { auth } from '@/lib/auth'
import { getRepoTree } from '@/lib/github'

export const maxDuration = 30

const REPO_RE = /^[\w.-]+\/[\w.-]+$/

// Returns a repo's file list for the coding-agent sidebar tree. Read-only,
// reuses the same getRepoTree the read-only terminal already uses; the client
// builds the nested tree from these flat paths.
export async function POST(req: Request) {
  const session = await auth()
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  if (!githubToken) return Response.json({ error: 'GitHub not connected' }, { status: 400 })

  const body = await req.json()
  const repo = String(body.repo ?? '').trim()
  const branch = String(body.branch ?? '').trim()
  if (!REPO_RE.test(repo)) return Response.json({ error: 'Invalid repo' }, { status: 400 })

  const [owner, name] = repo.split('/')
  const { tree, error } = await getRepoTree(githubToken, owner, name, branch || 'HEAD')
  if (error) return Response.json({ error, paths: [] }, { status: 502 })

  // Cap the payload — huge monorepos would otherwise ship tens of thousands of
  // paths to the client. The tree view is for orientation, not exhaustive.
  return Response.json({ paths: tree.map((t) => t.path).slice(0, 2000) })
}
