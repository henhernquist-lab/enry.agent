import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { Card } from '@/components/card'
import type { AperturePayload, BriefingPayload } from '@/lib/resources'

interface ApertureRow {
  id: string
  payload: AperturePayload
  created_at: string
}

interface BriefingRow {
  id: string
  payload: BriefingPayload
  created_at: string
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

export async function ApertureBriefingCard() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)

  let aperture: ApertureRow | null = null
  let briefing: BriefingRow | null = null

  if (uid) {
    const [apertureRes, briefingRes] = await Promise.all([
      supabase
        .from('resources')
        .select('id, payload, created_at')
        .eq('user_id', uid)
        .eq('type', 'aperture')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
      supabase
        .from('resources')
        .select('id, payload, created_at')
        .eq('user_id', uid)
        .eq('type', 'briefing')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),
    ])

    if (apertureRes.data) {
      aperture = apertureRes.data as ApertureRow
    }
    if (briefingRes.data) {
      briefing = briefingRes.data as BriefingRow
    }
  }

  const latest = (aperture?.created_at ?? '') >= (briefing?.created_at ?? '')
    ? aperture
    : briefing

  return (
    <Card padding="lg" className="relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-primary via-primary/60 to-transparent" />
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
              {aperture ? 'The Aperture' : 'Daily Briefing'}
            </span>
            {latest && (
              <span className="text-[10px] text-muted-foreground">{formatDate(latest.created_at)}</span>
            )}
          </div>
          <h1 className="mt-2 text-xl font-semibold text-foreground">
            {aperture?.payload?.question ?? briefing?.payload?.observations?.[0]?.text ?? 'Welcome back, Henry.'}
          </h1>
          {briefing?.payload?.flag && (
            <p className="mt-2 text-sm text-muted-foreground">
              <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-warning" />
              {briefing.payload.flag.text}
            </p>
          )}
        </div>
        <div className="w-full shrink-0 md:w-72">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Today at a glance
          </h2>
          <ul className="space-y-2">
            {(briefing?.payload?.observations ?? []).slice(0, 3).map((o, i) => (
              <li key={i} className="flex gap-2 text-xs text-muted-foreground">
                <span className="mt-0.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-primary/70" />
                <span>{o.text}</span>
              </li>
            ))}
            {!briefing && (
              <li className="text-xs text-muted-foreground">No briefing available yet.</li>
            )}
          </ul>
        </div>
      </div>
    </Card>
  )
}
