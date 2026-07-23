import { Card } from '@/components/card'
import { MODEL_LIST, isModelConfigured } from '@/lib/nim'

export function ModelStatusCard() {
  const models = MODEL_LIST.map((m) => ({
    ...m,
    live: isModelConfigured(m.id),
  }))

  const liveCount = models.filter((m) => m.live).length

  return (
    <Card padding="lg" className="h-full">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Router status</h3>
        <span className="rounded bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
          {liveCount}/{models.length} live
        </span>
      </div>
      <ul className="space-y-2">
        {models.map((m) => (
          <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
            <span className="truncate text-foreground">{m.label}</span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className={`h-2 w-2 rounded-full ${m.live ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
              <span className="text-[10px]">{m.live ? 'Live' : 'No key'}</span>
            </span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
