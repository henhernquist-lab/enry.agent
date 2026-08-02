import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { readRequestJson } from '@/lib/request-json'

export const maxDuration = 60

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

const LARP_SYSTEM_PROMPT = `You are a LARP Engine — a senior product engineer who analyzes software and extracts ideas worth borrowing. You do NOT summarize repositories. You answer one question: "If I were building your project, what would I steal from this, and why?"

## Output Format

Return a JSON object with exactly this structure — no preamble, no markdown wrapping:

{
  "repo_name": string,
  "repo_description": string,
  "analysis_summary": "2-3 sentence high-level takeaway about what makes this repo interesting from a product perspective",
  "features": [
    {
      "name": "Feature name (short, punchy)",
      "what_it_does": "Concrete description of the feature/pattern/decision",
      "why_valuable": "Why this is worth borrowing — what problem it solves, what insight it represents",
      "difficulty": "Low" | "Medium" | "High",
      "build_effort": "Rough estimate (e.g. '2-4 days', '1-2 weeks')",
      "how_enry_could_improve": "How Golem could do this better — a concrete improvement over the original",
      "fits_enry": 1-10,
      "category": "UX Pattern" | "Architecture" | "Workflow" | "Implementation" | "Product Decision",
      "novelty": 1-10,
      "maintenance_cost": "Low" | "Medium" | "High",
      "user_value": 1-10,
      "architecture_fit": 1-10,
      "recommendation_score": 1-10
    }
  ],
  "what_to_skip": [
    "Feature/pattern from this repo that is NOT worth borrowing and why"
  ]
}

## Analysis Rules

- Extract product IDEAS, not code summaries. Look for UX patterns, architecture decisions, workflow innovations, clever implementation techniques.
- Every feature must answer: why would someone building a different product want this?
- Be specific. "Good error handling" is useless. "Categorizes errors into user-fixable vs. admin-only with a single-click escalation path" is useful.
- The novelty score reflects how uncommon/clever the idea is relative to typical software. A standard REST API is 1-2. A novel interaction pattern is 8-9.
- recommendation_score = overall worthiness of borrowing. Weight user_value and architecture_fit higher than novelty.
- what_to_skip should call out features that look impressive but would be a bad fit — too complex, too coupled to the repo's domain, or the wrong tradeoff for most projects.
- If a project context is provided, prioritize features that fit that context. In what_to_skip, explain why other features were deprioritized.

## Important
- Never invent features. Only extract what's actually visible in the repo data provided.
- If the README or file tree doesn't reveal enough, say so in analysis_summary and return fewer, higher-confidence features.
- Do not include more than 8 features. Quality over quantity.`

export async function POST(req: Request) {
  const { url, projectContext, featureIdea } = await readRequestJson(req)

  const hasUrl = typeof url === 'string' && url.trim().length > 0
  const hasFeatureIdea = typeof featureIdea === 'string' && featureIdea.trim().length > 0

  if (!hasUrl && !hasFeatureIdea) {
    return Response.json({ error: 'Provide a repo URL, feature idea, or both' }, { status: 400 })
  }

  const apiKey = process.env.DEEPSEEK_API_KEY ?? ''
  if (!apiKey) {
    return Response.json({ error: 'No API key configured' }, { status: 500 })
  }

  // Fetch repo data if URL provided
  let repoData: {
    name: string
    description: string
    stars: number
    language: string
    topics: string[]
    readme: string
    fileTree: string[]
  } | null = null

  if (hasUrl) {
    const parsed = parseGithubUrl(url.trim())
    if (!parsed) {
      return Response.json({ error: 'Invalid GitHub URL' }, { status: 400 })
    }

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

    repoData = {
      name: info.full_name ?? info.name,
      description: info.description ?? '',
      stars: info.stargazers_count ?? 0,
      language: info.language ?? '',
      topics: info.topics ?? [],
      readme,
      fileTree,
    }
  }

  // Build the prompt context
  const repoContext = repoData
    ? [
        `Repository: ${repoData.name}`,
        repoData.description ? `Description: ${repoData.description}` : '',
        repoData.language ? `Language: ${repoData.language}` : '',
        `Stars: ${repoData.stars}`,
        repoData.topics.length > 0 ? `Topics: ${repoData.topics.join(', ')}` : '',
        '',
        'Key files (first 200):',
        repoData.fileTree.slice(0, 100).join('\n'),
        '',
        'README excerpt:',
        repoData.readme.slice(0, 4000),
      ].filter(Boolean).join('\n')
    : ''

  const userPromptParts: string[] = []
  if (repoContext) {
    userPromptParts.push(`## Repository to analyze\n\n${repoContext}`)
  }
  if (projectContext && typeof projectContext === 'string' && projectContext.trim()) {
    userPromptParts.push(`## My project context\n\nI'm building: ${projectContext.trim()}\n\nPrioritize ideas that fit this context. Explain why other ideas were deprioritized.`)
  }
  if (hasFeatureIdea) {
    userPromptParts.push(`## Feature I want to explore\n\n${featureIdea.trim()}\n\nIf a repo was provided, analyze it for ideas related to this feature. If no repo was provided, recommend repos, products, or patterns worth studying for this feature.`)
  }

  const userPrompt = userPromptParts.join('\n\n---\n\n')

  const client = createOpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  })

  try {
    const { text } = await generateText({
      model: client.chat('deepseek-ai/deepseek-v4-pro'),
      system: LARP_SYSTEM_PROMPT,
      prompt: userPrompt,
      temperature: 0.7,
    })

    // Parse the JSON response — it may be wrapped in markdown code blocks
    let jsonStr = text.trim()
    const jsonMatch = jsonStr.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim()
    }

    const result = JSON.parse(jsonStr)
    return Response.json(result)
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('larp analyze error:', detail)
    const userMsg = detail.includes('context length') || detail.includes('too long')
      ? 'Repo too large to analyze. Try a smaller repo.'
      : detail.includes('JSON')
        ? 'Model returned invalid JSON. Try again — this is occasionally flaky with very large repos.'
        : `Analysis failed: ${detail.slice(0, 200)}`
    return Response.json({ error: userMsg }, { status: 500 })
  }
}
