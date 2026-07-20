'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import { Settings, ArrowLeft, Mail, Loader2, CheckCircle2, AlertTriangle, Link2Off, User, Sliders, Cpu, Puzzle, Search } from 'lucide-react'
import Link from 'next/link'

type ComposioToolkit = 'gmail' | 'composio_search'
type ConnectionStatus = 'disconnected' | 'pending' | 'connected' | 'error'

interface ComposioConnection {
  toolkit: ComposioToolkit
  status: ConnectionStatus
  error: string | null
  connected_at: string | null
}

const TOOLKIT_META: Record<ComposioToolkit, { label: string; desc: string; icon: typeof Mail }> = {
  gmail: { label: 'Gmail', desc: 'Read-only: search and read email through chat.', icon: Mail },
  composio_search: { label: 'Web Search', desc: 'Transactional lookups: prices, flights, finance, e-commerce, and page scraping.', icon: Search },
}

// Placeholder card for a settings section that's ready for wiring.
function SettingsSectionCard({
  icon: Icon,
  title,
  description,
  delay = 0,
}: {
  icon: typeof User
  title: string
  description: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex items-center gap-3 rounded-lg border border-border bg-surface-secondary p-4"
    >
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-border bg-background">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-mono text-[12px] font-medium text-foreground">{title}</p>
        <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{description}</p>
      </div>
      <span className="flex-shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/50">
        Soon
      </span>
    </motion.div>
  )
}

