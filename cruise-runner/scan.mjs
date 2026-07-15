// Enry Cruise — Phase 1 static analyzer.
//
// Committed into an allowlisted repo by enry.agent as `.enry-cruise/scan.mjs`.
// Runs on GitHub's runner after the repo's deps are installed. Produces static
// findings (type errors, lint issues, unused imports / dead code, broken import
// paths) by running the repo's OWN tsc/eslint, then posts them back to
// enry.agent's /api/cruise/ingest — authenticated by the per-scan token in
// ENRY_TOKEN. Node builtins only; no dependencies to install.

import { collectFindings } from './lib/analyzers.mjs'

const SCAN_ID = process.env.ENRY_SCAN_ID
const CALLBACK = process.env.ENRY_CALLBACK
const TOKEN = process.env.ENRY_TOKEN
const REPO = process.env.ENRY_REPO || ''
const MAX_FINDINGS = 500

// Which scan-and-fix categories to detect (those the repo hasn't turned off),
// passed as a JSON array dispatch input. Absent/unparseable -> null, which makes
// collectFindings fall back to the legacy tsc+eslint-only scan.
function enabledCategories() {
  try {
    const arr = JSON.parse(process.env.ENRY_CATEGORIES || 'null')
    return Array.isArray(arr) && arr.length > 0 ? arr : null
  } catch { return null }
}

if (!SCAN_ID || !CALLBACK || !TOKEN) {
  console.error('[enry-cruise] missing ENRY_SCAN_ID / ENRY_CALLBACK / ENRY_TOKEN')
  process.exit(1)
}

async function post(path, body) {
  try {
    const res = await fetch(CALLBACK.replace(/\/+$/, '') + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const t = await res.text().catch(() => '')
      console.error('[enry-cruise] POST ' + path + ' -> ' + res.status + ' ' + t)
    }
    return res.ok
  } catch (e) {
    console.error('[enry-cruise] POST ' + path + ' threw: ' + (e && e.message || e))
    return false
  }
}

async function main() {
  await post('/api/cruise/ingest', { scan_id: SCAN_ID, phase: 'start', layer_status: { static: 'running' } })
  try {
    const findings = (await collectFindings(REPO, enabledCategories())).slice(0, MAX_FINDINGS)
    await post('/api/cruise/ingest', { scan_id: SCAN_ID, phase: 'findings', findings })
    await post('/api/cruise/ingest', {
      scan_id: SCAN_ID,
      phase: 'finalize',
      status: 'completed',
      layer_status: { static: 'done' },
      counts: { static: findings.length },
    })
    console.log('[enry-cruise] done: ' + findings.length + ' findings')
  } catch (e) {
    await post('/api/cruise/ingest', { scan_id: SCAN_ID, phase: 'finalize', status: 'failed', error: String(e && e.message || e) })
    process.exit(1)
  }
}

main()
