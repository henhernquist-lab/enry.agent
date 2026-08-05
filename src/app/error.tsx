'use client'

import { ErrorBoundaryView } from '@/components/error-boundary-view'

// App-level boundary: catches anything thrown while rendering a page or a
// nested layout below the root. The root layout itself is above this —
// global-error.tsx covers that case.

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorBoundaryView error={error} reset={reset} label="500" source="server" />
}
