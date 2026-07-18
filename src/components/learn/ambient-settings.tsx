'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Radio, Bell, BellOff, BellRing } from 'lucide-react'
import { pushSupported, subscribeToPush, unsubscribeFromPush } from '@/lib/push-client'

// Ambient Mode settings — Learn's own settings surface (a modal), deliberately
// NOT the global app settings and NOT a tab (Ambient is a background layer).
// Editing here writes to /api/learn/ambient/settings; the push subscription
// itself is managed via /api/learn/ambient/push-subscribe (browser
// PushManager object, not a form field).

interface AmbientSettings {
  enabled: boolean
  push_subscription: { endpoint: string; keys: { p256dh: string; auth: string } } | null
  max_per_day: number
  quiet_start_hour: number
  quiet_end_hour: number
  timezone: string
}

function hourLabel(h: number): string {
  const ampm = h < 12 ? 'am' : 'pm'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}${ampm}`
}

export function AmbientSettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [settings, setSettings] = useState<AmbientSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/learn/ambient/settings')
      if (res.ok) setSettings(await res.json())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => { if (!cancelled) await load() })()
    return () => { cancelled = true }
  }, [open])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch('/api/learn/ambient/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: settings.enabled, max_per_day: settings.max_per_day, quiet_start_hour: settings.quiet_start_hour, quiet_end_hour: settings.quiet_end_hour, timezone: settings.timezone }),
      })
      if (res.ok) { setSettings(await res.json()); onClose() }
    } finally {
      setSaving(false)
    }
  }

  const patch = (p: Partial<AmbientSettings>) => setSettings((s) => (s ? { ...s, ...p } : s))

  const subscribed = Boolean(settings?.push_subscription)

  const enablePush = async () => {
    setPushBusy(true)
    setPushError(null)
    try {
      const result = await subscribeToPush()
      if (!result.ok) { setPushError(result.error ?? 'failed'); return }
      await load()
    } finally {
      setPushBusy(false)
    }
  }

  const disablePush = async () => {
    setPushBusy(true)
    setPushError(null)
    try {
      await unsubscribeFromPush()
      await load()
    } finally {
      setPushBusy(false)
    }
  }

  // Flipping "Enabled" on with no subscription yet is the natural moment to
  // prompt for notification permission and register — do both in one click.
  const toggleEnabled = async () => {
    if (!settings) return
    const turningOn = !settings.enabled
    patch({ enabled: turningOn })
    if (turningOn && !subscribed) await enablePush()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md rounded-lg border border-border bg-surface-secondary shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-accent" />
                <span className="font-mono text-[12px] uppercase tracking-wider text-foreground">Ambient Mode</span>
              </div>
              <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:bg-surface-elevated hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>

            {loading || !settings ? (
              <div className="flex items-center justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              <div className="space-y-4 p-4">
                <p className="font-sans text-[11px] leading-relaxed text-muted-foreground/70">
                  Ambient Mode sends a push notification when a claim is due — never during quiet hours, never more than your daily cap, and never if nothing&apos;s due. Tapping it opens Learn with that probe ready to answer — the same in-app probe flow, not a reply channel.
                </p>

                <label className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-foreground">Enabled</span>
                  <button
                    onClick={toggleEnabled}
                    className={`relative h-5 w-9 rounded-full transition-colors ${settings.enabled ? 'bg-primary' : 'bg-surface-elevated'}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>

                <div className="rounded border border-border bg-surface-base p-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">
                      {subscribed ? <BellRing className="h-3 w-3 text-primary" /> : <BellOff className="h-3 w-3" />}
                      Push notifications
                    </span>
                    {subscribed ? (
                      <button onClick={disablePush} disabled={pushBusy} className="flex items-center gap-1 rounded border border-border px-2 py-1 font-mono text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-40">
                        {pushBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <BellOff className="h-3 w-3" />} Disable
                      </button>
                    ) : (
                      <button onClick={enablePush} disabled={pushBusy || !pushSupported()} className="flex items-center gap-1 rounded border border-primary/40 bg-primary/10 px-2 py-1 font-mono text-[10px] text-primary hover:bg-primary/20 disabled:opacity-40">
                        {pushBusy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bell className="h-3 w-3" />} Enable
                      </button>
                    )}
                  </div>
                  {!pushSupported() && (
                    <p className="mt-1.5 font-sans text-[10px] leading-relaxed text-warning">Push isn&apos;t supported in this browser.</p>
                  )}
                  {pushError && (
                    <p className="mt-1.5 font-sans text-[10px] leading-relaxed text-destructive">
                      {pushError === 'permission_denied' ? 'Notification permission was denied.' : `Couldn't subscribe (${pushError}).`}
                    </p>
                  )}
                  {subscribed && <p className="mt-1.5 font-sans text-[10px] leading-relaxed text-muted-foreground/50">This browser will receive Ambient probes.</p>}
                </div>

                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Max per day: {settings.max_per_day}</label>
                  <input type="range" min={1} max={6} value={settings.max_per_day} onChange={(e) => patch({ max_per_day: Number(e.target.value) })} className="w-full accent-primary" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Quiet from</label>
                    <select value={settings.quiet_start_hour} onChange={(e) => patch({ quiet_start_hour: Number(e.target.value) })} className="w-full rounded border border-border bg-surface-base px-2 py-2 font-mono text-[12px] text-foreground focus:outline-none">
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Quiet until</label>
                    <select value={settings.quiet_end_hour} onChange={(e) => patch({ quiet_end_hour: Number(e.target.value) })} className="w-full rounded border border-border bg-surface-base px-2 py-2 font-mono text-[12px] text-foreground focus:outline-none">
                      {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Timezone (IANA)</label>
                  <input value={settings.timezone} onChange={(e) => patch({ timezone: e.target.value })} className="w-full rounded border border-border bg-surface-base px-3 py-2 font-mono text-[12px] text-foreground focus:border-primary/30 focus:outline-none" />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button onClick={onClose} className="rounded border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground">Cancel</button>
                  <button onClick={save} disabled={saving} className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-[11px] text-primary hover:bg-primary/20 disabled:opacity-40">
                    {saving && <Loader2 className="h-3 w-3 animate-spin" />} Save
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
