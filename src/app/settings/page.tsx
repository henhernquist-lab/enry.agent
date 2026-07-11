'use client'

import { motion } from 'framer-motion'
import { Settings, ArrowLeft, Wrench } from 'lucide-react'
import Link from 'next/link'

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

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-lg border border-border bg-surface-secondary p-8 text-center"
        >
          <Wrench className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">Settings are being rebuilt</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Account management, theme preferences, and integrations will live here. For now, use the sidebar to navigate.
          </p>
        </motion.div>
      </div>
    </div>
  )
}
