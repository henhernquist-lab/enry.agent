// Focus Mode — shared type so chat/route.ts and composio-tools.ts agree on
// the same enumeration without duplicating it (a type drift here was a real
// bug: composio-tools narrowed FocusMode locally and silently accepted
// unknown strings the chat route had rejected).

export const ALLOWED_FOCUS_MODES = ['all', 'memory_only', 'web_only', 'repo_only'] as const
export type FocusMode = (typeof ALLOWED_FOCUS_MODES)[number]

export function normalizeFocusMode(raw: unknown): FocusMode {
  return (ALLOWED_FOCUS_MODES as readonly string[]).includes(raw as string)
    ? (raw as FocusMode)
    : 'all'
}
