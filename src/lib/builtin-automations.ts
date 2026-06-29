export type BuiltinAutomationId =
  | 'dailyBriefing'
  | 'urlWatcher'
  | 'studyTimer'
  | 'workoutLogger'
  | 'nutritionTracker'

export type BuiltinAutomationToggles = Record<BuiltinAutomationId, boolean>

const STORAGE_KEY = 'enry_builtin_automation_toggles'

const DEFAULT_TOGGLES: BuiltinAutomationToggles = {
  dailyBriefing: true,
  urlWatcher: true,
  studyTimer: true,
  workoutLogger: true,
  nutritionTracker: true,
}

export function loadToggles(): BuiltinAutomationToggles {
  if (typeof window === 'undefined') return DEFAULT_TOGGLES
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? { ...DEFAULT_TOGGLES, ...JSON.parse(raw) } : DEFAULT_TOGGLES
  } catch {
    return DEFAULT_TOGGLES
  }
}

export function setToggle(id: BuiltinAutomationId, enabled: boolean): BuiltinAutomationToggles {
  const toggles = { ...loadToggles(), [id]: enabled }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toggles))
  } catch {}
  return toggles
}

export function simpleHash(input: string): string {
  let hash = 0
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i)
    hash |= 0
  }
  return hash.toString(36)
}
