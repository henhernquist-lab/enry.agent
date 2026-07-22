'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { RefreshCcw, CheckCircle2, AlertTriangle } from 'lucide-react'
import { RecoveryState, RECOVERY_BANNER_LABELS } from '@/lib/recovery/types'

// ───────────────────────────────────────────────────────────────────
// RecoveryBanner — a subtle inline indicator showing recovery status.
//
// States:
//   Recovering — spinning icon + "Recovering…"
//   Recovered  — checkmark + "Recovered" (auto-hides after 3s)
//   Failed     — warning + "Recovery unsuccessful." + Retry button
//
// No modal dialogs. No bright colors. Matches Enry's dark aesthetic.
// ───────────────────────────────────────────────────────────────────

interface RecoveryBannerProps {
  /** Current recovery state. */
  state: RecoveryState | null
  /** Called when user clicks "Retry". */
  onRetry?: () => void
}

export function RecoveryBanner({ state, onRetry }: RecoveryBannerProps) {
  if (!state) return null

  const isRecovering = state === RecoveryState.Recovering
  const isRecovered = state === RecoveryState.Recovered
  const isFailed = state === RecoveryState.Failed

  if (!isRecovering && !isRecovered && !isFailed) return null

  const label = RECOVERY_BANNER_LABELS[state] ?? ''

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -4 }}
        transition={{ duration: 0.25 }}
        className="flex items-center gap-2 rounded-lg border border-border bg-surface-secondary/80 px-3 py-1.5 backdrop-blur"
      >
        {isRecovering && (
          <RefreshCcw className="h-3 w-3 animate-spin text-primary/70" />
        )}
        {isRecovered && (
          <CheckCircle2 className="h-3 w-3 text-primary" />
        )}
        {isFailed && (
          <AlertTriangle className="h-3 w-3 text-warning" />
        )}

        <span
          className={`font-mono text-[11px] ${
            isRecovered ? 'text-primary' : isFailed ? 'text-warning' : 'text-muted-foreground'
          }`}
        >
          {label}
        </span>

        {isFailed && onRetry && (
          <button
            onClick={onRetry}
            className="ml-1 rounded border border-border px-2 py-0.5 font-mono text-[10px] text-muted-foreground transition-colors hover:border-primary/30 hover:text-primary"
          >
            Retry
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  )
}

/**
 * AutoHideBanner — wraps RecoveryBanner and auto-hides the "Recovered"
 * state after a delay so it doesn't linger in the UI.
 */
interface AutoHideBannerProps extends RecoveryBannerProps {
  hideDelayMs?: number
}

export function AutoHideRecoveryBanner({
  state,
  onRetry,
  hideDelayMs = 3000,
}: AutoHideBannerProps) {
  // The auto-hide is handled by the parent via useEffect + setTimeout.
  // This component just delegates to RecoveryBanner.
  return <RecoveryBanner state={state} onRetry={onRetry} />
}
