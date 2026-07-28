import { supabase } from '@/lib/supabase'

// ─── Types ────────────────────────────────────────────────────────────
// Unified notification item from real event sources. Mirrors the shape
// the mobile inbox UI expects (see src/app/m/inbox/page.tsx).

export type NotificationType = 'success' | 'warning' | 'error' | 'info'

export interface NotificationItem {
  id: string
  type: NotificationType
  title: string
  body: string
  time: string          // ISO 8601 timestamp
  link?: string
}

const MAX_ITEMS = 20
const WINDOW_DAYS = 30

// ─── Helpers ──────────────────────────────────────────────────────────

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(ms / 1000)
  if (sec < 60) return 'just now'
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function statusType(status: string): NotificationType {
  switch (status) {
    case 'completed': return 'success'
    case 'build_failed':
    case 'failed': return 'error'
    case 'capped':
    case 'no_changes':
    case 'cancelled': return 'warning'
    default: return 'info'
  }
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'completed successfully',
    build_failed: 'build failed',
    failed: 'failed',
    capped: 'reached cap',
    no_changes: 'no changes found',
    cancelled: 'cancelled',
    queued: 'queued',
    running: 'running',
    planning: 'planning',
  }
  return labels[status] ?? status
}

// ─── Aggregate ────────────────────────────────────────────────────────

/**
 * Fetch real notifications from Cruise goal runs and scans.
 * Returns most-recent-first, capped at MAX_ITEMS, within WINDOW_DAYS.
 */
export async function getNotifications(userId: string): Promise<NotificationItem[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString()
  const items: NotificationItem[] = []

  // ── Cruise goal runs ──────────────────────────────────────────────
  const { data: goals } = await supabase
    .from('cruise_goal_runs')
    .select('id, repo_id, goal, status, error, dispatched_at, finished_at, branch_name, full_name:cruise_repos!inner(full_name)')
    .eq('user_id', userId)
    .gte('dispatched_at', since)
    .order('dispatched_at', { ascending: false })
    .limit(MAX_ITEMS)

  if (goals) {
    for (const g of goals as Array<Record<string, unknown>>) {
      // Only include completed/failed runs — skip in-progress ones
      if (g.status === 'queued' || g.status === 'running' || g.status === 'planning') continue

      const repoFullName = (g.full_name as { full_name?: string } | undefined)?.full_name ?? 'unknown'
      const repoName = typeof repoFullName === 'string' && repoFullName.includes('/')
        ? repoFullName.split('/')[1] ?? repoFullName
        : repoFullName
      const reps = (g as Record<string, string | null>)
      items.push({
        id: `goal_${g.id}`,
        type: statusType(reps.status ?? 'unknown'),
        title: `Cruise ${statusLabel(reps.status ?? 'unknown')}`,
        body: `${repoFullName} — ${reps.goal ?? 'scan-and-fix run'}${reps.error ? ` (error: ${reps.error.slice(0, 100)})` : ''}`,
        time: reps.finished_at ?? reps.dispatched_at ?? '',
        link: '/agent',
      })
    }
  }

  // ── The Rounds scans ──────────────────────────────────────────────────
  const { data: scans } = await supabase
    .from('cruise_scans')
    .select('id, repo_id, trigger, status, error, finished_at, dispatched_at, summary_text, full_name:cruise_repos!inner(full_name)')
    .eq('user_id', userId)
    .gte('dispatched_at', since)
    .order('dispatched_at', { ascending: false })
    .limit(MAX_ITEMS)

  if (scans) {
    for (const s of scans as Array<Record<string, unknown>>) {
      // Only include final-status scans — skip in-progress ones
      // Avoid duplicating goal runs (scans should only show standalone scans)
      if (s.status === 'queued' || s.status === 'running') continue

      const repoFullName = (s.full_name as { full_name?: string } | undefined)?.full_name ?? 'unknown'
      const reps = s as Record<string, string | null>
      const summary = reps.summary_text ? ` — ${String(reps.summary_text).slice(0, 200)}` : ''
      items.push({
        id: `scan_${s.id}`,
        type: statusType(reps.status ?? 'unknown'),
        title: `Scan ${statusLabel(reps.status ?? 'unknown')}`,
        body: `${repoFullName} (${reps.trigger ?? 'on_demand'})${summary}${reps.error ? ` (error: ${reps.error.slice(0, 100)})` : ''}`,
        time: reps.finished_at ?? reps.dispatched_at ?? '',
        link: '/agent',
      })
    }
  }

  // Sort by time descending, deduplicate within reason, cap
  items.sort((a, b) => (b.time > a.time ? 1 : -1))
  return items.slice(0, MAX_ITEMS)
}
