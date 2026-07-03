'use client'

import { useEffect, useState } from 'react'
import { Smartphone, Save, Check } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'

interface SmsSettings {
  phone: string
  time: string
}

export function SmsSummaries({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState('')
  const [time, setTime] = useState('08:00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/tools/sms-settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.sms) {
          setPhone(data.sms.phone ?? '')
          setTime(data.sms.time ?? '08:00')
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/tools/sms-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, time }),
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      console.error('sms save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  return (
    <ModalShell
      title="SMS Summaries"
      subtitle="Daily AI briefing sent to your phone"
      icon={<Smartphone className="h-4 w-4 text-primary" />}
      onClose={onClose}
    >
      {loading ? (
        <p className="py-8 text-center text-xs text-muted-foreground">Loading...</p>
      ) : (
        <div className="space-y-5">
          <div className="rounded border border-border bg-surface-elevated p-4 text-xs text-muted-foreground">
            Enter your phone number and pick a time. enry will text you a daily summary every morning.
          </div>

          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Phone Number
              </label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+1 (555) 000-0000"
                className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>

            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                Daily Send Time
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            </div>
          </div>

          <div className="rounded border border-warning/20 bg-warning/5 px-3 py-2 text-xs text-warning">
            {/* TODO: wire up Twilio or similar SMS provider to actually send daily texts */}
            SMS sending is not yet active — settings will be saved but no texts will be sent until an SMS provider is connected.
          </div>

          <button
            onClick={handleSave}
            disabled={saving || !phone.trim()}
            className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saved ? (
              <>
                <Check className="h-4 w-4" />
                Saved
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                {saving ? 'Saving...' : 'Save Settings'}
              </>
            )}
          </button>
        </div>
      )}
    </ModalShell>
  )
}
