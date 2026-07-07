import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { tavily } from '@tavily/core'

export interface ArticleAnalysis {
  articleTitle: string
  sourceDomain: string
  rawTextLength: number
  summary: string
  keyClaims: string[]
  flashcards: { q: string; a: string }[]
  tags: string[]
  processingFailed: boolean
}

export type ProcessArticleResult =
  | { ok: true; data: ArticleAnalysis }
  | { ok: false; status: number; error: string }

function buildPrompt(title: string, url: string, text: string): string {
  return `You are a precise research analyst. Given the article below, respond with valid JSON only — no markdown fences, no explanation, no preamble.

Article title: ${title}
Source: ${url}

--- ARTICLE CONTENT START ---
${text}
--- ARTICLE CONTENT END ---

Produce this exact JSON shape:
{
  "summary": "string — 3 to 5 sentences. State the core argument, the key evidence, and what it means. Cut all fluff.",
  "key_claims": ["string"],
  "flashcards": [{"q": "string", "a": "string"}],
  "tags": ["string"]
}

Rules:
• summary: What is the core argument? What is the evidence? What does it mean? No summaries of structure ("the author begins by...").
• key_claims: 3–7 load-bearing claims the article makes. One sentence each. Specific, not vague.
• flashcards: 5–10 pairs. Atomic — one fact per card. Testable and factual. A good card tests whether you understood the piece, not whether you read it.
• tags: 3–6 lowercase topical tags (e.g. "nutrition", "machine-learning", "track-and-field").
• Return ONLY the JSON object. If the content is too thin, garbled, or not a real article, return {"error": "reason"}.`
}

// Shared by the interactive /api/article-notes route and the daily cron route —
// Tavily extract + Qwen summarize/flashcard generation, no DB access here.
export async function processArticleUrl(url: string): Promise<ProcessArticleResult> {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('not http/https')
  } catch {
    return { ok: false, status: 400, error: 'Invalid URL. Must start with http:// or https://' }
  }

  const sourceDomain = parsedUrl.hostname.replace(/^www\./, '')

  let rawContent: string
  let articleTitle: string

  try {
    const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY ?? '' })
    const result = await tavilyClient.extract([url], {
      extractDepth: 'advanced',
      format: 'markdown',
    })

    const extracted = result.results?.[0]
    if (!extracted?.rawContent) {
      const failReason = result.failedResults?.[0]?.error ?? 'no content returned'
      return {
        ok: false,
        status: 422,
        error: `Couldn't extract content from this URL (${failReason}). It may be paywalled or JavaScript-only.`,
      }
    }
    rawContent = extracted.rawContent
    articleTitle = (extracted.title ?? parsedUrl.hostname).slice(0, 300)
  } catch (err) {
    console.error('[article-processing] Tavily extract threw:', err)
    return { ok: false, status: 502, error: 'Failed to fetch the article. Check the URL and try again.' }
  }

  if (rawContent.trim().length < 200) {
    return { ok: false, status: 422, error: "Couldn't extract meaningful content from this URL. Try another." }
  }

  const truncated = rawContent.slice(0, 30000)

  let summary = ''
  let keyClaims: string[] = []
  let flashcards: { q: string; a: string }[] = []
  let tags: string[] = []
  let processingFailed = false

  try {
    // Qwen instead of the app-wide default (deepseek-v4-pro) — deepseek took
    // 90s-3min on long articles, blowing past any reasonable request timeout.
    const client = createOpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.QWEN_API_KEY ?? '',
    })

    const { text } = await generateText({
      model: client.chat('qwen/qwen3.5-122b-a10b'),
      prompt: buildPrompt(articleTitle, url, truncated),
      temperature: 0.1,
      maxOutputTokens: 4096,
    })

    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    if (parsed.error) {
      return { ok: false, status: 422, error: `Content issue: ${parsed.error}` }
    }

    summary = typeof parsed.summary === 'string' ? parsed.summary : ''
    keyClaims = Array.isArray(parsed.key_claims) ? parsed.key_claims.filter((c: unknown) => typeof c === 'string') : []
    flashcards = Array.isArray(parsed.flashcards)
      ? parsed.flashcards.filter((f: unknown) => f && typeof (f as { q: unknown }).q === 'string' && typeof (f as { a: unknown }).a === 'string')
      : []
    tags = Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === 'string') : []
  } catch (err) {
    console.error('[article-processing] model/parse failed:', err)
    processingFailed = true
  }

  return {
    ok: true,
    data: {
      articleTitle,
      sourceDomain,
      rawTextLength: rawContent.length,
      summary,
      keyClaims,
      flashcards,
      tags,
      processingFailed,
    },
  }
}
