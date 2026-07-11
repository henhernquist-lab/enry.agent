import { supabase } from '@/lib/supabase'
import { generateEmbedding } from '@/lib/embeddings'
import { resolveResourceUserId } from '@/lib/resource-user'
import { processArticleUrl } from '@/lib/article-processing'
import { generatePrompt, CATEGORY_ROTATION } from '@/lib/prompt-generation'
import { generateApertureForUser } from '@/lib/aperture'
import { generateBriefingForUser } from '@/lib/chief-of-staff'
import type { ArticleNotePayload, PromptPayload } from '@/lib/resources'
import articleSources from '@/data/article-sources.json'

export const maxDuration = 120

const OWNER_EMAIL = process.env.OWNER_EMAIL ?? ''

interface ArticleSource {
  url: string
  topic: string
}

async function getOwnerGoogleId(): Promise<string | null> {
  if (!OWNER_EMAIL) return null
  const { data } = await supabase
    .from('profiles')
    .select('google_id')
    .eq('email', OWNER_EMAIL)
    .maybeSingle()
  return data?.google_id ?? null
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get('authorization')
  if (!secret || auth !== `Bearer ${secret}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const googleId = await getOwnerGoogleId()
  const uid = await resolveResourceUserId(googleId)
  if (!uid) {
    console.error('[cron/daily-content] could not resolve owner profile — check OWNER_EMAIL')
    return Response.json({ error: 'Owner profile not found' }, { status: 500 })
  }

  const promptResults = await generateDailyPrompts(uid)
  const articleResults = await generateDailyArticles(uid)

  // The Aperture generates first, then the Chief of Staff briefing (which can
  // reference the day's question). Each is independently guarded so a failure
  // in one never blocks the other — log, skip, retry next day.
  let aperture: { status: string; id?: string } = { status: 'skipped' }
  try {
    aperture = await generateApertureForUser(uid)
  } catch (err) {
    console.error('[cron/daily-content] aperture threw:', err)
    aperture = { status: 'error' }
  }

  let briefing: { status: string; id?: string } = { status: 'skipped' }
  try {
    briefing = await generateBriefingForUser(uid, 'cron')
  } catch (err) {
    console.error('[cron/daily-content] briefing threw:', err)
    briefing = { status: 'error' }
  }

  return Response.json({ ok: true, prompts: promptResults, articles: articleResults, aperture, briefing })
}

async function generateDailyPrompts(uid: string): Promise<Array<{ category: string; status: string; id?: string }>> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('tools_data')
    .eq('id', uid)
    .maybeSingle()

  const toolsData = (profile?.tools_data as Record<string, unknown> | null) ?? {}
  const dailyContent = (toolsData.daily_content as { promptCategoryIndex?: number } | undefined) ?? {}
  const cursor = dailyContent.promptCategoryIndex ?? 0

  const results: Array<{ category: string; status: string; id?: string }> = []

  for (let i = 0; i < 3; i++) {
    const category = CATEGORY_ROTATION[(cursor + i) % CATEGORY_ROTATION.length]
    try {
      const generated = await generatePrompt(category)
      if (!generated) {
        results.push({ category, status: 'generation_failed' })
        continue
      }

      const payload: PromptPayload = {
        body: generated.body,
        category: generated.category,
        tags: generated.tags,
        notes: generated.notes || undefined,
      }

      const { data, error } = await supabase
        .from('resources')
        .insert({
          user_id: uid,
          type: 'prompt',
          source: 'daily_auto',
          title: generated.title.slice(0, 200),
          payload,
        })
        .select('id')
        .single()

      if (error) {
        console.error('[cron/daily-content] prompt insert failed:', error)
        results.push({ category, status: 'insert_failed' })
        continue
      }

      const embText = [generated.title, generated.body, ...generated.tags].filter(Boolean).join('\n\n')
      generateEmbedding(embText)
        .then((embedding) => {
          if (embedding) supabase.from('resources').update({ embedding }).eq('id', data.id).then()
        })
        .catch((e) => console.error('[cron/daily-content] prompt embedding failed:', e))

      results.push({ category, status: 'ok', id: data.id })
    } catch (err) {
      console.error('[cron/daily-content] prompt generation threw for', category, err)
      results.push({ category, status: 'error' })
    }
  }

  const newCursor = (cursor + 3) % CATEGORY_ROTATION.length
  await supabase
    .from('profiles')
    .update({ tools_data: { ...toolsData, daily_content: { ...dailyContent, promptCategoryIndex: newCursor } } })
    .eq('id', uid)

  return results
}

async function generateDailyArticles(uid: string): Promise<Array<{ url: string; status: string; id?: string }>> {
  const { data: existing } = await supabase
    .from('resources')
    .select('payload')
    .eq('user_id', uid)
    .eq('type', 'article_note')

  const existingUrls = new Set(
    (existing ?? []).map((r) => (r.payload as ArticleNotePayload)?.url).filter(Boolean),
  )

  const candidates = (articleSources as ArticleSource[]).filter((a) => !existingUrls.has(a.url))

  if (candidates.length < 3) {
    console.warn(
      `[cron/daily-content] only ${candidates.length} unprocessed article URLs remain in article-sources.json — refresh the list`,
    )
  }

  const picks = candidates.slice(0, 10)
  const results: Array<{ url: string; status: string; id?: string }> = []

  for (const { url, topic } of picks) {
    try {
      const result = await processArticleUrl(url)
      if (!result.ok) {
        console.error('[cron/daily-content] article processing failed for', url, result.error)
        results.push({ url, status: 'processing_failed' })
        continue
      }

      const { articleTitle, sourceDomain, rawTextLength, summary, keyClaims, flashcards, tags, processingFailed } = result.data

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
        topic: topic as ArticleNotePayload['topic'],
        ...(processingFailed ? { processing_failed: true } : {}),
      }

      const { data, error } = await supabase
        .from('resources')
        .insert({
          user_id: uid,
          type: 'article_note',
          source: 'daily_auto',
          title: articleTitle.slice(0, 200),
          payload,
        })
        .select('id')
        .single()

      if (error) {
        console.error('[cron/daily-content] article insert failed:', error)
        results.push({ url, status: 'insert_failed' })
        continue
      }

      if (!processingFailed) {
        const embText = [articleTitle, summary, ...tags].filter(Boolean).join('\n\n')
        generateEmbedding(embText)
          .then((embedding) => {
            if (embedding) supabase.from('resources').update({ embedding }).eq('id', data.id).then()
          })
          .catch((e) => console.error('[cron/daily-content] article embedding failed:', e))
      }

      results.push({ url, status: 'ok', id: data.id })
    } catch (err) {
      console.error('[cron/daily-content] article processing threw for', url, err)
      results.push({ url, status: 'error' })
    }
  }

  return results
}
