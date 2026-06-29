export const maxDuration = 30

function isPrivateHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '0.0.0.0' || hostname === '::1') return true
  const match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!match) return false
  const a = Number(match[1])
  const b = Number(match[2])
  if (a === 10 || a === 127) return true
  if (a === 172 && b >= 16 && b <= 31) return true
  if (a === 192 && b === 168) return true
  if (a === 169 && b === 254) return true
  return false
}

export async function POST(req: Request) {
  const { url } = await req.json()

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return Response.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || isPrivateHost(parsed.hostname)) {
    return Response.json({ error: 'URL not allowed' }, { status: 400 })
  }

  try {
    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'enry.agent-url-watcher/1.0' },
    })
    if (!res.ok) {
      return Response.json({ error: `Fetch failed with status ${res.status}` }, { status: 502 })
    }
    const html = await res.text()
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 8000)
    return Response.json({ text })
  } catch (error) {
    console.error('fetch-url error:', error)
    return Response.json({ error: 'Fetch failed' }, { status: 502 })
  }
}
