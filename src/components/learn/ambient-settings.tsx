'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, Radio } from 'lucide-react'

// Ambient Mode settings — Learn's own settings surface (a modal), deliberately
// NOT the global app settings and NOT a tab (Ambient is a background layer).
// Editing here writes to /api/learn/ambient/settings. Nothing is scheduled or
// sent from the UI — this only configures the (currently unscheduled) cron.

interface AmbientSettings {
  enabled: boolean
  phone: string | null
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

  useEffect(() => {
    if (!open) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const res = await fetch('/api/learn/ambient/settings')
        if (res.ok && !cancelled) setSettings(await res.json())
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [open])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    try {
      const res = await fetch('/api/learn/ambient/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      })
      if (res.ok) { setSettings(await res.json()); onClose() }
    } finally {
      setSaving(false)
    }
  }

  const patch = (p: Partial<AmbientSettings>) => setSettings((s) => (s ? { ...s, ...p } : s))

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
                  Ambient Mode texts you an occasional probe when a claim is due — never during quiet hours, never more than your daily cap, and never if nothing&apos;s due. Your reply gets logged just like an in-app probe.
                </p>

                <label className="flex items-center justify-between">
                  <span className="font-mono text-[11px] text-foreground">Enabled</span>
                  <button
                    onClick={() => patch({ enabled: !settings.enabled })}
                    className={`relative h-5 w-9 rounded-full transition-colors ${settings.enabled ? 'bg-primary' : 'bg-surface-elevated'}`}
                  >
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${settings.enabled ? 'translate-x-4' : 'translate-x-0.5'}`} />
                  </button>
                </label>

                <div>
                  <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground/60">Phone (for SMS)</label>
                  <input
                    value={settings.phone ?? ''} onChange={(e) => patch({ phone: e.target.value || null })}
                    placeholder="+1 555 123 4567"
                    className="w-full rounded border border-border bg-surface-base px-3 py-2 font-mono text-[12px] text-foreground placeholder-muted-foreground/40 focus:border-primary/30 focus:outline-none"
                  />
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
