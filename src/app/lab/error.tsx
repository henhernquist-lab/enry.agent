'use client'

import { ErrorBoundaryView } from '@/components/error-boundary-view'

// Route-level boundary: keeps a throw inside /lab from blanking the whole
// app — the rest of the shell stays mounted and navigable.

export default function LabError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundaryView error={error} reset={reset} label="lab" source="server" />
}
