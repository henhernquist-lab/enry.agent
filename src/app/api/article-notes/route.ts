import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { tavily } from '@tavily/core'
import type { ArticleNotePayload } from '@/lib/resources'

export const maxDuration = 60

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

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

export async function POST(req: Request) {
  const session = await auth()
  const uid = userId(session)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { url, user_note } = body

  // Validate URL
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('not http/https')
  } catch {
    return Response.json({ error: 'Invalid URL. Must start with http:// or https://' }, { status: 400 })
  }

  const source_domain = parsedUrl.hostname.replace(/^www\./, '')

  // ── Step 1: Extract article content via Tavily ────────────────────────────
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
      return Response.json({
        error: "Couldn't extract content from this URL. It may be paywalled or JavaScript-only.",
      }, { status: 422 })
    }
    rawContent = extracted.rawContent
    articleTitle = (extracted.title ?? parsedUrl.hostname).slice(0, 300)
  } catch (err) {
    console.error('[article-notes] Tavily extract failed:', err)
    return Response.json({
      error: 'Failed to fetch the article. Check the URL and try again.',
    }, { status: 502 })
  }

  if (rawContent.trim().length < 200) {
    return Response.json({
      error: "Couldn't extract meaningful content from this URL. Try another.",
    }, { status: 422 })
  }

  // Truncate to protect context window
  const truncated = rawContent.slice(0, 30000)

  // ── Step 2: Generate summary + claims + flashcards + tags ─────────────────
  let analysisResult: {
    summary: string
    key_claims: string[]
    flashcards: { q: string; a: string }[]
    tags: string[]
  }
  let processingFailed = false

  try {
    const client = createOpenAI({
      baseURL: 'https://integrate.api.nvidia.com/v1',
      apiKey: process.env.DEEPSEEK_API_KEY ?? '',
    })

    const { text } = await generateText({
      model: client.chat('deepseek-ai/deepseek-v4-pro'),
      prompt: buildPrompt(articleTitle, url, truncated),
      temperature: 0.1,
    })

    // Strip possible markdown fences before parsing
    const cleaned = text
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim()

    const parsed = JSON.parse(cleaned)

    if (parsed.error) {
      return Response.json({ error: `Content issue: ${parsed.error}` }, { status: 422 })
    }

    analysisResult = {
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      key_claims: Array.isArray(parsed.key_claims) ? parsed.key_claims.filter((c: unknown) => typeof c === 'string') : [],
      flashcards: Array.isArray(parsed.flashcards)
        ? parsed.flashcards.filter((f: unknown) => f && typeof (f as { q: unknown }).q === 'string' && typeof (f as { a: unknown }).a === 'string')
        : [],
      tags: Array.isArray(parsed.tags) ? parsed.tags.filter((t: unknown) => typeof t === 'string') : [],
    }
  } catch (err) {
    console.error('[article-notes] Model call failed:', err)
    processingFailed = true
    analysisResult = { summary: '', key_claims: [], flashcards: [], tags: [] }
  }

  // ── Step 3: Build payload and save ───────────────────────────────────────
  const payload: ArticleNotePayload = {
    url,
    source_domain,
    article_title: articleTitle,
    fetched_at: new Date().toISOString(),
    raw_text_length: rawContent.length,
    summary: analysisResult.summary,
    key_claims: analysisResult.key_claims,
    flashcards: analysisResult.flashcards,
    tags: analysisResult.tags,
    ...(user_note?.trim() ? { user_note: user_note.trim() } : {}),
    ...(processingFailed ? { processing_failed: true } : {}),
  }

  const { data, error } = await supabase
    .from('resources')
    .insert({
      user_id: uid,
      type: 'article_note',
      title: articleTitle.slice(0, 200),
      payload,
    })
    .select('id, type, title, payload, created_at, updated_at')
    .single()

  if (error) {
    console.error('[article-notes] DB insert failed:', error)
    return Response.json({ error: 'Failed to save' }, { status: 500 })
  }

  // ── Step 4: Embed (fire-and-forget) ──────────────────────────────────────
  if (!processingFailed) {
    const embText = [articleTitle, analysisResult.summary, ...analysisResult.tags]
      .filter(Boolean)
      .join('\n\n')
    generateEmbedding(embText)
      .then((embedding) => {
        if (embedding) supabase.from('resources').update({ embedding }).eq('id', data.id).then()
      })
      .catch(console.error)
  }

  return Response.json({ resource: data, processing_failed: processingFailed })
}
