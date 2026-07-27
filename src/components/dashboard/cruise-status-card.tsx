import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { Card } from '@/components/card'
import type { CruiseGoalRun, CruiseRepo, CruiseScan } from '@/lib/cruise/types'

export async function CruiseStatusCard() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)

  let repos: CruiseRepo[] = []
  let recentRuns: CruiseGoalRun[] = []
  let recentScans: CruiseScan[] = []

  if (uid) {
    const reposRes = await supabase.from('cruise_repos').select('*').eq('user_id', uid).eq('enabled', true).order('updated_at', { ascending: false })
    repos = (reposRes.data ?? []) as CruiseRepo[]

    const repoIds = repos.map((r) => r.id)
    if (repoIds.length > 0) {
      const [runsRes, scansRes] = await Promise.all([
        supabase
          .from('cruise_goal_runs')
          .select('*')
          .in('repo_id', repoIds)
          .order('dispatched_at', { ascending: false })
          .limit(5),
        supabase
          .from('cruise_scans')
          .select('*')
          .in('repo_id', repoIds)
          .order('dispatched_at', { ascending: false })
          .limit(5),
      ])
      recentRuns = (runsRes.data ?? []) as CruiseGoalRun[]
      recentScans = (scansRes.data ?? []) as CruiseScan[]
    }
  }

  const scheduled = repos.filter((r) => r.auto_run_enabled)

  const latestRunCandidate = recentRuns[0]
  const latestScanCandidate = recentScans[0]
  const latestRun =
    latestRunCandidate && latestScanCandidate
      ? new Date(latestRunCandidate.dispatched_at) >= new Date(latestScanCandidate.dispatched_at)
        ? latestRunCandidate
        : latestScanCandidate
      : latestRunCandidate ?? latestScanCandidate ?? null

  return (
    <Card padding="lg" className="h-full">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Cruise</h3>
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {scheduled.length} scheduled
        </span>
      </div>

      <div className="mb-4">
        <p className="text-xs text-muted-foreground">Scheduled next</p>
        {scheduled.length > 0 ? (
          <ul className="mt-1 space-y-1">
            {scheduled.slice(0, 2).map((r) => (
              <li key={r.id} className="text-sm text-foreground">{r.full_name}</li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No repos scheduled.</p>
        )}
      </div>

      <div>
        <p className="text-xs text-muted-foreground">Latest run</p>
        {latestRun ? (
          <div className="mt-1 rounded-md bg-surface-elevated p-2">
            <p className="text-sm font-medium text-foreground">
              {latestRun.status.charAt(0).toUpperCase() + latestRun.status.slice(1)}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {new Date(latestRun.dispatched_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No runs yet.</p>
        )}
      </div>
    </Card>
  )
}
