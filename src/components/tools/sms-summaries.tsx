'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Smartphone, Save, Check, Send, Pencil, Loader2, AlertCircle, Phone } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'

interface SmsSettings {
  phone: string
  time: string
}

function formatPhoneDisplay(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length === 11 && digits[0] === '1') return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  return phone
}

function formatPhoneInput(value: string): string {
  const digits = value.replace(/\D/g, '').slice(0, 11)
  if (digits.length === 0) return ''
  if (digits[0] === '1') {
    if (digits.length <= 1) return '+1'
    if (digits.length <= 4) return `+1 (${digits.slice(1)}`
    if (digits.length <= 7) return `+1 (${digits.slice(1, 4)}) ${digits.slice(4)}`
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
}

function formatTimeDisplay(time24: string): string {
  const [h, m] = time24.split(':').map(Number)
  const ampm = h >= 12 ? 'PM' : 'AM'
  const hour12 = h % 12 || 12
  return `${hour12}:${m.toString().padStart(2, '0')} ${ampm}`
}

function isValidUSPhone(input: string): boolean {
  const digits = input.replace(/\D/g, '')
  return digits.length === 10 || (digits.length === 11 && digits[0] === '1')
}

export function SmsSummaries({ onClose }: { onClose: () => void }) {
  const [phone, setPhone] = useState('')
  const [time, setTime] = useState('08:00')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [editing, setEditing] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  useEffect(() => {
    fetch('/api/tools/sms-settings')
      .then((r) => r.json())
      .then((data) => {
        if (data.sms?.phone && data.sms?.time) {
          setPhone(data.sms.phone)
          setTime(data.sms.time)
          setConfigured(true)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneInput(value)
    setPhone(formatted)
    if (formatted && !isValidUSPhone(formatted)) {
      setPhoneError('Enter a valid US phone number (10 digits)')
    } else {
      setPhoneError('')
    }
  }

  const handleSave = async () => {
    if (!isValidUSPhone(phone)) {
      setPhoneError('Enter a valid US phone number (10 digits)')
      return
    }
    setSaving(true)
    try {
      await fetch('/api/tools/sms-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, time }),
      })
      setSaved(true)
      setConfigured(true)
      setEditing(false)
      setTimeout(() => setSaved(false), 4000)
    } catch (err) {
      console.error('sms save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/sms/test', { method: 'POST' })
      setTestResult(res.ok ? 'success' : 'error')
    } catch {
      setTestResult('error')
    } finally {
      setTesting(false)
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
        <div className="flex justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-4">
          {/* Saved confirmation banner */}
          <AnimatePresence>
            {saved && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="flex items-center gap-2.5 rounded border border-primary/30 bg-primary/10 px-3 py-2.5"
              >
                <Check className="h-4 w-4 flex-shrink-0 text-primary" />
                <p className="text-xs text-primary">
                  Saved! You&apos;ll get your first summary at <span className="font-semibold">{formatTimeDisplay(time)}</span>.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Configured state — show summary */}
          {configured && !editing ? (
            <div className="space-y-3">
              <div className="rounded border border-border bg-surface-elevated p-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-primary" />
                      <span className="font-mono text-sm text-foreground">{formatPhoneDisplay(phone)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Time</span>
                      <span className="font-mono text-sm text-foreground">{formatTimeDisplay(time)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => setEditing(true)}
                    className="flex items-center gap-1.5 rounded border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                  >
                    <Pencil className="h-3 w-3" />
                    Edit
                  </button>
                </div>
              </div>

              {/* Test message button */}
              <button
                onClick={handleTest}
                disabled={testing}
                className="flex w-full items-center justify-center gap-2 rounded border border-border bg-surface-elevated px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground disabled:opacity-50"
              >
                {testing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                {testing ? 'Sending test...' : 'Send test message now'}
              </button>

              {/* Test result */}
              <AnimatePresence>
                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className={`flex items-center gap-2 rounded border px-3 py-2 text-xs ${
                      testResult === 'success'
                        ? 'border-primary/30 bg-primary/10 text-primary'
                        : 'border-destructive/30 bg-destructive/10 text-destructive'
                    }`}
                  >
                    {testResult === 'success' ? <Check className="h-3.5 w-3.5" /> : <AlertCircle className="h-3.5 w-3.5" />}
                    {testResult === 'success'
                      ? 'Test message sent! Check your phone.'
                      : 'Failed to send test message. Check your number and try again.'}
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="rounded border border-primary/20 bg-primary/5 px-3 py-2 text-[11px] text-primary/80">
                Active — powered by Twilio. Times are UTC.
              </div>
            </div>
          ) : (
            /* Edit / initial state — show form */
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                Enter your phone number and pick a time. enry will text you a daily summary every morning.
              </p>

              <div className="space-y-3">
                <div>
                  <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    Phone Number
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    onBlur={() => phone && !isValidUSPhone(phone) && setPhoneError('Enter a valid US phone number (10 digits)')}
                    placeholder="(555) 000-0000"
                    className={`w-full rounded border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:outline-none focus:ring-1 ${
                      phoneError
                        ? 'border-destructive/50 focus:border-destructive/70 focus:ring-destructive/30'
                        : 'border-border focus:border-primary/50 focus:ring-primary/50'
                    }`}
                  />
                  <AnimatePresence>
                    {phoneError && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        className="mt-1 font-mono text-[11px] text-destructive"
                      >
                        {phoneError}
                      </motion.p>
                    )}
                  </AnimatePresence>
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

              <div className="rounded border border-warning/20 bg-warning/5 px-3 py-2 text-[11px] text-warning">
                SMS sending is not yet active — settings will be saved but no texts will be sent until an SMS provider is connected.
              </div>

              <div className="flex gap-2">
                {editing && (
                  <button
                    onClick={() => { setEditing(false); setPhoneError('') }}
                    className="rounded border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                )}
                <button
                  onClick={handleSave}
                  disabled={saving || !phone.trim()}
                  className="flex flex-1 items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Save className="h-4 w-4" />
                  {saving ? 'Saving...' : 'Save Settings'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </ModalShell>
  )
}
