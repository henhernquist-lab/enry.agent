'use client'

import { useState, useCallback, useEffect } from 'react'
import { motion } from 'framer-motion'
import {
  User,
  Check,
  Save,
  Loader2,
  ArrowLeft,
} from 'lucide-react'
import Link from 'next/link'
import type { UserProfile } from '@/lib/user-profile'
import { createDefaultProfile, loadProfileAsync, saveProfile } from '@/lib/user-profile'
import { PROFILE_SECTIONS, type SectionKey } from '@/lib/profile-sections'

const SECTIONS = PROFILE_SECTIONS

export default function SettingsPage() {
  const [profile, setProfile] = useState<UserProfile>(createDefaultProfile())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expandedSection, setExpandedSection] = useState<SectionKey | null>(null)

  useEffect(() => {
    loadProfileAsync().then((p) => {
      setProfile(p ?? createDefaultProfile())
      setLoading(false)
    })
  }, [])

  const handleChange = useCallback(
    (key: keyof UserProfile, value: string) => {
      setProfile((prev) => {
        const next = { ...prev, [key]: value as never }
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
    const ok = await saveProfile(profile)
    if (!ok) {
      console.error('[settings] Failed to save profile')
    }
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }, [profile])

  return (
    <div className="relative flex min-h-screen flex-col bg-surface-base">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 grid-overlay opacity-30" />
        <div
          className="absolute inset-0"
          style={{
            background: 'radial-gradient(ellipse at center, transparent 0%, rgba(8,8,8,0.6) 100%)',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 mx-auto w-full max-w-2xl px-6 py-12">
        {/* Back link */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back to enry
        </Link>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-10"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/30 bg-primary/10">
              <User className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-foreground">Settings</h1>
              <p className="font-mono text-xs text-muted-foreground">Manage your profile and preferences</p>
            </div>
          </div>
        </motion.div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-4"
          >
            {/* Profile name display */}
            {profile.name ? (
              <div className="rounded-lg border border-border bg-surface-secondary p-5">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Profile</p>
                <p className="font-display text-lg font-semibold text-foreground">{profile.name}</p>
                {profile.grade && (
                  <p className="font-mono text-xs text-muted-foreground mt-0.5">{profile.grade}</p>
                )}
              </div>
            ) : (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-5">
                <p className="font-mono text-xs text-primary">Set up your profile to personalize your experience.</p>
              </div>
            )}

            {/* Sections */}
            {SECTIONS.map((section) => {
              const filledCount = section.fields.filter((f) => {
                const v = profile[f.key]
                return v && (typeof v === 'string' ? v.trim().length > 0 : true)
              }).length

              return (
                <div
                  key={section.key}
                  className="rounded-lg border border-border bg-surface-secondary overflow-hidden"
                >
                  <button
                    onClick={() =>
                      setExpandedSection(expandedSection === section.key ? null : section.key)
                    }
                    className="flex w-full items-center justify-between px-5 py-4 text-left transition-colors hover:bg-surface-elevated/50"
                  >
                    <div className="flex items-center gap-3">
                      <section.icon className="h-4 w-4 text-primary" />
                      <div>
                        <h3 className="font-mono text-xs font-semibold text-foreground">{section.title}</h3>
                        <p className="font-mono text-[10px] text-muted-foreground">
                          {filledCount}/{section.fields.length} fields
                        </p>
                      </div>
                    </div>
                    <motion.div
                      animate={{ rotate: expandedSection === section.key ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                      </svg>
                    </motion.div>
                  </button>

                  {expandedSection === section.key && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="border-t border-border px-5 py-4 space-y-4">
                        {section.fields.map((field) => (
                          <div key={field.key}>
                            <label className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                              {field.label}
                            </label>
                            {field.type === 'select' && field.options ? (
                              <div className="grid grid-cols-2 gap-2">
                                {field.options.map((opt) => (
                                  <button
                                    key={opt.value}
                                    onClick={() => handleChange(field.key, opt.value)}
                                    className={`rounded-lg border px-3 py-2.5 text-left font-mono text-xs transition-all ${
                                      String(profile[field.key] ?? '') === opt.value
                                        ? 'border-primary bg-primary/10 text-primary'
                                        : 'border-border bg-surface-elevated text-muted-foreground hover:border-primary/30 hover:text-foreground'
                                    }`}
                                  >
                                    {opt.label}
                                  </button>
                                ))}
                              </div>
                            ) : field.type === 'textarea' ? (
                              <textarea
                                value={String(profile[field.key] ?? '')}
                                onChange={(e) => handleChange(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                rows={2}
                                className="w-full resize-none rounded-lg border border-border bg-surface-elevated px-4 py-2.5 font-mono text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                              />
                            ) : (
                              <input
                                type="text"
                                value={String(profile[field.key] ?? '')}
                                onChange={(e) => handleChange(field.key, e.target.value)}
                                placeholder={field.placeholder}
                                className="w-full rounded-lg border border-border bg-surface-elevated px-4 py-2.5 font-mono text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 transition-all"
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </div>
              )
            })}

            {/* Save button */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <p className="font-mono text-[10px] text-muted-foreground">
                {saved ? 'All changes saved' : 'Edit sections above'}
              </p>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-2 rounded-lg border px-5 py-2.5 font-mono text-xs font-medium transition-all ${
                  saved
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-primary bg-primary text-primary-foreground hover:shadow-[0_0_18px_rgba(0,255,102,0.15)]'
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
          </motion.div>
        )}
      </div>
    </div>
  )
}
