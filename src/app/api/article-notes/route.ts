import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { resolveResourceUserId } from '@/lib/resource-user'
import { processArticleUrl } from '@/lib/article-processing'
import type { ArticleNotePayload } from '@/lib/resources'

export const maxDuration = 120

function userId(session: { user?: { id?: string } } | null): string | null {
  return (session?.user as { id?: string } | undefined)?.id ?? null
}

export async function POST(req: Request) {
  // Outer catch — ensures the client always gets JSON, never an HTML error page
  try {
    console.log('[article-notes] POST received')

    const session = await auth()
    const uid = await resolveResourceUserId(userId(session))
    console.log('[article-notes] auth uid:', uid ?? 'null')
    if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { url, user_note } = body
    console.log('[article-notes] url:', url)

    const result = await processArticleUrl(url)
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: result.status })
    }
    const { articleTitle, sourceDomain, rawTextLength, summary, keyClaims, flashcards, tags, processingFailed } = result.data

    // ── Save to DB ────────────────────────────────────────────────────────────
    console.log('[article-notes] DB insert, processingFailed:', processingFailed)
    const payload: ArticleNotePayload = {
      url,
      source_domain: sourceDomain,
      article_title: articleTitle,
      fetched_at: new Date().toISOString(),
      raw_text_length: rawTextLength,
      summary,
      key_claims: keyClaims,
      flashcards,
      tags,
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
      .select('id, type, source, title, payload, created_at, updated_at')
      .single()

    if (dbError) {
      console.error('[article-notes] DB insert failed:', dbError)
      return Response.json({ error: 'Failed to save to database.' }, { status: 500 })
    }

    console.log('[article-notes] saved, id:', data.id)

    // ── Embed fire-and-forget ─────────────────────────────────────────────────
    if (!processingFailed) {
      const embText = [articleTitle, summary, ...tags].filter(Boolean).join('\n\n')
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
