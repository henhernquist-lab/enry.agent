import { simpleHash } from './builtin-automations'

export interface UrlCheck {
  at: number
  changed: boolean
  summary: string | null
}

export interface WatchedUrl {
  id: string
  url: string
  label: string
  createdAt: number
  lastCheckedAt: number | null
  lastChangedAt: number | null
  lastHash: string | null
  lastSummary: string | null
  history: UrlCheck[]
}

const STORAGE_KEY = 'enry_watched_urls'
const MAX_HISTORY = 20

export function loadWatchedUrls(): WatchedUrl[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveAll(all: WatchedUrl[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch {}
}

export function addWatchedUrl(url: string, label: string): WatchedUrl {
  const entry: WatchedUrl = {
    id: `url_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    url,
    label: label || url,
    createdAt: Date.now(),
    lastCheckedAt: null,
    lastChangedAt: null,
    lastHash: null,
    lastSummary: null,
    history: [],
  }
  const all = loadWatchedUrls()
  all.unshift(entry)
  saveAll(all)
  return entry
}

export function removeWatchedUrl(id: string): void {
  saveAll(loadWatchedUrls().filter((w) => w.id !== id))
}

export function recordCheck(
  id: string,
  update: { hash: string; changed: boolean; summary: string | null },
): void {
  const all = loadWatchedUrls()
  const entry = all.find((w) => w.id === id)
  if (!entry) return
  const now = Date.now()
  entry.lastCheckedAt = now
  entry.lastHash = update.hash
  if (update.changed) {
    entry.lastChangedAt = now
    entry.lastSummary = update.summary
  }
  entry.history = [{ at: now, changed: update.changed, summary: update.summary }, ...entry.history].slice(
    0,
    MAX_HISTORY,
  )
  saveAll(all)
}

export async function checkUrl(entry: WatchedUrl): Promise<void> {
  try {
    const res = await fetch('/api/automations/fetch-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: entry.url }),
    })
    const data = await res.json()

    if (data.error || typeof data.text !== 'string') {
      recordCheck(entry.id, {
        hash: entry.lastHash ?? '',
        changed: false,
        summary: `Check failed: ${data.error ?? 'unknown error'}`,
      })
      return
    }

    const hash = simpleHash(data.text)
    const changed = entry.lastHash !== null && entry.lastHash !== hash

    let summary: string | null = null
    if (changed) {
      const genRes = await fetch('/api/automations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `This page changed. Based on its current text content, describe in 1-2 short sentences what likely changed:\n\n${data.text.slice(0, 3000)}`,
        }),
      })
      const genData = await genRes.json()
      summary = genData.text ?? 'Content changed, but summary generation failed.'
    }

    recordCheck(entry.id, { hash, changed, summary })
  } catch (error) {
    console.error('checkUrl error:', error)
    recordCheck(entry.id, { hash: entry.lastHash ?? '', changed: false, summary: 'Check failed (network error)' })
  }
}
