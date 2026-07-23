import { auth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { resolveResourceUserId } from '@/lib/resource-user'
import { MODEL_LIST, isModelConfigured } from '@/lib/nim'
import { getModelHealthMetrics } from '@/lib/usage/health'
import type { ModelStatus, ModelStatusRecord } from '@/lib/model-status'
import type { ModelHealth, HealthStatus } from '@/lib/model-intelligence'

export const maxDuration = 10
export const dynamic = 'force-dynamic'

// Same manual-status → derived-status → unconfigured → unknown fallback
// order as the dashboard's Router Status card (model-status-card.tsx) —
// one source of truth for what "online" means, read from the same
// model_statuses table plus real usage_log metrics instead of a second,
// disagreeing status system.
function resolveStatus(
  override: ModelStatus | undefined,
  configured: boolean,
  hasData: boolean,
  hasRecentData: boolean,
  successRate: number,
  avgLatencyMs: number,
): { status: HealthStatus; source: ModelHealth['statusSource'] } {
  if (override === 'live') return { status: 'online', source: 'manual' }
  if (override === 'degraded') return { status: 'slow', source: 'manual' }
  if (override === 'down') return { status: 'offline', source: 'manual' }

  if (!configured) return { status: 'offline', source: 'unconfigured' }
  if (!hasData || !hasRecentData) return { status: 'unknown', source: 'none' }

  if (successRate >= 95 && avgLatencyMs < 4000) return { status: 'online', source: 'derived' }
  if (successRate >= 85) return { status: 'slow', source: 'derived' }
  return { status: 'offline', source: 'derived' }
}

export async function GET() {
  const session = await auth()
  const googleId = (session?.user as { id?: string } | undefined)?.id ?? null
  const uid = await resolveResourceUserId(googleId)
  if (!uid) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const [metrics, statusRes] = await Promise.all([
    getModelHealthMetrics(uid),
    supabase.from('model_statuses').select('model_id, status, note').eq('user_id', uid),
  ])

  const statusMap = new Map<string, { status: ModelStatus; note: string | null }>()
  for (const row of (statusRes.data ?? []) as Pick<ModelStatusRecord, 'model_id' | 'status' | 'note'>[]) {
    statusMap.set(row.model_id, { status: row.status, note: row.note })
  }

  const health: ModelHealth[] = MODEL_LIST.map((m) => {
    const modelMetrics = metrics[m.id]
    const override = statusMap.get(m.id)
    const configured = isModelConfigured(m.id)
    const { status, source } = resolveStatus(
      override?.status,
      configured,
      modelMetrics?.hasData ?? false,
      modelMetrics?.hasRecentData ?? false,
      modelMetrics?.successRate ?? 0,
      modelMetrics?.avgLatencyMs ?? 0,
    )

    return {
      modelId: m.id,
      status,
      statusSource: source,
      statusNote: override?.note ?? null,
      hasData: modelMetrics?.hasData ?? false,
      avgLatencyMs: modelMetrics?.avgLatencyMs ?? 0,
      successRate: modelMetrics?.successRate ?? 0,
      errorRate: modelMetrics?.errorRate ?? 0,
      lastSuccessAt: modelMetrics?.lastSuccessAt ?? null,
      lastFailureAt: modelMetrics?.lastFailureAt ?? null,
      requestsToday: modelMetrics?.requestsToday ?? 0,
      provider: m.company,
      latencyHistory: modelMetrics?.latencyHistory ?? [],
    }
  })

  return Response.json({ health })
}
