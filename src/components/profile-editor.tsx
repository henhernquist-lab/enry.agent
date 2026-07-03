'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User,
  Pencil,
  Check,
  X,
  Save,
  Loader2,
} from 'lucide-react'
import type { UserProfile } from '@/lib/user-profile'
import { createDefaultProfile, loadProfileAsync, saveProfile } from '@/lib/user-profile'
import { PROFILE_SECTIONS, type SectionKey, type Section, type FieldDef } from '@/lib/profile-sections'

interface ProfileEditorProps {
  open: boolean
  onClose: () => void
}

const SECTIONS = PROFILE_SECTIONS

export function ProfileEditor({ open, onClose }: ProfileEditorProps) {
  const [profile, setProfile] = useState<UserProfile>(createDefaultProfile())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null)

  useEffect(() => {
    if (open) {
      // Defer to avoid synchronous setState calls inside effect
      setTimeout(() => {
        setLoading(true)
        setSaved(false)
        loadProfileAsync().then((p) => {
          setProfile(p ?? createDefaultProfile())
          setLoading(false)
        })
      }, 0)
    }
  }, [open])

  const handleChange = useCallback(
    (key: keyof UserProfile, value: string) => {
      setProfile((prev) => {
        const next = { ...prev, [key]: value as never }
        // Only mark setupComplete if it was already true
        if (!prev.setupComplete) {
          next.setupComplete = true
          next.setupDate = Date.now()
        }
        return next
      })
    },
    [],
  )

  const handleSave = useCallback(async () => {
    setSaving(true)
    console.log('[profile-editor] Saving profile:', profile)
    const ok = await saveProfile(profile)
    if (!ok) {
      console.error('[profile-editor] Failed to save profile to server')
    } else {
      console.log('[profile-editor] Profile saved successfully')
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [profile])

  if (!open) return null

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            className="relative w-full max-w-2xl max-h-[85vh] mx-4 rounded-xl border border-border bg-surface-secondary shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Profile</h2>
                  <p className="text-xs text-muted-foreground">
                    {profile.name ? profile.name : 'View and edit your details'}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded p-1.5 text-muted-foreground hover:bg-surface-elevated transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-6 py-4 scrollbar-hidden">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : (
                <div className="space-y-3">
                  {SECTIONS.map((section) => (
                    <ProfileSection
                      key={section.key}
                      section={section}
                      profile={profile}
                      expanded={expandedSection === section.key}
                      onToggle={() =>
                        setExpandedSection(
                          expandedSection === section.key ? null : section.key,
                        )
                      }
                      onChange={handleChange}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border px-6 py-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  Changes are saved to your account
                </p>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSave}
                  disabled={saving}
                  className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-medium transition-all ${
                    saved
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-primary bg-primary text-primary-foreground hover:shadow-[0_0_15px_rgba(0,255,102,0.15)]'
                  } disabled:opacity-70`}
                >
                  {saving ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : saved ? (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      Saved
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      Save Changes
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ─── Profile Section ──────────────────────────────────────────

function ProfileSection({
  section,
  profile,
  expanded,
  onToggle,
  onChange,
}: {
  section: Section
  profile: UserProfile
  expanded: boolean
  onToggle: () => void
  onChange: (key: keyof UserProfile, value: string) => void
}) {
  const filledCount = section.fields.filter((f) => {
    const v = profile[f.key]
    return v && (typeof v === 'string' ? v.trim().length > 0 : true)
  }).length
  const totalCount = section.fields.length

  return (
    <div className="rounded-lg border border-border bg-surface-elevated overflow-hidden">
      <button
        onClick={onToggle}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-surface-secondary/50"
      >
        <div className="flex items-center gap-3">
          <section.icon className="h-4 w-4 text-primary" />
          <div>
            <h3 className="text-xs font-semibold text-foreground">{section.title}</h3>
            <p className="text-[10px] text-muted-foreground">
              {filledCount}/{totalCount} fields
            </p>
          </div>
        </div>
        <motion.div
          animate={{ rotate: expanded ? 90 : 0 }}
          transition={{ duration: 0.15 }}
        >
          <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 py-3 space-y-3">
              {section.fields.map((field) => (
                <ProfileField
                  key={field.key}
                  field={field}
                  value={String(profile[field.key] ?? '')}
                  onChange={(v) => onChange(field.key, v)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Profile Field ────────────────────────────────────────────

function ProfileField({
  field,
  value,
  onChange,
}: {
  field: FieldDef
  value: string
  onChange: (v: string) => void
}) {
  if (field.type === 'select' && field.options) {
    return (
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {field.label}
        </label>
        <div className="grid grid-cols-2 gap-1.5">
          {field.options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => onChange(opt.value)}
              className={`rounded border px-2.5 py-1.5 text-left text-[11px] transition-all ${
                value === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-surface-secondary text-muted-foreground hover:border-primary/30 hover:text-foreground'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div>
        <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {field.label}
        </label>
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={2}
          className="w-full resize-none rounded border border-border bg-surface-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
        />
      </div>
    )
  }

  return (
    <div>
      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {field.label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full rounded border border-border bg-surface-secondary px-3 py-2 text-sm text-foreground placeholder-muted-foreground/60 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
      />
    </div>
  )
}
