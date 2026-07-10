'use client'

import { useEffect, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Ghost, Loader2, ChevronRight, Trash2 } from 'lucide-react'
import { loadResources, deleteResource, type Resource, type GhostConversationPayload } from '@/lib/resources'
import { WindowPicker, type GhostWindowSelection } from '@/components/ghost/window-picker'
import { GhostChat } from '@/components/ghost/ghost-chat'

export default function GhostPage() {
  const { status } = useSession()
  const router = useRouter()
  const [selection, setSelection] = useState<GhostWindowSelection | null>(null)
  const [archive, setArchive] = useState<Resource[]>([])
  const [archiveLoading, setArchiveLoading] = useState(true)
  const [viewing, setViewing] = useState<Resource | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') router.push('/login')
  }, [status, router])

  const loadArchive = () =>
    loadResources('ghost_conversation')
      .then((r) => {
        setArchive(r)
        setArchiveLoading(false)
      })
      .catch(() => setArchiveLoading(false))

  useEffect(() => {
    loadArchive()
  }, [])

  if (status === 'loading') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-base">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Active conversation takes over the viewport — focused, no sidebar.
  if (selection) {
    return (
      <div className="flex h-screen flex-col bg-transparent">
        <GhostChat window={selection} onExit={() => { setSelection(null); loadArchive() }} />
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-transparent">
      <header className="sticky top-0 z-20 border-b border-border bg-surface-secondary/95 backdrop-blur">
        <div className="flex h-11 items-center justify-between px-4">
          <Link href="/resources" className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Resources
          </Link>
          <div className="flex items-center gap-2">
            <Ghost className="h-3.5 w-3.5 text-warning" />
            <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">ghost mode</span>
          </div>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-8 text-center">
          <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">Ghost Mode</h1>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            talk to who you were · a mirror, not a séance
          </p>
        </div>

        <WindowPicker onStart={setSelection} />

        {/* Archive */}
        <div className="mx-auto mt-10 w-full max-w-xl">
          <h2 className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">past conversations</h2>
          {archiveLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : archive.length === 0 ? (
            <p className="text-xs text-muted-foreground/60">None yet.</p>
          ) : (
            <div className="space-y-2">
              {archive.map((r) => {
                const p = r.payload as GhostConversationPayload
                return (
                  <div key={r.id} className="group flex items-center gap-2 rounded border border-border bg-surface-secondary px-3 py-2">
                    <button onClick={() => setViewing(viewing?.id === r.id ? null : r)} className="flex min-w-0 flex-1 items-center justify-between text-left">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-foreground">{p.window_label}</p>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {p.window_start} → {p.window_end} · {(p.messages ?? []).length} messages · {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <ChevronRight className={`h-3.5 w-3.5 flex-shrink-0 text-muted-foreground transition-transform ${viewing?.id === r.id ? 'rotate-90' : ''}`} />
                    </button>
                    <button
                      onClick={async () => { await deleteResource(r.id); if (viewing?.id === r.id) setViewing(null); loadArchive() }}
                      className="text-muted-foreground/40 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                      aria-label="Delete conversation"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {viewing && (
            <div className="mt-3 space-y-3 rounded border border-warning/25 bg-surface-secondary p-4">
              {((viewing.payload as GhostConversationPayload).messages ?? []).map((m, i) => (
                <div key={i} className={`text-xs leading-relaxed ${m.role === 'user' ? 'text-foreground' : 'text-warning/90'}`}>
                  <span className="mr-2 font-mono text-[9px] uppercase tracking-wider text-muted-foreground">
                    {m.role === 'user' ? 'you' : 'ghost'}
                  </span>
                  <span className="whitespace-pre-wrap">{m.content}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
