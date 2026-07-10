// Tiny pub/sub so a resource save anywhere that routes through the shared
// saveResource/updateResource helpers can pulse the homepage status strip
// immediately, rather than waiting for the strip's 60s / on-focus refetch.
// Direct POSTs to /api/resources that bypass the helpers still show up on
// the next focus/interval refetch — they just don't get the instant pulse.

type Listener = () => void

const listeners = new Set<Listener>()

export function emitResourceSaved(): void {
  for (const l of listeners) l()
}

export function onResourceSaved(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
