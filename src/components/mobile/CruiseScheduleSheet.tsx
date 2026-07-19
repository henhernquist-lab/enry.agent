'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, Check, Loader2, Lock } from 'lucide-react'
import { BottomSheet } from './BottomSheet'
import type { CruiseAutoView } from '@/app/api/cruise/autos/route'

// CruiseScheduleSheet — mobile edit form for the Auto-run schedule.
//
// Mirrors wire format of /api/cruise/repos/autorun EXACTLY. Sending the same
// shape that the desktop Cruise panel's autorun form sends means mobile edits
// and desktop edits write to the same DB columns and the same validation
// rules. The form is locally stateful; submission posts through the existing
// desktop endpoint — no mobile-only parallel route, no alternate validation.
//
// Field set follow the desktop panel pixel-for-pixel:
//   - enabled toggle
//   - HH:MM time input
//   - IANA timezone text input (server validates via Intl.DateTimeFormat)
//   - frequency radio: daily | weekly | every_n_days
//   - weekday chips (only when weekly) — 0=Sun..6=Sat
//   - interval days input (only when every_n_days) — 1..60
//   - scanfix categories checklist — subset of SCANFIX_CATEGORIES
//
// Errors: flat inline banner at the top of the sheet (per D2 design), holds
// sheet open so the user can adjust the failing field and try again.

const SCANFIX_CATEGORIES = [
  'dead_code',
  'formatting',
  'lint_autofix',
  'unused_deps',
  'broken_imports',
  'debug_statements',
  'non_functional_buttons',
] as const

type Category = (typeof SCANFIX_CATEGORIES)[number]

const CATEGORY_LABEL: Record<Category, string> = {
  dead_code: 'Dead code',
  formatting: 'Formatting',
  lint_autofix: 'Lint autofix',
  unused_deps: 'Unused deps',
  broken_imports: 'Broken imports',
  debug_statements: 'Debug logs',
  non_functional_buttons: 'Non-functional buttons',
}

// Surfaced-when-on-buttons-unconfirmed hint. Same as desktop.
const BUTTONS_GATE_CATEGORY: Category = 'non_functional_buttons'

interface SheetFormState {
  enabled: boolean
  time: string // HH:MM
  tz: string   // IANA
  frequency: 'daily' | 'weekly' | 'every_n_days'
  weekday: number // 0..6
  intervalDays: number // 1..60
  categories: Category[]
  // The desktop form has this; expose it too. The sheet warns but doesn't gate
  // — server is the authority (returns code: 'buttons_unconfirmed').
  buttonsConfirmed: boolean
}

function stateFromRepo(repo: CruiseAutoView | null): SheetFormState {
  // Defaults match desktop form (auto-run OFF until user clicks Enable).
  return {
    enabled: repo?.auto_run_enabled ?? false,
    time: repo?.auto_run_time ?? '03:00',
    tz: repo?.auto_run_tz ?? 'America/Los_Angeles',
    frequency: (repo?.auto_run_frequency ?? 'daily') as SheetFormState['frequency'],
    weekday: repo?.auto_run_weekday ?? 4, // Fri default — matches desktop
    intervalDays: repo?.auto_run_interval_days ?? 3,
    categories: (repo?.auto_run_categories ?? []) as Category[],
    buttonsConfirmed: repo?.buttons_autofix_confirmed ?? false,
  }
}

interface CruiseScheduleSheetProps {
  open: boolean
  repo: CruiseAutoView | null
  onClose: () => void
  /** Called after a successful save so the parent can refetch /api/cruise/autos. */
  onSaved: () => void
}

