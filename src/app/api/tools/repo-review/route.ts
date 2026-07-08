import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { generateEmbedding } from '@/lib/embeddings'
import { resolveResourceUserId } from '@/lib/resource-user'
import { listRepos, getRepoTree, getFileContent } from '@/lib/github'
import type { RepoReviewPayload, RepoReviewIssue } from '@/lib/resources'

export const maxDuration = 90

const CHAR_BUDGET = 50000
const PER_FILE_CAP = 8000
const MAX_TREE_LIST = 200

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

function githubToken(session: unknown): string | null {
  return (session as { githubToken?: string } | null)?.githubToken ?? null
}

// Entry points, config, and /src|/app files rank highest so the ~50K char
// budget is spent on the files most likely to matter for a review.
function priorityScore(path: string, size: number): number {
  const lower = path.toLowerCase()
  let score = 0
  if (/(^|\/)(index|main|app)\.(ts|tsx|js|jsx|py|go|rs)$/.test(lower)) score += 100
  if (/(^|\/)page\.(ts|tsx|js|jsx)$/.test(lower)) score += 90
  if (/^(package\.json|tsconfig\.json|pyproject\.toml|go\.mod|cargo\.toml|requirements\.txt)$/.test(lower)) score += 80
  if (/^readme/.test(lower)) score += 70
  if (lower.startsWith('src/') || lower.startsWith('app/')) score += 30
  score += Math.min(size / 1000, 20)
  return score
}

export async function GET() {
  const session = await auth()
  const token = githubToken(session)
  if (!token) {
    return Response.json({ error: 'GitHub not connected. Sign in with GitHub to use this tool.' }, { status: 401 })
  }

  const { repos, error } = await listRepos(token)
  if (error) return Response.json({ error }, { status: 502 })
  return Response.json({ repos })
}