// Connectors: connect/disconnect cards for Composio-backed tools (Gmail,
// Google Calendar). Tokens never touch this app — Composio hosts the OAuth
// consent screen and custodies the resulting credential; this UI only reads/
// writes connection status.
function ConnectorsSection() {
  const searchParams = useSearchParams()
  const [connections, setConnections] = useState<Record<ComposioToolkit, ComposioConnection | null>>({
    gmail: null,
    composio_search: null,
  })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<ComposioToolkit | null>(null)
  const [banner, setBanner] = useState<{ ok: boolean; text: string } | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/composio/connections')
    const data = await res.json()
    const map: Record<ComposioToolkit, ComposioConnection | null> = { gmail: null, composio_search: null }
    for (const c of (data.connections ?? []) as ComposioConnection[]) map[c.toolkit] = c
    setConnections(map)
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])

  // Surface the redirect result from /api/composio/callback once, then drop
  // it from view (the connections list itself is the source of truth after).
  useEffect(() => {
    const connected = searchParams.get('composio_connected')
    const err = searchParams.get('composio_error')
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (connected) setBanner({ ok: true, text: `${TOOLKIT_META[connected as ComposioToolkit]?.label ?? connected} connected.` })
    else if (err) setBanner({ ok: false, text: `Connection failed (${err}). Try again.` })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [lastDiagnostic, setLastDiagnostic] = useState<Record<string, unknown> | null>(null)
  const [diagnosing, setDiagnosing] = useState(false)

  const runDiagnostic = async (toolkit: ComposioToolkit) => {
    setDiagnosing(true); setBanner(null); setLastDiagnostic(null)
    try {
      const res = await fetch('/api/composio/diagnose', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolkit }),
      })
      const data = await res.json()
      setLastDiagnostic(data.report ?? data)
    } catch (e) {
      setLastDiagnostic({ error: String(e) })
    } finally {
      setDiagnosing(false)
    }
  }

  const connect = async (toolkit: ComposioToolkit) => {
    setBusy(toolkit); setBanner(null); setLastDiagnostic(null)
    try {
      const res = await fetch('/api/composio/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolkit }),
      })
      const data = await res.json()
      if (!res.ok) {
        setBanner({ ok: false, text: data.error ?? 'Could not start connection' })
        if (data.diagnostic) setLastDiagnostic(data.diagnostic)
        setBusy(null)
        return
      }
      window.location.assign(data.redirect_url)
    } catch {
      setBanner({ ok: false, text: 'Could not start connection' }); setBusy(null)
    }
  }

  const disconnect = async (toolkit: ComposioToolkit) => {
    setBusy(toolkit); setBanner(null)
    try {
      const res = await fetch('/api/composio/disconnect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toolkit }),
      })
      const data = await res.json()
      if (!res.ok) { setBanner({ ok: false, text: data.error ?? 'Could not disconnect' }); return }
      await load()
    } finally { setBusy(null) }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.15 }}
      className="mt-6"
    >
      <p className="mb-3 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Connectors</p>

      {banner && (
        <div className={`mb-3 flex items-start gap-2 rounded border px-3 py-2 ${banner.ok ? 'border-primary/30 bg-primary/5' : 'border-destructive/40 bg-destructive/10'}`}>
          {banner.ok ? <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" /> : <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-destructive" />}
          <span className={`font-mono text-[11px] ${banner.ok ? 'text-foreground/90' : 'text-destructive'}`}>{banner.text}</span>
        </div>
      )}

      {lastDiagnostic && (
        <div className="mb-3 rounded border border-destructive/40 bg-destructive/5 p-2">
          <p className="mb-1 font-mono text-[10px] font-semibold uppercase tracking-wider text-destructive">Diagnostic</p>
          <pre className="max-h-40 overflow-auto font-mono text-[9px] leading-relaxed text-destructive/90 whitespace-pre-wrap break-all">
            {JSON.stringify(lastDiagnostic, null, 2)}
          </pre>
        </div>
      )}

      <div className="space-y-2">
        {(Object.keys(TOOLKIT_META) as ComposioToolkit[]).map((tk) => {
          const meta = TOOLKIT_META[tk]
          const Icon = meta.icon
          const conn = connections[tk]
          const status: ConnectionStatus = conn?.status ?? 'disconnected'
          const isBusy = busy === tk

          return (
            <div key={tk} className="flex items-center gap-3 rounded-lg border border-border bg-surface-secondary p-4">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-border bg-background">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-mono text-[12px] text-foreground">{meta.label}</p>
                  {loading ? (
                    <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                  ) : status === 'connected' ? (
                    <span className="flex items-center gap-1 rounded border border-primary/30 bg-primary/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-primary"><CheckCircle2 className="h-2.5 w-2.5" /> connected</span>
                  ) : status === 'pending' ? (
                    <span className="flex items-center gap-1 rounded border border-warning/30 bg-warning/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-warning"><Loader2 className="h-2.5 w-2.5 animate-spin" /> pending</span>
                  ) : status === 'error' ? (
                    <span className="flex items-center gap-1 rounded border border-destructive/30 bg-destructive/5 px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-wider text-destructive"><AlertTriangle className="h-2.5 w-2.5" /> error</span>
                  ) : null}
                </div>
                <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">{meta.desc}</p>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button onClick={() => runDiagnostic(tk)} disabled={diagnosing || isBusy || loading}
                  className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40">
                  {diagnosing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Diagnose
                </button>
                {status === 'connected' ? (
                  <button onClick={() => disconnect(tk)} disabled={isBusy}
                    className="flex items-center gap-1.5 rounded border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground transition-colors hover:text-destructive disabled:opacity-40">
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2Off className="h-3.5 w-3.5" />} Disconnect
                  </button>
                ) : (
                  <button onClick={() => connect(tk)} disabled={isBusy || loading}
                    className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary transition-colors hover:bg-primary/20 disabled:opacity-40">
                    {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Connect
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      <p className="mt-3 font-mono text-[9px] leading-relaxed text-muted-foreground/70">
        Composio hosts the Google consent screen and holds the resulting credential — it never passes through Enry. Read-only for now: no send-email actions.
      </p>
    </motion.div>
  )
}

export default function SettingsPage() {
  return (
    <div className="relative flex min-h-screen flex-col bg-transparent">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 grid-overlay opacity-30" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(8,8,8,0.6) 100%)',
          }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 py-12">
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back to enry
        </Link>

        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <Settings className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold leading-tight text-foreground">Settings</h1>
              <p className="font-mono text-xs text-muted-foreground">Manage your account and preferences</p>
            </div>
          </div>
        </motion.div>

        {/* Placeholder sections — ready for wiring */}
        <div className="space-y-5">
          <SettingsSectionCard
            icon={User}
            title="Account"
            description="Profile details, email, and password management."
            delay={0.1}
          />
          <SettingsSectionCard
            icon={Sliders}
            title="Preferences"
            description="Theme, notifications, default behaviors, and keyboard shortcuts."
            delay={0.15}
          />
          <SettingsSectionCard
            icon={Cpu}
            title="AI & Model Settings"
            description="Default model, effort level, focus mode, and reasoning trace depth."
            delay={0.2}
          />
          <SettingsSectionCard
            icon={Puzzle}
            title="Integrations"
            description="Composio connectors (Gmail) and future API integrations."
            delay={0.25}
          />
        </div>

        <Suspense fallback={null}>
          <ConnectorsSection />
        </Suspense>
      </div>
    </div>
  )
}
