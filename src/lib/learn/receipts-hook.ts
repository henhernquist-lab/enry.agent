// Receipts (Freebuff) — the extension point where an outgoing main-chat user
// message can be checked against the user's claims for contradiction ("you
// once claimed X, but you're now saying not-X"). The BASE deliberately ships
// NO detection logic — it only exposes this seam so Freebuff can drop its
// detector in without editing chat's runtime path again.
//
// Contract for the Freebuff agent building Receipts:
//   1. Write your detector as a ReceiptsHook in your own module.
//   2. Call registerReceiptsHook(yourHook) once, from a side-effect import
//      that chat/route.ts already pulls in (or add exactly one import line).
//   3. Never touch the call site in chat/route.ts otherwise — it invokes the
//      registered hook fire-and-forget (not awaited), so your detection can
//      be as slow as it needs to be without adding one ms to chat latency.
//      If you need to surface a result back into the chat stream, that's a
//      larger change and should be its own proposal — this seam is
//      intentionally observe-only for now.

export interface ContradictionCandidate {
  claimId: string
  claimContent: string
  // How strongly this claim contradicts the message, 0-1. The base assigns no
  // meaning to the number — the detector defines the scale it reports on.
  similarity: number
}

export type ReceiptsHook = (params: {
  userId: string    // profiles.id (uuid) — same id claims.user_id FKs to
  googleId: string   // raw NextAuth session id — for memory/embedding lookups keyed on it
  message: string    // the outgoing user message, exactly as sent to the model
}) => Promise<ContradictionCandidate[] | null>

// No-op default: resolves null, reads nothing, adds no latency. Stays this way
// until Freebuff replaces it via registerReceiptsHook.
let activeHook: ReceiptsHook = async () => null

export function registerReceiptsHook(hook: ReceiptsHook): void {
  activeHook = hook
}

export function getReceiptsHook(): ReceiptsHook {
  return activeHook
}
