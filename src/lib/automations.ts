export interface AutomationRun {
  id: string
  startedAt: number
  completedAt: number | null
  status: 'running' | 'success' | 'error'
  message?: string
}

export interface Automation {
  id: string
  name: string
  description: string
  scheduleMs: number // interval in milliseconds
  enabled: boolean
  createdAt: number
  lastRunAt: number | null
  runs: AutomationRun[]
  action: string // what the automation does — a descriptive label for now
}

export type AutomationSchedule = {
  label: string
  ms: number
}

export const AUTOMATION_SCHEDULES: AutomationSchedule[] = [
  { label: 'Every 30 seconds', ms: 30_000 },
  { label: 'Every 1 minute', ms: 60_000 },
  { label: 'Every 5 minutes', ms: 300_000 },
  { label: 'Every 15 minutes', ms: 900_000 },
  { label: 'Every 30 minutes', ms: 1_800_000 },
  { label: 'Every 1 hour', ms: 3_600_000 },
  { label: 'Every 6 hours', ms: 21_600_000 },
  { label: 'Every 12 hours', ms: 43_200_000 },
  { label: 'Every 24 hours', ms: 86_400_000 },
]

const STORAGE_KEY = 'enry_automations'
const MAX_LOGS_PER_AUTOMATION = 50

export function loadAutomations(): Automation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function saveAutomations(automations: Automation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(automations))
  } catch {
    // Storage full — trim logs and retry
    const trimmed = automations.map((a) => ({
      ...a,
      runs: a.runs.slice(-10),
    }))
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
    } catch {}
  }
}

export function saveAutomation(automation: Automation): void {
  const all = loadAutomations()
  const idx = all.findIndex((a) => a.id === automation.id)
  if (idx >= 0) all[idx] = automation
  else all.unshift(automation)
  saveAutomations(all)
}

export function deleteAutomation(id: string): void {
  const all = loadAutomations().filter((a) => a.id !== id)
  saveAutomations(all)
}

export function toggleAutomation(id: string): Automation | null {
  const all = loadAutomations()
  const automation = all.find((a) => a.id === id)
  if (!automation) return null
  automation.enabled = !automation.enabled
  saveAutomations(all)
  return automation
}

export function addRunToAutomation(
  automationId: string,
  run: AutomationRun,
): void {
  const all = loadAutomations()
  const automation = all.find((a) => a.id === automationId)
  if (!automation) return
  automation.runs = [...automation.runs, run].slice(-MAX_LOGS_PER_AUTOMATION)
  automation.lastRunAt = run.completedAt ?? run.startedAt
  saveAutomations(all)
}

export function updateAutomationRun(
  automationId: string,
  runId: string,
  update: Partial<AutomationRun>,
): void {
  const all = loadAutomations()
  const automation = all.find((a) => a.id === automationId)
  if (!automation) return
  const run = automation.runs.find((r) => r.id === runId)
  if (!run) return
  Object.assign(run, update)
  automation.lastRunAt = run.completedAt ?? run.startedAt
  saveAutomations(all)
}

export function newAutomationId(): string {
  return `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

export function newRunId(): string {
  return `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

// ─── Scheduling Engine ───────────────────────────────────────────

type IntervalHandle = ReturnType<typeof setInterval>

const activeIntervals = new Map<string, IntervalHandle>()
let onAutomationRunCallback: ((automation: Automation, run: AutomationRun) => void) | null = null

export function setOnAutomationRun(
  cb: (automation: Automation, run: AutomationRun) => void,
): void {
  onAutomationRunCallback = cb
}

/** Start intervals for all enabled automations. Call on mount. */
export function startAllSchedulers(): void {
  const all = loadAutomations()
  for (const automation of all) {
    if (automation.enabled && !activeIntervals.has(automation.id)) {
      startScheduler(automation)
    }
  }
}

/** Stop all running intervals. Call on unmount. */
export function stopAllSchedulers(): void {
  for (const [id, handle] of activeIntervals) {
    clearInterval(handle)
    activeIntervals.delete(id)
  }
}

/** Start a scheduler for a single automation. */
export function startScheduler(automation: Automation): void {
  // Clear existing if any
  if (activeIntervals.has(automation.id)) {
    clearInterval(activeIntervals.get(automation.id)!)
  }

  if (!automation.enabled) return

  const handle = setInterval(() => {
    executeAutomation(automation.id)
  }, automation.scheduleMs)

  activeIntervals.set(automation.id, handle)
}

/** Stop a scheduler for a single automation. */
export function stopScheduler(automationId: string): void {
  const handle = activeIntervals.get(automationId)
  if (handle) {
    clearInterval(handle)
    activeIntervals.delete(automationId)
  }
}

/** Simulate running an automation. */
function executeAutomation(automationId: string): void {
  const all = loadAutomations()
  const automation = all.find((a) => a.id === automationId)
  if (!automation || !automation.enabled) return

  const runId = newRunId()
  const run: AutomationRun = {
    id: runId,
    startedAt: Date.now(),
    completedAt: null,
    status: 'running',
  }

  addRunToAutomation(automationId, run)

  // Simulate async execution (1-3 seconds)
  const delay = 1000 + Math.random() * 2000
  setTimeout(() => {
    updateAutomationRun(automationId, runId, {
      completedAt: Date.now(),
      status: 'success',
      message: `Completed in ${(delay / 1000).toFixed(1)}s`,
    })

    if (onAutomationRunCallback) {
      const updated = loadAutomations().find((a) => a.id === automationId)
      const updatedRun = updated?.runs.find((r) => r.id === runId)
      if (updated && updatedRun) {
        onAutomationRunCallback(updated, updatedRun)
      }
    }
  }, delay)
}
