'use client'

import { ErrorBoundaryView } from '@/components/error-boundary-view'

// Route-level boundary: keeps a throw inside /grimoire from blanking the whole
// app — the rest of the shell stays mounted and navigable.

export default function GrimoireError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundaryView error={error} reset={reset} label="grimoire" source="server" />
}
