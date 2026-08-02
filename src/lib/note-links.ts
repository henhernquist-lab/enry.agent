// URL detection for Grimoire notes. The editor is a plain textarea (not a
// rich-text/contentEditable surface), so we can't linkify inline as the user
// types — instead callers extract URLs from the current content and render
// them as a separate clickable chip row. No internal `[[wikilink]]`-style
// cross-reference convention exists anywhere else in src/lib or src/components
// (checked before writing this), so only plain-URL detection is implemented.

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+/gi

export function extractUrls(content: string): string[] {
  const matches = content.match(URL_RE) ?? []
  // Trim trailing punctuation that's almost certainly sentence punctuation,
  // not part of the URL (e.g. "check https://x.com." or "(https://x.com)").
  const cleaned = matches.map((u) => u.replace(/[.,;:!?)]+$/, ''))
  return Array.from(new Set(cleaned))
}

export function urlLabel(url: string): string {
  try {
    const u = new URL(url)
    const path = u.pathname !== '/' ? u.pathname : ''
    return `${u.hostname}${path}`.slice(0, 40)
  } catch {
    return url.slice(0, 40)
  }
}
