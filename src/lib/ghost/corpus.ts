import { supabase } from '../supabase'
import type { ResourceType } from '../resources'

// Ghost Mode — corpus assembly.
//
// Temporal slice: ONLY resources created inside the window. The persona's
// knowledge state is built from this slice and nothing else — the knowledge
// cutoff is enforced first at the data layer (nothing after window_end is ever
// fetched), then again in the persona prompt.
//
// Two streams come out of the slice:
//   - voiceSamples: text Henry actually typed (notes, check-in comments,
//     aperture answers, article commentary). These teach the model his voice.
//   - contextFacts: structured events rendered as dated one-liners (workouts,
//     races, saves, questions asked). These teach the model what he knew and
//     was doing. Structured data is context, never voice.

export interface VoiceSample {
  text: string
  createdAt: string
  sourceType: ResourceType
}

export interface GhostCorpus {
  windowStart: string
  windowEnd: string
  voiceSamples: VoiceSample[]
  contextFacts: string[]
  countsByType: Record<string, number>
  corpusResourceIds: string[]
  richness: 'rich' | 'sparse' | 'minimal' | 'insufficient'
}

interface Row {
  id: string
  type: ResourceType
  source: string
  title: string
  payload: Record<string, unknown>
  created_at: string
}

function day(iso: string): string {
  return iso.slice(0, 10)
}

function richnessOf(voiceCount: number): GhostCorpus['richness'] {
  if (voiceCount >= 20) return 'rich'
  if (voiceCount >= 5) return 'sparse'
  if (voiceCount >= 1) return 'minimal'
  return 'insufficient'
}

export async function assembleCorpus(
  userId: string,
  windowStart: string,
  windowEnd: string,
): Promise<GhostCorpus> {
  const { data, error } = await supabase
    .from('resources')
    .select('id, type, source, title, payload, created_at')
    .eq('user_id', userId)
    .gte('created_at', windowStart)
    .lte('created_at', `${windowEnd}T23:59:59.999Z`)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) console.error('[ghost] corpus query error:', error)
  const rows = (data ?? []) as Row[]

  const voiceSamples: VoiceSample[] = []
  const contextFacts: string[] = []
  const countsByType: Record<string, number> = {}

  const addVoice = (text: unknown, row: Row) => {
    if (typeof text === 'string' && text.trim().length >= 10) {
      voiceSamples.push({ text: text.trim(), createdAt: row.created_at, sourceType: row.type })
    }
  }

  for (const row of rows) {
    countsByType[row.type] = (countsByType[row.type] ?? 0) + 1
    const p = row.payload ?? {}
    const d = day(row.created_at)

    switch (row.type) {
      case 'note':
        addVoice(p.content, row)
        break
      case 'checkin': {
        addVoice(p.note, row)
        contextFacts.push(`${d}: rated his day ${p.rating}/5${p.note ? '' : ' (no comment)'}`)
        break
      }
      case 'aperture': {
        // The question was asked BY enry; only the answer is Henry's voice.
        addVoice(p.answer, row)
        contextFacts.push(`${d}: was asked "${String(p.question ?? '').slice(0, 140)}"${p.answer ? ' and answered it' : ' (never answered)'}`)
        break
      }
      case 'article_note': {
        addVoice(p.user_note, row)
        contextFacts.push(`${d}: saved the article "${String(p.article_title ?? row.title).slice(0, 80)}"`)
        break
      }
      case 'race_pace': {
        addVoice(p.notes, row)
        if (p.mode === 'result') {
          contextFacts.push(`${d}: logged a ${p.distance} race result of ${p.time_seconds}s${p.is_pr ? ' — a PR' : ''}`)
        } else {
          contextFacts.push(`${d}: worked out split targets for a ${p.distance} goal of ${p.time_seconds}s`)
        }
        break
      }
      case 'prompt': {
        // Only Henry's own notes on prompts he saved himself are voice; the
        // daily_auto prompt bodies are machine-written.
        if (row.source === 'user') addVoice(p.notes, row)
        contextFacts.push(`${d}: saved the prompt "${row.title.slice(0, 80)}"${row.source === 'daily_auto' ? ' (auto-generated for him)' : ''}`)
        break
      }
      case 'workout': {
        const sets = Array.isArray(p.sets) ? p.sets.length : 0
        contextFacts.push(`${d}: logged a ${String(p.exercise ?? 'workout')} session (${sets} sets)`)
        break
      }
      case 'root_cause': {
        contextFacts.push(`${d}: ran a root-cause investigation into "${String(p.failure_description ?? '').slice(0, 100)}" — concluded: ${String(p.root_cause ?? '').slice(0, 120)}`)
        break
      }
      case 'countdown':
        contextFacts.push(`${d}: was counting down to ${String(p.event_name ?? 'an event')} on ${p.event_date}`)
        break
      case 'grade_calc':
        contextFacts.push(`${d}: ran GPA calculations (target ${p.targetGpa})`)
        break
      case 'habit_streak':
        contextFacts.push(`${d}: checked in on the habit "${String(p.habit_name ?? '')}" (streak: ${p.streak})`)
        break
      case 'repo_scan':
      case 'repo_review':
        contextFacts.push(`${d}: was digging into the repo ${String((p as { name?: string; repo_full_name?: string }).name ?? (p as { repo_full_name?: string }).repo_full_name ?? row.title)}`)
        break
      case 'flashcards':
        contextFacts.push(`${d}: generated flashcards ("${row.title.slice(0, 60)}")`)
        break
      case 'meal':
        contextFacts.push(`${d}: logged a meal (~${p.calories} cal)`)
        break
      default:
        break
    }
  }

  return {
    windowStart,
    windowEnd,
    voiceSamples,
    // Newest-last, capped so the persona prompt stays manageable.
    contextFacts: contextFacts.slice(-80),
    countsByType,
    corpusResourceIds: rows.map((r) => r.id),
    richness: richnessOf(voiceSamples.length),
  }
}
