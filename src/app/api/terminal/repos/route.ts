import { auth } from '@/lib/auth'
import { listRepos } from '@/lib/github'

export const maxDuration = 30

// Thin wrapper over the existing listRepos for the terminal's repo selector.
export async function GET() {
  const session = await auth()
  const githubToken = (session as { githubToken?: string } | null)?.githubToken
  if (!githubToken) {
    return Response.json({ repos: [], error: 'GitHub not connected' }, { status: 400 })
  }

  const { repos, error } = await listRepos(githubToken)
  if (error) return Response.json({ repos: [], error }, { status: 502 })

  return Response.json({
    repos: repos.map((r) => ({ full_name: r.full_name, default_branch: r.default_branch, private: r.private })),
  })
}
