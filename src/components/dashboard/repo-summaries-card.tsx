import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { Card } from '@/components/card'
import type { RepoScanPayload } from '@/lib/resources'

interface RepoRow {
  id: string
  title: string
  payload: RepoScanPayload
  created_at: string
}

export async function RepoSummariesCard() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)

  let repos: RepoRow[] = []

  if (uid) {
    const { data } = await supabase
      .from('resources')
      .select('id, title, payload, created_at')
      .eq('user_id', uid)
      .eq('type', 'repo_scan')
      .order('created_at', { ascending: false })
      .limit(5)
    repos = (data ?? []) as RepoRow[]
  }

  return (
    <Card padding="lg" className="h-full">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Repository Intelligence</h3>
      {repos.length === 0 ? (
        <p className="text-sm text-muted-foreground">No repositories scanned yet.</p>
      ) : (
        <ul className="space-y-2">
          {repos.map((r) => (
            <li key={r.id} className="flex items-start justify-between gap-2 rounded-md bg-surface-elevated p-2">
              <div className="min-w-0">
                <p className="truncate text-xs font-medium text-foreground">{r.payload?.name ?? r.title}</p>
                <p className="text-[10px] text-muted-foreground">
                  {r.payload?.language ?? 'Unknown'} · {r.payload?.stars ?? 0} ★
                </p>
              </div>
              <span className="text-[10px] text-muted-foreground">
                {new Date(r.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
