import { createHash } from 'node:crypto'
import { supabase } from '@/lib/supabase'
import { SCANFIX_CATEGORIES, type CruiseSeverity, type CruiseLayer, type IncomingFinding, type CruiseScan, type CruiseFinding, type ScanfixConfig } from '@/lib/cruise/types'
import { generateScanSummary, renderSummaryText } from '@/lib/cruise/summary'

export const maxDuration = 30

// The callback the GitHub runner posts scan results to. NOT session-authed —
// the caller is a CI runner, not a browser. Authenticated by the per-scan token
// (Phase 1: passed to the runner as a dispatch input; Phase 2 upgrades this to
// OIDC). The token's sha256 must match the scan row's stored token_hash, and a
// token only grants access to its own scan.

const SEVERITIES: CruiseSeverity[] = ['critical', 'high', 'medium', 'low', 'info']
const LAYERS: CruiseLayer[] = ['static', 'llm_review', 'runtime']
const MAX_FINDINGS = 500

function clampStr(v: unknown, max: number): string {
  return String(v ?? '').slice(0, max)
}

export async function POST(req: Request) {
  const raw = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  if (!raw) return Response.json({ error: 'Missing token' }, { status: 401 })
  const tokenHash = createHash('sha256').update(raw).digest('hex')

  const body = await req.json().catch(() => null)
  if (!body || typeof body.scan_id !== 'string') return Response.json({ error: 'Bad request' }, { status: 400 })
  const phase = String(body.phase ?? '')

  const { data: scan } = await supabase
    .from('cruise_scans')
    .select('id, repo_id, token_hash, status')
    .eq('id', body.scan_id)
    .maybeSingle()
  // Constant-ish: same 401 whether the scan is missing or the token is wrong.
  if (!scan || scan.token_hash !== tokenHash) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const nowIso = new Date().toISOString()
  const patch: Record<string, unknown> = { heartbeat_at: nowIso }

  if (phase === 'start') {
    patch.status = 'running'
    if (body.layer_status && typeof body.layer_status === 'object') patch.layer_status = body.layer_status
    await supabase.from('cruise_scans').update(patch).eq('id', scan.id)

    // Return control signal so the runner knows if it should pause/cancel immediately
    const { data: refreshed } = await supabase.from('cruise_scans').select('control_signal, control_instructions').eq('id', scan.id).maybeSingle()
    return Response.json({
      ok: true,
      control_signal: (refreshed as Record<string, unknown> | null)?.control_signal ?? null,
      control_instructions: (refreshed as Record<string, unknown> | null)?.control_instructions ?? null,
    })
  }

  if (phase === 'step_update') {
    // Live workspace step — append to a live_steps JSONB array on the scan row.
    const step = {
      at: nowIso,
      action: clampStr(body.action, 50) || 'step',
      file: body.file ? clampStr(body.file, 500) : null,
      command: body.command ? clampStr(body.command, 2000) : null,
      output_preview: body.output_preview ? clampStr(body.output_preview, 8000) : null,
    }
    // Fetch current live_steps, append, and update
    const { data: current } = await supabase
      .from('cruise_scans')
      .select('live_steps')
      .eq('id', scan.id)
      .maybeSingle()
    const steps = Array.isArray((current as Record<string, unknown> | null)?.live_steps)
      ? [...((current as Record<string, unknown>).live_steps as unknown[]), step]
      : [step]
    // Keep only last 200 steps to bound row size
    if (steps.length > 200) steps.splice(0, steps.length - 200)
    await supabase.from('cruise_scans').update({ live_steps: steps, heartbeat_at: nowIso }).eq('id', scan.id)
    return Response.json({ ok: true, step_index: steps.length - 1 })
  }

  if (phase === 'findings') {
    const incoming: unknown[] = Array.isArray(body.findings) ? body.findings.slice(0, MAX_FINDINGS) : []
    if (incoming.length === 0) {
      await supabase.from('cruise_scans').update(patch).eq('id', scan.id)
      return Response.json({ ok: true, inserted: 0 })
    }

    // Suppress anything the user already dismissed for this repo — survives
    // across scans via the stable fingerprint.
    const { data: dismissedRows } = await supabase
      .from('cruise_dismissals')
      .select('fingerprint')
      .eq('repo_id', scan.repo_id)
    const dismissed = new Set((dismissedRows ?? []).map((d) => d.fingerprint as string))

    const rows = (incoming as IncomingFinding[])
      .filter((f) => f && typeof f.fingerprint === 'string' && !dismissed.has(f.fingerprint))
      .map((f) => ({
        scan_id: scan.id,
        layer: LAYERS.includes(f.layer) ? f.layer : 'static',
        severity: SEVERITIES.includes(f.severity) ? f.severity : 'info',
        confidence: Math.max(0, Math.min(1, Number(f.confidence) || 0.5)),
        fingerprint: clampStr(f.fingerprint, 64),
        file_path: f.file_path ? clampStr(f.file_path, 500) : null,
        line_start: Number.isFinite(f.line_start) ? f.line_start : null,
        line_end: Number.isFinite(f.line_end) ? f.line_end : null,
        title: clampStr(f.title, 300) || '(untitled finding)',
        detail: clampStr(f.detail, 8000),
        suggested_fix: f.suggested_fix ? clampStr(f.suggested_fix, 20000) : null,
        category: f.category && SCANFIX_CATEGORIES.includes(f.category) ? f.category : null,
      }))

    if (rows.length > 0) {
      // Idempotent: (scan_id, fingerprint) is unique, so a retried POST is a no-op.
      await supabase.from('cruise_findings').upsert(rows, { onConflict: 'scan_id,fingerprint', ignoreDuplicates: true })
    }
    await supabase.from('cruise_scans').update(patch).eq('id', scan.id)
    return Response.json({ ok: true, inserted: rows.length, suppressed: incoming.length - rows.length })
  }

  if (phase === 'finalize') {
    const status = ['completed', 'partial', 'failed'].includes(body.status) ? body.status : 'completed'
    patch.status = status
    patch.finished_at = nowIso
    if (body.layer_status && typeof body.layer_status === 'object') patch.layer_status = body.layer_status
    if (body.error) patch.error = clampStr(body.error, 2000)

    // Generate a human-readable scan summary from the findings.
    if (status !== 'failed') {
      try {
        const { data: scanRow } = await supabase
          .from('cruise_scans')
          .select('scanfix_categories')
          .eq('id', scan.id)
          .maybeSingle()

        const { data: allFindings } = await supabase
          .from('cruise_findings')
          .select('*')
          .eq('scan_id', scan.id)
          .order('created_at', { ascending: true })

        const categories: ScanfixConfig = (scanRow as Record<string, unknown> | null)?.scanfix_categories as ScanfixConfig | undefined ?? {} as ScanfixConfig
        const summary = generateScanSummary(
          { ...scan, status: status as CruiseScan['status'] } as unknown as CruiseScan,
          (allFindings ?? []) as unknown as CruiseFinding[],
          categories,
        )
        patch.summary_text = renderSummaryText(summary)
      } catch (e) {
        console.error('[cruise/ingest] summary generation failed:', e)
      }
    }

    await supabase.from('cruise_scans').update(patch).eq('id', scan.id)
    return Response.json({ ok: true })
  }

  // Unknown phase — still bump the heartbeat so the watchdog sees liveness.
  // Also return current control signal so the runner can check for pause/cancel.
  await supabase.from('cruise_scans').update(patch).eq('id', scan.id)
  const { data: currentState } = await supabase.from('cruise_scans').select('control_signal, control_instructions').eq('id', scan.id).maybeSingle()
  return Response.json({
    ok: true,
    control_signal: (currentState as Record<string, unknown> | null)?.control_signal ?? null,
    control_instructions: (currentState as Record<string, unknown> | null)?.control_instructions ?? null,
  })
}
