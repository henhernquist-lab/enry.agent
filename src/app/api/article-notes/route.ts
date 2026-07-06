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
  // Outer catch — ensures the client always gets JSON, never an HTML error page
  try {
    console.log('[article-notes] POST received')

    const session = await auth()
    const uid = userId(session)
    console.log('[article-notes] auth uid:', uid ?? 'null')
    if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { url, user_note } = body
    console.log('[article-notes] url:', url)

    // Validate URL
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) throw new Error('not http/https')
    } catch {
      return Response.json({ error: 'Invalid URL. Must start with http:// or https://' }, { status: 400 })
    }

    const source_domain = parsedUrl.hostname.replace(/^www\./, '')

    // ── Step 1: Extract article via Tavily ───────────────────────────────────
    console.log('[article-notes] step 1: Tavily extract for', source_domain)
    let rawContent: string
    let articleTitle: string

    try {
      const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY ?? '' })
      const result = await tavilyClient.extract([url], {
        extractDepth: 'advanced',
        format: 'markdown',
      })
      console.log('[article-notes] Tavily result count:', result.results?.length, 'failed:', result.failedResults?.length)

      const extracted = result.results?.[0]
      if (!extracted?.rawContent) {
        const failReason = result.failedResults?.[0]?.error ?? 'no content returned'
        console.error('[article-notes] Tavily returned no content:', failReason)
        return Response.json({
          error: `Couldn't extract content from this URL (${failReason}). It may be paywalled or JavaScript-only.`,
        }, { status: 422 })
      }
      rawContent = extracted.rawContent
      articleTitle = (extracted.title ?? parsedUrl.hostname).slice(0, 300)
      console.log('[article-notes] extracted', rawContent.length, 'chars, title:', articleTitle.slice(0, 60))
    } catch (err) {
      console.error('[article-notes] Tavily extract threw:', err)
      return Response.json({
        error: 'Failed to fetch the article. Check the URL and try again.',
      }, { status: 502 })
    }

    if (rawContent.trim().length < 200) {
      return Response.json({
        error: "Couldn't extract meaningful content from this URL. Try another.",
      }, { status: 422 })
    }

    const truncated = rawContent.slice(0, 30000)

    // ── Step 2: Generate summary + claims + flashcards + tags ────────────────
    console.log('[article-notes] step 2: model call, text length:', truncated.length)
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

      console.log('[article-notes] model responded, raw length:', text.length, 'preview:', text.slice(0, 120))

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
      console.log('[article-notes] parsed:', analysisResult.key_claims.length, 'claims,', analysisResult.flashcards.length, 'cards')
    } catch (err) {
      console.error('[article-notes] model/parse failed:', err)
      processingFailed = true
      analysisResult = { summary: '', key_claims: [], flashcards: [], tags: [] }
    }

    // ── Step 3: Save to DB ───────────────────────────────────────────────────
    console.log('[article-notes] step 3: DB insert, processingFailed:', processingFailed)
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

    const { data, error: dbError } = await supabase
      .from('resources')
      .insert({
        user_id: uid,
        type: 'article_note',
        title: articleTitle.slice(0, 200),
        payload,
      })
      .select('id, type, title, payload, created_at, updated_at')
      .single()

    if (dbError) {
      console.error('[article-notes] DB insert failed:', dbError)
      return Response.json({ error: 'Failed to save to database.' }, { status: 500 })
    }

    console.log('[article-notes] saved, id:', data.id)

    // ── Step 4: Embed fire-and-forget ────────────────────────────────────────
    if (!processingFailed) {
      const embText = [articleTitle, analysisResult.summary, ...analysisResult.tags]
        .filter(Boolean)
        .join('\n\n')
      generateEmbedding(embText)
        .then((embedding) => {
          if (embedding) supabase.from('resources').update({ embedding }).eq('id', data.id).then()
        })
        .catch((e) => console.error('[article-notes] embedding failed:', e))
    }

    return Response.json({ resource: data, processing_failed: processingFailed })

  } catch (err) {
    // Catch-all: log the full error and return JSON so the client never sees "Network error"
    console.error('[article-notes] unhandled error in POST handler:', err)
    return Response.json({
      error: `Server error: ${err instanceof Error ? err.message : String(err)}`,
    }, { status: 500 })
  }
}
