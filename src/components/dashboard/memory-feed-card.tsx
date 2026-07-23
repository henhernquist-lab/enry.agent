import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { Card } from '@/components/card'
import type { MemoryPayload } from '@/lib/resources'

interface MemoryRow {
  id: string
  title: string
  payload: MemoryPayload
  created_at: string
}

export async function MemoryFeedCard() {
  const session = await auth()
  const googleId = (session?.user as { id?: string })?.id
  const uid = await resolveResourceUserId(googleId ?? null)

  let memories: MemoryRow[] = []

  if (uid) {
    const { data } = await supabase
      .from('resources')
      .select('id, title, payload, created_at')
      .eq('user_id', uid)
      .eq('type', 'memory')
      .order('created_at', { ascending: false })
      .limit(5)
    memories = (data ?? []) as MemoryRow[]
  }

  return (
    <Card padding="lg" className="h-full">
      <h3 className="mb-3 text-sm font-semibold text-foreground">Recent memory</h3>
      {memories.length === 0 ? (
        <p className="text-sm text-muted-foreground">No memories stored yet.</p>
      ) : (
        <ul className="space-y-2">
          {memories.map((m) => (
            <li key={m.id} className="rounded-md bg-surface-elevated p-2">
              <p className="line-clamp-2 text-xs text-foreground">
                {m.payload?.content ?? m.title}
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {new Date(m.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
