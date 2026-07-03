export const maxDuration = 30

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  try {
    const u = new URL(url)
    if (u.hostname !== 'github.com') return null
    const parts = u.pathname.replace(/^\//, '').replace(/\/$/, '').split('/')
    if (parts.length < 2) return null
    return { owner: parts[0], repo: parts[1] }
  } catch {
    return null
  }
}

export async function POST(req: Request) {
  const { url } = await req.json()
  if (!url) return Response.json({ error: 'Missing url' }, { status: 400 })

  const parsed = parseGithubUrl(url)
  if (!parsed) return Response.json({ error: 'Invalid GitHub URL' }, { status: 400 })

  const { owner, repo } = parsed
  const headers: HeadersInit = { Accept: 'application/vnd.github+json' }
  const ghToken = process.env.GITHUB_TOKEN
  if (ghToken) headers['Authorization'] = `Bearer ${ghToken}`

  const [infoRes, readmeRes, treeRes] = await Promise.allSettled([
    fetch(`https://api.github.com/repos/${owner}/${repo}`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers }),
    fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`, { headers }),
  ])

  if (infoRes.status === 'rejected' || !infoRes.value.ok) {
    return Response.json({ error: 'Repo not found or not accessible' }, { status: 404 })
  }

  const info = await infoRes.value.json()

  let readme = ''
  if (readmeRes.status === 'fulfilled' && readmeRes.value.ok) {
    const readmeData = await readmeRes.value.json()
    if (readmeData.content) {
      readme = Buffer.from(readmeData.content, 'base64').toString('utf-8').slice(0, 6000)
    }
  }

  let fileTree: string[] = []
  if (treeRes.status === 'fulfilled' && treeRes.value.ok) {
    const treeData = await treeRes.value.json()
    fileTree = (treeData.tree ?? [])
      .filter((f: { type: string }) => f.type === 'blob')
      .map((f: { path: string }) => f.path)
      .slice(0, 200)
  }

  return Response.json({
    name: info.name,
    description: info.description ?? '',
    stars: info.stargazers_count,
    language: info.language ?? '',
    topics: info.topics ?? [],
    readme,
    fileTree,
  })
}
