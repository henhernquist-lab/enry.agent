import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

export const maxDuration = 60

export async function POST(req: Request) {
  const { repo, useCase } = await req.json()

  if (!repo || !useCase || typeof useCase !== 'string') {
    return Response.json({ error: 'Missing repo or useCase' }, { status: 400 })
  }

  const apiKey = process.env.GLM_API_KEY ?? ''
  if (!apiKey) {
    return Response.json({ error: 'No API key configured' }, { status: 500 })
  }

  const context = [
    `Repository: ${repo.name}`,
    repo.description ? `Description: ${repo.description}` : '',
    repo.language ? `Language: ${repo.language}` : '',
    `Stars: ${repo.stars ?? 0}`,
    (repo.topics ?? []).length > 0 ? `Topics: ${(repo.topics ?? []).join(', ')}` : '',
    '',
    'Key files:',
    (repo.fileTree ?? []).slice(0, 50).join('\n'),
    '',
    'README excerpt:',
    (repo.readme ?? '').slice(0, 4000),
  ].filter(Boolean).join('\n')

  const system = `You are a technical evaluator. Analyze a GitHub repo against a user's stated use case.

Output EXACTLY three sections with these headers — no preamble, no closing remarks:

## Fit Assessment
Does this repo fit the use case? Why or why not? Be specific about what it does and doesn't cover. Rate the fit: Strong / Partial / Weak.

## Integration Approach
How would someone integrate this into their project? As a dependency? A fork? A reference implementation? Be concrete — mention specific entry points, APIs, or patterns visible in the repo.

## Setup Steps
Concrete steps to get this working, based on what's actually in the README and package files. Include install commands, config, and how to invoke it. If the README lacks setup info, say so and infer what you can from the file structure.`

  const client = createOpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  })

  try {
    const { text } = await generateText({
      model: client.chat('z-ai/glm-5.2'),
      system,
      prompt: `Repo context:\n\n${context}\n\n---\n\nMy use case: ${useCase}`,
    })
    return Response.json({ text })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('repo-analyze error:', detail)
    const userMsg = detail.includes('context length') || detail.includes('too long')
      ? 'Repo too large to analyze. Try a smaller repo.'
      : `Analysis failed: ${detail.slice(0, 200)}`
    return Response.json({ error: userMsg }, { status: 500 })
  }
}
