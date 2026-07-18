'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, type Simulation, type SimulationLinkDatum } from 'd3-force'
import { Loader2, X, Swords, Eye, EyeOff, Save, FolderOpen } from 'lucide-react'
import type { MapData, MapNode } from '@/lib/learn/map'

// Learn's Map tab — a first-class pannable/zoomable canvas of every claim.
// Nodes are positioned by embedding similarity (a d3-force layout over the
// nearest-neighbor links the server computed), colored by live strength, and
// clickable for detail. Fog of War (item 2) is a rendering mode layered on
// top: cold regions of the map literally fog over, and animate back toward
// fog as the session sits open.

interface SimNode extends MapNode {
  x: number
  y: number
  vx?: number
  vy?: number
  index?: number
}

type SimLink = SimulationLinkDatum<SimNode> & { similarity: number }

interface ClaimDetail {
  claim: {
    id: string
    content: string
    topic: string
    status: string
    strength: number
    half_life: number
    last_probed_at: string | null
    next_probe_at: string | null
    created_at: string
  }
  events: { id: string; event_type: string; payload: Record<string, unknown>; created_at: string }[]
}

// Regions untouched longer than this read as "cold" and fog fully closes over
// them. Fresh nodes clear the fog around themselves proportionally to how
// recently they were touched.
const FOG_COLD_DAYS = 14
const DAY_MS = 86_400_000

const NODE_RADIUS = 7
const HIT_PADDING = 6

