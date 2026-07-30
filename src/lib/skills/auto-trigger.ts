import { supabase } from '@/lib/supabase'
import { SKILLS, detectSkillInvocation } from './registry'
import type { SkillInvocation } from './registry'

// ─── Server-side (API routes, uses supabase admin client) ────────────────

export async function getAutoTriggeredSkills(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('skill_auto_triggers')
      .select('skill_slug')
      .eq('user_id', userId)

    if (error) {
      console.error('[auto-trigger] failed to fetch auto-triggers:', error)
      return []
    }
    return (data ?? []).map((r: { skill_slug: string }) => r.skill_slug)
  } catch (err) {
    console.error('[auto-trigger] fetch error:', err)
    return []
  }
}

export async function setAutoTrigger(userId: string, skillSlug: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('skill_auto_triggers')
      .upsert({ user_id: userId, skill_slug: skillSlug }, { onConflict: 'user_id,skill_slug' })

    if (error) {
      console.error('[auto-trigger] failed to set auto-trigger:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[auto-trigger] set error:', err)
    return false
  }
}

export async function removeAutoTrigger(userId: string, skillSlug: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('skill_auto_triggers')
      .delete()
      .eq('user_id', userId)
      .eq('skill_slug', skillSlug)

    if (error) {
      console.error('[auto-trigger] failed to remove auto-trigger:', error)
      return false
    }
    return true
  } catch (err) {
    console.error('[auto-trigger] remove error:', err)
    return false
  }
}

// ─── Client-side helpers (runs in browser, uses fetch to API routes) ────

const AUTO_TRIGGER_CACHE_KEY = 'golem.autoTriggers.v1'

// Cached list of auto-triggered skill slugs for client-side use.
// Populated on first load from the API, refreshed on change.
let _autoTriggerCache: string[] | null = null

export async function loadAutoTriggers(): Promise<string[]> {
  try {
    const res = await fetch('/api/skills/auto-triggers')
    if (!res.ok) return []
    const data = await res.json()
    const slugs: string[] = Array.isArray(data?.slugs) ? data.slugs : []
    _autoTriggerCache = slugs
    try { localStorage.setItem(AUTO_TRIGGER_CACHE_KEY, JSON.stringify(slugs)) } catch { /* noop */ }
    return slugs
  } catch {
    // Fall back to localStorage cache
    try {
      const raw = localStorage.getItem(AUTO_TRIGGER_CACHE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          _autoTriggerCache = parsed
          return parsed
        }
      }
    } catch { /* noop */ }
    return []
  }
}

export function getCachedAutoTriggers(): string[] {
  return _autoTriggerCache ?? []
}

export async function enableAutoTrigger(skillSlug: string): Promise<boolean> {
  try {
    const res = await fetch('/api/skills/auto-triggers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_slug: skillSlug }),
    })
    if (!res.ok) return false
    // Update cache
    if (_autoTriggerCache && !_autoTriggerCache.includes(skillSlug)) {
      _autoTriggerCache.push(skillSlug)
      try { localStorage.setItem(AUTO_TRIGGER_CACHE_KEY, JSON.stringify(_autoTriggerCache)) } catch { /* noop */ }
    }
    return true
  } catch {
    return false
  }
}

export async function disableAutoTrigger(skillSlug: string): Promise<boolean> {
  try {
    const res = await fetch('/api/skills/auto-triggers', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ skill_slug: skillSlug }),
    })
    if (!res.ok) return false
    // Update cache
    if (_autoTriggerCache) {
      _autoTriggerCache = _autoTriggerCache.filter((s) => s !== skillSlug)
      try { localStorage.setItem(AUTO_TRIGGER_CACHE_KEY, JSON.stringify(_autoTriggerCache)) } catch { /* noop */ }
    }
    return true
  } catch {
    return false
  }
}

// Check if the user's input matches any auto-triggered skill.
// Called BEFORE the normal detectSkillInvocation check so auto-triggered
// skills fire without the user having to invoke them manually.
export function detectAutoTrigger(raw: string): SkillInvocation | null {
  const autoSlugs = getCachedAutoTriggers()
  if (autoSlugs.length === 0) return null

  // Only check skills that are auto-triggered
  const autoSkills = SKILLS.filter((s) => autoSlugs.includes(s.slug))
  if (autoSkills.length === 0) return null

  const trimmed = raw.trim()
  const norm = trimmed.toLowerCase().replace(/['']/g, '').replace(/\s+/g, ' ').trim()

  for (const skill of autoSkills) {
    for (const phrase of skill.triggerPhrases) {
      const np = phrase.toLowerCase().replace(/['']/g, '').replace(/\s+/g, ' ').trim()
      const idx = norm.indexOf(np)
      if (idx === -1) continue
      const before = idx === 0 ? ' ' : norm[idx - 1]
      const after = norm[idx + np.length]
      const isAfterBoundary = after === undefined || after === ' ' || /[:,.;?!\-]/.test(after)
      if (before !== ' ' || !isAfterBoundary) continue

      // Extract topic from the raw text
      const phraseRe = new RegExp(phrase.replace(/['']/g, "['']?").replace(/\s+/g, '\\s+'), 'i')
      let rest = trimmed.replace(phraseRe, ' ').replace(/\s+/g, ' ').trim()
      rest = rest.replace(/^(run|play|do|go|let'?s|please)\b/i, '').trim()
      rest = rest.replace(/^(on|about|against|this|that|my|the|of|for)\b[:,]?\s*/i, '').trim()
      rest = rest.replace(/^(belief|position|plan|idea|take|claim)\s+(that\s+)?[:,]?\s*/i, '').trim()

      return { skill, topic: rest, via: 'phrase' }
    }
  }

  return null
}