export async function POST(req: Request) {
  try {
    const session = await auth()
    const uid = await resolveResourceUserId(userId(session))
    if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const token = githubToken(session)
    if (!token) {
      return Response.json({ error: 'GitHub not connected. Sign in with GitHub to use this tool.' }, { status: 401 })
    }

    const body = await req.json()
    const { owner, repo, branch: requestedBranch } = body
    if (!owner || !repo) return Response.json({ error: 'Missing owner/repo' }, { status: 400 })

    const { repos, error: reposError } = await listRepos(token)
    if (reposError) return Response.json({ error: reposError }, { status: 502 })
    const repoMeta = repos.find((r) => r.full_name === `${owner}/${repo}`)
    if (!repoMeta) {
      return Response.json({ error: 'Repo not found or you do not have access to it.' }, { status: 404 })
    }

    const branch = requestedBranch || repoMeta.default_branch || 'main'

    const { tree, error: treeError } = await getRepoTree(token, owner, repo, branch)
    if (treeError) {
      return Response.json({ error: `Could not read repo file tree: ${treeError}` }, { status: 502 })
    }
    if (tree.length === 0) {
      return Response.json({ error: 'Repo appears to be empty.' }, { status: 422 })
    }

    const sorted = [...tree].sort((a, b) => priorityScore(b.path, b.size) - priorityScore(a.path, a.size))

    const filesAnalyzed: string[] = []
    const fileBlocks: string[] = []
    let charTotal = 0
    for (const entry of sorted) {
      if (charTotal >= CHAR_BUDGET) break
      const { content } = await getFileContent(token, owner, repo, entry.path)
      if (!content) continue
      const trimmed = content.slice(0, PER_FILE_CAP)
      if (charTotal + trimmed.length > CHAR_BUDGET) continue
      fileBlocks.push(`### ${entry.path}\n${trimmed}`)
      filesAnalyzed.push(entry.path)
      charTotal += trimmed.length
    }

    if (filesAnalyzed.length === 0) {
      return Response.json({ error: 'Could not read any files from this repo — check access and try again.' }, { status: 422 })
    }

    const partialSample = tree.length > filesAnalyzed.length
    const treeList = sorted.slice(0, MAX_TREE_LIST).map((t) => t.path).join('\n')

    const prompt = `You are a senior software engineer performing a code review. Respond with valid JSON only — no markdown fences, no explanation, no preamble.

Repository: ${owner}/${repo}
Branch: ${branch}
${repoMeta.description ? `Description: ${repoMeta.description}\n` : ''}Primary language: ${repoMeta.language || 'unknown'}
${partialSample ? `Note: this repo has ${tree.length} files; analysis is based on a ${filesAnalyzed.length}-file sample selected by priority (entry points, config, largest files in /src and /app).\n` : ''}
--- FILE TREE (${tree.length} files total, showing up to ${MAX_TREE_LIST}) ---
${treeList}

--- FILE CONTENTS (${filesAnalyzed.length} files sampled, ~${charTotal} chars) ---
${fileBlocks.join('\n\n')}

Produce this exact JSON shape:
{
  "overview": "string — 2-3 sentences: what this repo does and how it's structured",
  "strengths": ["string"],
  "issues": [
    {
      "severity": "high" | "medium" | "low",
      "category": "security" | "architecture" | "code-smell" | "dead-code" | "inconsistency",
      "file": "string — path from the file tree, or \\"general\\" if repo-wide",
      "description": "string — specific and concrete",
      "suggestion": "string — what to do about it"
    }
  ],
  "refactor_priorities": ["string — exactly 3, ranked most-impactful first"]
}

Rules:
• overview: factual and structural — name the stack/framework and folder layout if evident from the sample.
• strengths: 2-4 genuine things done well. Skip generic praise unless actually notable.
• issues: cite the real file path from the tree/sample. Don't invent problems — if the sample looks clean, return fewer issues rather than padding. severity: high = security vuln/data loss/broken behavior, medium = maintainability/architecture concern, low = style/consistency nit.
• refactor_priorities: exactly 3 items, ranked, one concrete sentence each.
• Return ONLY the JSON object.`

    let overview = ''
    let strengths: string[] = []
    let issues: RepoReviewIssue[] = []
    let refactorPriorities: string[] = []

    try {
      const client = createOpenAI({
        baseURL: 'https://integrate.api.nvidia.com/v1',
        apiKey: process.env.GLM_API_KEY ?? '',
      })

      const { text } = await generateText({
        model: client.chat('z-ai/glm-5.2'),
        prompt,
        temperature: 0.2,
        maxOutputTokens: 4096,
      })

      const cleaned = text
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim()

      const parsed = JSON.parse(cleaned)

      overview = typeof parsed.overview === 'string' ? parsed.overview : ''
      strengths = Array.isArray(parsed.strengths)
        ? parsed.strengths.filter((s: unknown): s is string => typeof s === 'string')
        : []
      issues = Array.isArray(parsed.issues)
        ? parsed.issues
            .filter((i: unknown): i is Record<string, unknown> => !!i && typeof i === 'object')
            .map((i: Record<string, unknown>): RepoReviewIssue => ({
              severity: (['high', 'medium', 'low'].includes(i.severity as string)
                ? i.severity
                : 'low') as RepoReviewIssue['severity'],
              category: (['security', 'architecture', 'code-smell', 'dead-code', 'inconsistency'].includes(i.category as string)
                ? i.category
                : 'code-smell') as RepoReviewIssue['category'],
              file: typeof i.file === 'string' ? i.file : 'general',
              description: typeof i.description === 'string' ? i.description : '',
              suggestion: typeof i.suggestion === 'string' ? i.suggestion : '',
            }))
        : []
      refactorPriorities = Array.isArray(parsed.refactor_priorities)
        ? parsed.refactor_priorities.filter((s: unknown): s is string => typeof s === 'string')
        : []

      if (!overview) throw new Error('Model returned no overview')
    } catch (err) {
      console.error('[repo-review] model call/parse failed:', err)
      return Response.json({ error: 'The review model failed to produce a valid result. Try again.' }, { status: 502 })
    }

    const payload: RepoReviewPayload = {
      repo_full_name: `${owner}/${repo}`,
      repo_url: repoMeta.html_url,
      branch,
      reviewed_at: new Date().toISOString(),
      files_analyzed: filesAnalyzed,
      overview,
      strengths,
      issues,
      refactor_priorities: refactorPriorities,
      ...(partialSample ? { partial_sample: true } : {}),
    }

    const { data, error: dbError } = await supabase
      .from('resources')
      .insert({
        user_id: uid,
        type: 'repo_review',
        source: 'user',
        title: `${owner}/${repo} — review`,
        payload,
      })
      .select('id, type, source, title, payload, created_at, updated_at')
      .single()

    if (dbError) {
      console.error('[repo-review] DB insert failed:', dbError)
      return Response.json({ error: 'Failed to save review.' }, { status: 500 })
    }

    const embText = `${owner}/${repo}\n\n${overview}`
    generateEmbedding(embText)
      .then((embedding) => {
        if (embedding) supabase.from('resources').update({ embedding }).eq('id', data.id).then()
      })
      .catch((e) => console.error('[repo-review] embedding failed:', e))

    return Response.json({ resource: data })
  } catch (err) {
    console.error('[repo-review] unhandled error:', err)
    return Response.json({
      error: `Server error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }
}