export function CruiseScheduleSheet({ open, repo, onClose, onSaved }: CruiseScheduleSheetProps) {
  const [form, setForm] = useState<SheetFormState>(() => stateFromRepo(null))
  const [errorBanner, setErrorBanner] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [didSave, setDidSave] = useState(false)

  // Sync local form state when a different repo is opened (or first open).
  useEffect(() => {
    if (open && repo) {
      setForm(stateFromRepo(repo))
      setErrorBanner(null)
      setIsSaving(false)
      setDidSave(false)
    }
  }, [open, repo])

  const buttonsLocked = useMemo(() => {
    if (!form.enabled) return false
    if (!form.categories.includes(BUTTONS_GATE_CATEGORY)) return false
    return !form.buttonsConfirmed
  }, [form.enabled, form.categories, form.buttonsConfirmed])

  const validateClient = (): string | null => {
    if (!form.enabled) return null
    if (!/^\d{1,2}:\d{2}$/.test(form.time)) return 'Time must be HH:MM (24h).'
    const [h, m] = form.time.split(':').map(Number)
    if (h < 0 || h > 23 || m < 0 || m > 59) return 'Time must be a valid HH:MM.'
    if (!form.tz.trim()) return 'Timezone required.'
    if (!['daily', 'weekly', 'every_n_days'].includes(form.frequency)) return 'Frequency required.'
    if (form.frequency === 'weekly' && (form.weekday < 0 || form.weekday > 6)) return 'Weekday must be 0..6.'
    if (form.frequency === 'every_n_days' && (form.intervalDays < 1 || form.intervalDays > 60)) return 'Interval must be 1..60 days.'
    if (form.categories.length === 0) return 'Select at least one category.'
    return null
  }

  const handleSave = async () => {
    if (!repo) return
    const clientErr = validateClient()
    if (clientErr) { setErrorBanner(clientErr); return }
    setErrorBanner(null)
    setIsSaving(true)
    try {
      const body: Record<string, unknown> = {
        repo: repo.full_name,
        enabled: form.enabled,
      }
      if (form.enabled) {
        body.time = form.time
        body.tz = form.tz.trim()
        body.frequency = form.frequency
        if (form.frequency === 'weekly') body.weekday = form.weekday
        if (form.frequency === 'every_n_days') body.interval_days = form.intervalDays
        body.categories = form.categories
      }

      const res = await fetch('/api/cruise/repos/autorun', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) {
        setDidSave(true)
        onSaved()
        // Brief success flash then auto-close so the user sees the change landed.
        setTimeout(() => { setDidSave(false); onClose() }, 700)
        return
      }
      // Surface the server's message verbatim. The buttons_unconfirmed code is
      // a special case — keep the sheet open with the same banner text.
      const msg = typeof data.error === 'string' ? data.error : `Save failed (${res.status}).`
      setErrorBanner(msg)
    } catch (err) {
      setErrorBanner(err instanceof Error ? err.message : 'Network error — try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={repo ? `Edit schedule — ${repo.full_name}` : 'Edit schedule'} height="75dvh">
      <div className="flex flex-col gap-4 p-4">
        {/* Banner zone — error or success flash. Both share a slot so the layout
            doesn't shift when an error appears. */}
        {errorBanner ? (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-[11px] text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span className="font-mono leading-relaxed">{errorBanner}</span>
          </motion.div>
        ) : didSave ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/10 p-2.5 text-[11px] text-primary"
          >
            <Check className="h-3.5 w-3.5" />
            <span className="font-mono">Saved.</span>
          </motion.div>
        ) : null}

        {/* Enabled toggle — primary action. Larger target than the form fields. */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-elevated p-3">
          <div className="flex flex-col gap-0.5">
            <span className="font-mono text-xs font-semibold uppercase tracking-wider text-foreground">Enabled</span>
            <span className="text-[11px] text-muted-foreground">Auto-run on schedule vs. on-demand only.</span>
          </div>
          <ToggleSwitch
            checked={form.enabled}
            onChange={(v) => { setForm({ ...form, enabled: v }); setErrorBanner(null) }}
            disabled={isSaving}
          />
        </div>

        {form.enabled && (
          <>
            {/* Time + tz row — keep HH:MM narrow, give TZ the rest. */}
            <div className="grid grid-cols-[auto_1fr] gap-3">
              <FieldGroup label="Time" hint="24h, local to your tz.">
                <input
                  type="text"
                  inputMode="numeric"
                  value={form.time}
                  onChange={(e) => setForm({ ...form, time: e.target.value })}
                  placeholder="03:00"
                  className="w-20 rounded border border-border bg-surface-elevated px-2.5 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
                  style={{ minHeight: 44 }}
                />
              </FieldGroup>
              <FieldGroup label="Timezone" hint="IANA. e.g. America/Los_Angeles">
                <input
                  type="text"
                  value={form.tz}
                  onChange={(e) => setForm({ ...form, tz: e.target.value })}
                  placeholder="America/Los_Angeles"
                  className="w-full rounded border border-border bg-surface-elevated px-2.5 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
                  style={{ minHeight: 44 }}
                />
              </FieldGroup>
            </div>

            {/* Frequency radio — wraps on narrow screens. */}
            <FieldGroup label="Frequency">
              <div className="flex flex-wrap gap-1.5">
                {(['daily', 'weekly', 'every_n_days'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setForm({ ...form, frequency: f })}
                    className={`flex h-9 items-center rounded border px-3 font-mono text-[11px] uppercase tracking-wide transition-colors ${
                      form.frequency === f
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-border bg-surface-elevated text-muted-foreground hover:text-foreground'
                    }`}
                    style={{ minWidth: 44 }}
                  >
                    {f === 'every_n_days' ? 'Every N days' : f}
                  </button>
                ))}
              </div>
            </FieldGroup>

            {/* Conditional sub-forms — keep their existence obvious in the read-back. */}
            {form.frequency === 'weekly' && (
              <FieldGroup label="Weekday" hint="Sun=0, Sat=6">
                <div className="flex flex-wrap gap-1.5">
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setForm({ ...form, weekday: i })}
                      className={`flex h-9 w-12 items-center justify-center rounded border font-mono text-[11px] uppercase transition-colors ${
                        form.weekday === i
                          ? 'border-primary bg-primary text-primary-foreground'
                          : 'border-border bg-surface-elevated text-muted-foreground hover:text-foreground'
                      }`}
                      style={{ minHeight: 44 }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </FieldGroup>
            )}

            {form.frequency === 'every_n_days' && (
              <FieldGroup label="Interval" hint="Every N days, 1..60">
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={form.intervalDays}
                  onChange={(e) => setForm({ ...form, intervalDays: Math.max(1, Math.min(60, Number(e.target.value) || 1)) })}
                  className="w-20 rounded border border-border bg-surface-elevated px-2.5 py-2 font-mono text-sm text-foreground outline-none focus:border-primary"
                  style={{ minHeight: 44 }}
                />
              </FieldGroup>
            )}

            {/* Categories — show all, with lock badge on buttons if unconfirmed. */}
            <FieldGroup label="Categories" hint="At least one — checked categories get fixed on each run.">
              <div className="grid grid-cols-1 gap-1.5">
                {SCANFIX_CATEGORIES.map((c) => {
                  const checked = form.categories.includes(c)
                  const isGated = c === BUTTONS_GATE_CATEGORY && form.buttonsConfirmed === false
                  return (
                    <label
                      key={c}
                      className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-2 transition-colors ${
                        checked
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border bg-surface-elevated hover:border-foreground/30'
                      } ${isGated ? 'opacity-100' : ''}`}
                      style={{ minHeight: 44 }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => {
                          setForm({
                            ...form,
                            categories: checked
                              ? form.categories.filter((x) => x !== c)
                              : [...form.categories, c],
                          })
                          setErrorBanner(null)
                        }}
                        className="h-4 w-4 accent-[var(--primary,#3a9e60)]"
                        style={{ minWidth: 16, minHeight: 16 }}
                      />
                      <span className="flex-1 font-mono text-xs text-foreground">{CATEGORY_LABEL[c]}</span>
                      {isGated && (
                        <span className="flex items-center gap-1 rounded bg-warning/15 px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wide text-warning">
                          <Lock className="h-3 w-3" /> Confirm on desktop
                        </span>
                      )}
                    </label>
                  )
                })}
              </div>
            </FieldGroup>

            {buttonsLocked && (
              <p className="rounded border border-warning/30 bg-warning/5 p-2 text-[11px] leading-relaxed text-warning">
                Non-functional-buttons category requires a one-time confirmation on the desktop
                Cruise panel before it can be scheduled. The save will be rejected until you confirm.
              </p>
            )}
          </>
        )}

        {/* Footer actions — sticky-ish in scroll. Save dominant, cancel left. */}
        <div className="flex items-center gap-2 border-t border-border pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSaving}
            className="flex h-10 items-center justify-center rounded border border-border bg-surface-elevated px-4 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            style={{ minWidth: 44 }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || didSave}
            className="ml-auto flex h-10 items-center justify-center gap-2 rounded bg-primary px-4 font-mono text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            style={{ minWidth: 88 }}
          >
            {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : didSave ? <Check className="h-3.5 w-3.5" /> : null}
            {isSaving ? 'Saving…' : didSave ? 'Saved' : 'Save schedule'}
          </button>
        </div>
      </div>
    </BottomSheet>
  )
}

// Local helpers — kept inline so the sheet is drop-in / self-contained.

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-[11px] font-semibold uppercase tracking-wider text-foreground">{label}</span>
        {hint && <span className="text-[10px] text-muted-foreground/80">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function ToggleSwitch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 flex-shrink-0 rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-muted-foreground/30'
      } ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
      style={{ minHeight: 44 }}
    >
      <span
        className={`absolute top-0.5 block h-6 w-6 rounded-full bg-foreground transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}
