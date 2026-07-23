export type ModelStatus = 'live' | 'degraded' | 'down'

export interface ModelStatusRecord {
  id: string
  user_id: string
  model_id: string
  status: ModelStatus
  note: string | null
  updated_at: string
}

export const STATUS_LABELS: Record<ModelStatus, string> = {
  live: 'Live',
  degraded: 'Degraded',
  down: 'Down',
}

export const STATUS_DOT: Record<ModelStatus, string> = {
  live: 'bg-primary',
  degraded: 'bg-warning',
  down: 'bg-destructive',
}