// strength 1 → green, 0.5 → amber, 0 → red. Linear ramp through the two
// theme accent colors already used elsewhere for good/warning/bad.
function strengthColor(s: number): string {
  const clamped = Math.max(0, Math.min(1, s))
  const green = [58, 158, 96]
  const amber = [255, 184, 0]
  const red = [255, 77, 77]
  let from: number[]
  let to: number[]
  let t: number
  if (clamped >= 0.5) {
    from = amber; to = green; t = (clamped - 0.5) / 0.5
  } else {
    from = red; to = amber; t = clamped / 0.5
  }
  const c = from.map((f, i) => Math.round(f + (to[i] - f) * t))
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`
}

export function ClaimMap() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const nodesRef = useRef<SimNode[]>([])
  const linksRef = useRef<SimLink[]>([])
  const viewRef = useRef({ scale: 1, x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; moved: boolean } | null>(null)
  const rafRef = useRef<number | null>(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [empty, setEmpty] = useState(false)
  const [fog, setFog] = useState(true)
  const [selected, setSelected] = useState<ClaimDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [fogSource, setFogSource] = useState<MapData['fog_source']>('fallback')
  // Saveable views (item 4): persist camera + a frozen node/link snapshot so a
  // saved map reopens EXACTLY, positions and all — no re-fetch, no re-layout.
  const [saving, setSaving] = useState(false)
  const [savedViews, setSavedViews] = useState<{ id: string; store: string; title: string }[]>([])
  const [savedMenuOpen, setSavedMenuOpen] = useState(false)
  const savedMenuRef = useRef<HTMLDivElement>(null)

  // ── Render ────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const { width, height } = canvas
    const view = viewRef.current

    ctx.clearRect(0, 0, width, height)
    ctx.fillStyle = '#080808'
    ctx.fillRect(0, 0, width, height)

    const toScreenX = (wx: number) => wx * view.scale + view.x
    const toScreenY = (wy: number) => wy * view.scale + view.y

    // Links.
    ctx.lineWidth = 1
    for (const link of linksRef.current) {
      const s = link.source as SimNode
      const t = link.target as SimNode
      if (typeof s !== 'object' || typeof t !== 'object') continue
      ctx.strokeStyle = `rgba(120, 130, 150, ${0.08 + link.similarity * 0.14})`
      ctx.beginPath()
      ctx.moveTo(toScreenX(s.x), toScreenY(s.y))
      ctx.lineTo(toScreenX(t.x), toScreenY(t.y))
      ctx.stroke()
    }

    // Nodes.
    for (const n of nodesRef.current) {
      const sx = toScreenX(n.x)
      const sy = toScreenY(n.y)
      const r = NODE_RADIUS * Math.max(0.7, Math.min(1.6, view.scale))
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fillStyle = strengthColor(n.strength)
      ctx.globalAlpha = 0.85
      ctx.fill()
      ctx.globalAlpha = 1
      if (n.is_enemy) {
        ctx.strokeStyle = '#ff4d4d'
        ctx.lineWidth = 2
        ctx.setLineDash([3, 2])
        ctx.stroke()
        ctx.setLineDash([])
      }
      if (selected && selected.claim.id === n.id) {
        ctx.strokeStyle = '#ffffff'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.arc(sx, sy, r + 3, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // ── Fog of War overlay ────────────────────────────────────────────
    // Paint a fog sheet over the whole canvas, then punch clear holes around
    // each node scaled by freshness — recently-touched nodes clear a wide,
    // soft circle; cold nodes clear almost nothing, so regions with only
    // stale claims stay fogged. Age is read against Date.now() every frame,
    // so as the session sits open, holes slowly shrink and the fog closes
    // back in — the "decaying back into fog" animation, no re-fetch needed.
    if (fog) {
      const now = Date.now()
      ctx.save()
      ctx.fillStyle = 'rgba(8, 10, 16, 0.82)'
      ctx.fillRect(0, 0, width, height)
      ctx.globalCompositeOperation = 'destination-out'
      for (const n of nodesRef.current) {
        const ageDays = (now - new Date(n.last_touched_at).getTime()) / DAY_MS
        const freshness = Math.max(0, 1 - ageDays / FOG_COLD_DAYS) // 1 fresh → 0 cold
        if (freshness <= 0) continue
        const sx = toScreenX(n.x)
        const sy = toScreenY(n.y)
        const clearR = (30 + freshness * 70) * Math.max(0.6, Math.min(1.8, view.scale))
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, clearR)
        grad.addColorStop(0, `rgba(0,0,0,${0.55 * freshness + 0.25})`)
        grad.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.fillStyle = grad
        ctx.beginPath()
        ctx.arc(sx, sy, clearR, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.restore()
    }
  }, [fog, selected])

  // Continuous redraw loop — cheap (a few dozen nodes) and lets the fog
  // animate without wiring per-property state.
  useEffect(() => {
    let running = true
    const loop = () => {
      if (!running) return
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => {
      running = false
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [draw])

  // ── Load data + run the force layout once, settled ──────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/learn/map')
        if (!res.ok) {
          setError(`Failed to load map (HTTP ${res.status})`)
          return
        }
        const data: MapData = await res.json()
        if (cancelled) return
        setFogSource(data.fog_source)
        if (data.nodes.length === 0) {
          setEmpty(true)
          return
        }
        setEmpty(false)

        const canvas = canvasRef.current
        const cx = (canvas?.width ?? 800) / 2
        const cy = (canvas?.height ?? 600) / 2
        const nodes: SimNode[] = data.nodes.map((n, i) => ({
          ...n,
          x: cx + Math.cos(i) * 120,
          y: cy + Math.sin(i) * 120,
        }))
        const links: SimLink[] = data.links.map((l) => ({ source: l.source, target: l.target, similarity: l.similarity }))

        const sim: Simulation<SimNode, SimLink> = forceSimulation(nodes)
          .force('charge', forceManyBody<SimNode>().strength(-140))
          .force('center', forceCenter<SimNode>(cx, cy))
          .force('collide', forceCollide<SimNode>(NODE_RADIUS * 2.2))
          .force(
            'link',
            forceLink<SimNode, SimLink>(links)
              .id((d) => d.id)
              .distance((l) => 40 + (1 - l.similarity) * 120)
              .strength((l) => 0.1 + l.similarity * 0.4),
          )
          .stop()

        // Tick to a settled layout synchronously, then freeze — pan/zoom is a
        // viewport transform, it never re-runs physics.
        const ticks = Math.min(400, Math.max(120, nodes.length * 8))
        for (let i = 0; i < ticks; i++) sim.tick()

        nodesRef.current = nodes
        linksRef.current = links
      } catch {
        if (!cancelled) setError('Network error loading map')
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [])

  // ── Canvas sizing ───────────────────────────────────────────────────
  useEffect(() => {
    const resize = () => {
      const canvas = canvasRef.current
      const wrap = wrapRef.current
      if (!canvas || !wrap) return
      const dpr = window.devicePixelRatio || 1
      const rect = wrap.getBoundingClientRect()
      canvas.width = rect.width * dpr
      canvas.height = rect.height * dpr
      canvas.style.width = `${rect.width}px`
      canvas.style.height = `${rect.height}px`
      const ctx = canvas.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])

  // ── Pan / zoom / select ─────────────────────────────────────────────
  const hitTest = useCallback((screenX: number, screenY: number): SimNode | null => {
    const view = viewRef.current
    let best: SimNode | null = null
    let bestDist = Infinity
    for (const n of nodesRef.current) {
      const sx = n.x * view.scale + view.x
      const sy = n.y * view.scale + view.y
      const d = Math.hypot(sx - screenX, sy - screenY)
      const r = NODE_RADIUS * Math.max(0.7, Math.min(1.6, view.scale)) + HIT_PADDING
      if (d <= r && d < bestDist) { best = n; bestDist = d }
    }
    return best
  }, [])

  const loadDetail = useCallback(async (claimId: string) => {
    setDetailLoading(true)
    try {
      const res = await fetch(`/api/learn/claim?claim_id=${encodeURIComponent(claimId)}`)
      if (res.ok) setSelected(await res.json())
    } catch { /* leave prior selection */ } finally {
      setDetailLoading(false)
    }
  }, [])

  // ── Saveable views ──────────────────────────────────────────────────
  const saveCurrentView = useCallback(async () => {
    if (nodesRef.current.length === 0) return
    setSaving(true)
    try {
      // Freeze node positions + links (as id pairs) + camera. Reopen restores
      // this verbatim instead of re-fetching/re-laying-out — exact, not live.
      const snapshot = {
        nodes: nodesRef.current.map((n) => ({ ...n })),
        links: linksRef.current.map((l) => ({
          source: (l.source as SimNode).id,
          target: (l.target as SimNode).id,
          similarity: l.similarity,
        })),
        fog,
      }
      const view = viewRef.current
      await fetch('/api/learn/saved-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          view: 'map',
          title: `Map · ${new Date().toLocaleString()}`,
          params: { camera: { scale: view.scale, x: view.x, y: view.y }, fog },
          snapshot,
        }),
      })
    } catch { /* ignore */ } finally {
      setSaving(false)
    }
  }, [fog])

  const loadSavedList = useCallback(async () => {
    try {
      const res = await fetch('/api/learn/saved-views')
      if (!res.ok) return
      const { saved } = await res.json()
      setSavedViews((saved ?? []).filter((r: { view: string }) => r.view === 'map'))
    } catch { /* ignore */ }
  }, [])

  const reopenSaved = useCallback(async (id: string, store: string) => {
    setSavedMenuOpen(false)
    try {
      const res = await fetch(`/api/learn/saved-views?id=${encodeURIComponent(id)}&store=${encodeURIComponent(store)}`)
      if (!res.ok) return
      const rec = await res.json()
      const snap = rec.snapshot as { nodes: SimNode[]; links: { source: string; target: string; similarity: number }[]; fog?: boolean }
      const nodes = (snap.nodes ?? []).map((n) => ({ ...n }))
      const byId = new Map(nodes.map((n) => [n.id, n]))
      // Re-resolve link endpoints from ids back to the restored node objects.
      const links: SimLink[] = []
      for (const l of snap.links ?? []) {
        const s = byId.get(l.source)
        const t = byId.get(l.target)
        if (s && t) links.push({ source: s, target: t, similarity: l.similarity })
      }
      nodesRef.current = nodes
      linksRef.current = links
      const cam = (rec.params?.camera ?? {}) as { scale?: number; x?: number; y?: number }
      viewRef.current = { scale: cam.scale ?? 1, x: cam.x ?? 0, y: cam.y ?? 0 }
      if (typeof snap.fog === 'boolean') setFog(snap.fog)
      setEmpty(nodes.length === 0)
      setError(null)
      setLoading(false)
    } catch { /* ignore */ }
  }, [])

  // Click-outside close for the saved-views menu.
  useEffect(() => {
    if (!savedMenuOpen) return
    const onDown = (e: MouseEvent) => {
      if (savedMenuRef.current && !savedMenuRef.current.contains(e.target as Node)) setSavedMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [savedMenuOpen])

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
    dragRef.current = { startX: e.clientX - rect.left, startY: e.clientY - rect.top, moved: false }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current
    if (!drag) return
    if (Math.abs(e.movementX) > 0 || Math.abs(e.movementY) > 0) {
      if (Math.abs(e.movementX) > 1 || Math.abs(e.movementY) > 1) drag.moved = true
      viewRef.current.x += e.movementX
      viewRef.current.y += e.movementY
    }
  }
  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current
    dragRef.current = null
    if (drag && !drag.moved) {
      const rect = (e.target as HTMLCanvasElement).getBoundingClientRect()
      const hit = hitTest(e.clientX - rect.left, e.clientY - rect.top)
      if (hit) loadDetail(hit.id)
      else setSelected(null)
    }
  }
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const view = viewRef.current
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const newScale = Math.max(0.2, Math.min(5, view.scale * factor))
    view.x = cx - (cx - view.x) * (newScale / view.scale)
    view.y = cy - (cy - view.y) * (newScale / view.scale)
    view.scale = newScale
  }

  const fogLabel = useMemo(
    () => (fogSource === 'fallback' ? 'Fog (approx — run migration 020 for full activity)' : 'Fog of War'),
    [fogSource],
  )

  return (
    <div className="relative flex h-full min-h-0 flex-1">
      <div ref={wrapRef} className="relative min-h-0 flex-1 overflow-hidden">
        <canvas
          ref={canvasRef}
          className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
        />

        {/* Fog toggle — absolute over the canvas at top-left, z-10 so it's
            definitively above the canvas regardless of stacking quirks. The
            onClick flips the `fog` state used by `draw()` to paint the
            overlay; the animation-loop useEffect re-creates on fog change. */}
        <button
          onClick={() => setFog((f) => !f)}
          className={`absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-colors ${
            fog ? 'border-accent/50 bg-accent/15 text-accent' : 'border-border bg-surface-secondary text-muted-foreground hover:text-foreground'
          }`}
          style={{ pointerEvents: 'auto' }}
          title={fogLabel}
        >
          {fog ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />} {fog ? 'Fog on' : 'Fog off'}
        </button>

        {/* Save / reopen this view */}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <button
            onClick={saveCurrentView}
            disabled={saving}
            className="flex items-center gap-1.5 rounded border border-border bg-surface-secondary px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground disabled:opacity-40"
            title="Save this view — reopens exactly, positions and all"
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />} Save
          </button>
          <div ref={savedMenuRef} className="relative">
            <button
              onClick={() => { const next = !savedMenuOpen; setSavedMenuOpen(next); if (next) loadSavedList() }}
              className="flex items-center gap-1 rounded border border-border bg-surface-secondary px-2 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
              title="Reopen a saved view"
            >
              <FolderOpen className="h-3 w-3" /> Saved
            </button>
            {savedMenuOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 max-h-64 w-56 overflow-y-auto rounded border border-border bg-surface-elevated shadow-lg">
                {savedViews.length === 0 ? (
                  <div className="px-3 py-2 font-mono text-[10px] text-muted-foreground/50">No saved maps yet.</div>
                ) : savedViews.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => reopenSaved(s.id, s.store)}
                    className="block w-full truncate px-3 py-2 text-left font-mono text-[10px] text-muted-foreground transition-colors hover:bg-surface-secondary hover:text-foreground"
                  >
                    {s.title}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded border border-border bg-surface-secondary/80 px-2.5 py-1.5 font-mono text-[9px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: 'rgb(58,158,96)' }} /> strong</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: 'rgb(255,184,0)' }} /> fading</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: 'rgb(255,77,77)' }} /> weak</span>
        </div>

        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="font-mono text-[12px] text-destructive">{error}</p>
          </div>
        )}
        {empty && !loading && !error && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-xs text-center">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground/50">No claims yet</p>
              <p className="mt-2 font-sans text-[12px] leading-relaxed text-muted-foreground/40">
                Learn something in the Chat tab — every claim you capture shows up here as a node.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <aside className="flex w-[300px] flex-shrink-0 flex-col border-l border-border bg-surface-secondary">
          <div className="flex items-start justify-between gap-2 border-b border-border p-3">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">{selected.claim.topic || 'claim'}</span>
                {selected.claim.status !== 'active' && (
                  <span className="rounded bg-surface-elevated px-1 py-0.5 font-mono text-[8px] uppercase text-warning">{selected.claim.status}</span>
                )}
              </div>
              <p className="mt-1 font-sans text-[13px] leading-relaxed text-foreground">{selected.claim.content}</p>
            </div>
            <button onClick={() => setSelected(null)} className="flex-shrink-0 rounded p-1 text-muted-foreground hover:bg-surface-elevated hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-px border-b border-border bg-border font-mono text-[10px]">
            <Stat label="strength" value={selected.claim.strength.toFixed(2)} />
            <Stat label="half-life" value={`${selected.claim.half_life}h`} />
            <Stat label="last probed" value={selected.claim.last_probed_at ? new Date(selected.claim.last_probed_at).toLocaleDateString() : '—'} />
            <Stat label="next probe" value={selected.claim.next_probe_at ? new Date(selected.claim.next_probe_at).toLocaleDateString() : '—'} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            <div className="mb-2 flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
              <Swords className="h-3 w-3" /> Recent events
            </div>
            {detailLoading ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground/40" />
            ) : selected.events.length === 0 ? (
              <p className="font-mono text-[10px] text-muted-foreground/40">No events yet.</p>
            ) : (
              <ul className="space-y-2">
                {selected.events.map((ev) => (
                  <li key={ev.id} className="border-l-2 border-border pl-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-accent">{ev.event_type}</span>
                      <span className="font-mono text-[9px] text-muted-foreground/40">{new Date(ev.created_at).toLocaleString()}</span>
                    </div>
                    {typeof ev.payload?.answer === 'string' && (
                      <p className="mt-0.5 font-sans text-[10px] leading-relaxed text-muted-foreground">{String(ev.payload.answer)}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-secondary p-2">
      <div className="text-[8px] uppercase tracking-wider text-muted-foreground/50">{label}</div>
      <div className="mt-0.5 text-foreground">{value}</div>
    </div>
  )
}
