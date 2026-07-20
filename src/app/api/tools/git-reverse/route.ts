import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'

export const maxDuration = 60

export async function POST(req: Request) {
  const { repo } = await req.json()

  if (!repo) {
    return Response.json({ error: 'Missing repo data' }, { status: 400 })
  }

  const apiKey = process.env.GLM_API_KEY ?? ''
  if (!apiKey) {
    return Response.json({ error: 'No API key configured' }, { status: 500 })
  }

  const fileSample = (repo.fileTree ?? [])
    .filter((f: string) => !f.includes('node_modules') && !f.includes('.git/'))
    .slice(0, 60)

  const context = [
    `Repository: ${repo.name}`,
    repo.description ? `Description: ${repo.description}` : '',
    repo.language ? `Language: ${repo.language}` : '',
    `Stars: ${repo.stars ?? 0}`,
    (repo.topics ?? []).length > 0 ? `Topics: ${(repo.topics ?? []).join(', ')}` : '',
    '',
    'File structure (first 60 non-vendor files):',
    fileSample.join('\n'),
    '',
    'README excerpt:',
    (repo.readme ?? '').slice(0, 4000),
  ].filter(Boolean).join('\n')

  const system = `You are a technical reverse-engineer. Given a GitHub repo's metadata, file structure, and README, produce a single, well-structured plain-language prompt that someone could hand to a coding agent (like Claude Code or Freebuff) to rebuild an equivalent project from scratch.

The prompt should cover:
1. What the project does and why it exists
2. The architecture — how the pieces fit together (based on the file tree)
3. Key modules/files and what each one handles
4. Tech stack and dependencies
5. How to build it step by step — from project scaffolding to running code

Rules:
- Write in plain language, not code. This is a PROMPT for an agent, not a spec document.
- Be specific about patterns visible in the file tree — don't generalize.
- If the README describes setup, include those exact steps.
- Do NOT include markdown headings like "##" or "###" — just plain paragraphs with line breaks.
- Keep it under 2000 words.
- Start with a one-sentence summary of what this project is.
- End with: "Build this step by step. Start with project scaffolding, then implement each module, then wire them together. Verify it runs before declaring done."`

  const client = createOpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey,
  })

  try {
    const { text } = await generateText({
      model: client.chat('z-ai/glm-5.2'),
      system,
      prompt: `Here is everything I know about the repo:\n\n${context}\n\n---\n\nGenerate the reverse-engineered build prompt now.`,
    })
    return Response.json({ prompt: text })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    console.error('git-reverse error:', detail)
    const userMsg = detail.includes('context length') || detail.includes('too long')
      ? 'Repo too large to reverse-engineer in one pass. Try a smaller repo.'
      : `Reverse-engineering failed: ${detail.slice(0, 200)}`
    return Response.json({ error: userMsg }, { status: 500 })
  }
}
