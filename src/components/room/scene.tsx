'use client'

import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { AdaptiveDpr, AdaptiveEvents, PerformanceMonitor } from '@react-three/drei'
import { Lighting } from './lighting'
import { CameraRig, type CameraHandle } from './camera'
import { Furniture } from './furniture'
import { CharacterController, type WorkerInfo } from './character'
import { LoadingScreen } from './loading-screen'
import { RoomOverlay } from './room-overlay'
import { EnvironmentLife } from './environment-life'
import { useRoomState, useActivitySnapshot } from './room-state'
import { useActivityManager } from './activity-manager'
import { useWalkingController } from './walking-controller'
import { OFFICE_ROOM, SURFACE_ENTRY_EVENTS, EVENT_ACTIVITY_MAP } from './constants'
import type { FocusTarget } from './types'

/**
 * Scene — the 3D scene assembled inside a Canvas.
 *
 * Architecture:
 *   <Canvas>               — R3F WebGL context + render loop
 *     <PerformanceMonitor>  — auto-adjusts DPR to maintain 60 FPS
 *     <Lighting>            — ambient + directional + accent + lamp lights
 *     <CameraRig>           — OrbitControls + smooth focus/reset + idle sway
 *     <Furniture>           — floor, walls, desk, chair, monitor, whiteboard, coffee, window
 *     <EnvironmentLife>     — dust particles, ambient effects
 *     <CharacterController> — worker driven by ActivityManager + WalkingController
 *
 * Systems (non-visual, drive the character):
 *   - RoomState: central store, no re-renders
 *   - ActivityManager: event→activity mapping + mocked timeline
 *   - WalkingController: reusable movement system
 *
 * The camera ref is held at this level so the HTML overlay can call
 * reset() and focusOn() imperatively.
 */
interface SceneProps {
  /** Which surface opened The Room (drive | cruise | learn | chat). */
  from?: string
  /** Whether that surface had an active run when it opened The Room. */
  state?: 'working' | 'idle'
}

export function Scene({ from, state }: SceneProps) {
  const cameraRef = useRef<CameraHandle>(null)
  const [focusedTarget, setFocusedTarget] = useState<string | null>(null)
  const [dpr, setDpr] = useState(1.5)

  // ── Core systems ──────────────────────────────────────────────
  const store = useRoomState()
  const walker = useWalkingController()
  const activityManager = useActivityManager(store, walker)

  // ── Worker context — real data for the speech bubble / click HUD ─
  // Two real sources, both also used elsewhere so all surfaces agree:
  //   - /api/usage: today's top model + request count (also backs Usage page)
  //   - /api/activity/recent: most recent request's mode/model/recency
  //     (also backs the homepage Live Activity widget) — the same source,
  //     not a second one, per the "one truth across surfaces" requirement.
  // Surface/state come from the entry context (?from=/&state=). No filler
  // is fabricated downstream.
  const [workerInfo, setWorkerInfo] = useState<WorkerInfo>({ surface: from, state })
  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch('/api/usage?range=today').then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch('/api/activity/recent').then((r) => (r.ok ? r.json() : null)).catch(() => null),
    ]).then(([usage, recent]) => {
      if (cancelled) return
      const top = usage?.breakdown?.model?.[0] as { label?: string } | undefined
      const requests = usage?.summary?.requests as number | undefined
      const recentActivityLine = recent?.at
        ? `${recent.mode ? recent.mode[0].toUpperCase() + recent.mode.slice(1) : 'Activity'} · ${recent.modelLabel ?? 'unknown model'}`
        : undefined
      setWorkerInfo({
        surface: from,
        state,
        topModel: top?.label,
        modelLine: top?.label ? `${top.label} · ${requests ?? 0} req today` : undefined,
        recentActivityLine,
      })
    })
    return () => { cancelled = true }
  }, [from, state])

  // ── Worker mini-HUD (opened by clicking the character) ─────────
  // Screen-space overlay rather than an in-canvas drei <Html> — a
  // conditionally-mounted Html fails to portal children after the
  // initial mount, and a fixed panel is more readable regardless.
  const [hudOpen, setHudOpen] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const { label: activityLabel } = useActivitySnapshot(store)
  useEffect(() => {
    if (!hudOpen) return
    const id = setInterval(() => setElapsed(store.character.activityElapsed), 1000)
    return () => clearInterval(id)
  }, [hudOpen, store])
  const handleCharacterClick = useCallback(() => {
    setElapsed(store.character.activityElapsed)
    setHudOpen((v) => !v)
  }, [store])

  // ── Camera controls ───────────────────────────────────────────
  const handleReset = useCallback(() => {
    cameraRef.current?.reset()
    cameraRef.current?.followTarget(null)
    setFocusedTarget(null)
  }, [])

  const handleFocus = useCallback((target: FocusTarget) => {
    cameraRef.current?.focusOn(target)
    setFocusedTarget(target.id)
  }, [])

  // ── Entry context — opened via a "See Enry" button ────────────
  // When a surface opened The Room, the worker reflects that surface's
  // state instead of the ambient real-activity poll: stop the poll and
  // dispatch the surface's event through the existing state machine,
  // then glide the camera onto the worker's station so you land looking
  // at the thing Enry is doing. Direct visits (no `from`) keep the
  // ambient sync (real activity, polled every 20s) and default framing.
  useEffect(() => {
    if (!from) return
    const entry = SURFACE_ENTRY_EVENTS[from]
    if (!entry) return
    activityManager.stopAmbientSync()
    const event = state === 'working' ? entry.working : entry.idle
    activityManager.dispatch(event)

    // Focus the camera on the station this event sends the worker to.
    // Small delay: lets the canvas settle and reads as a deliberate move.
    const stationId = EVENT_ACTIVITY_MAP[event]?.station
    const station = OFFICE_ROOM.stations.find((s) => s.id === stationId)
    if (!station) return
    const focusTarget =
      OFFICE_ROOM.focusTargets.find((f) => f.id === (station.id === 'desk' ? 'main-desk' : station.id)) ??
      {
        id: station.id,
        label: station.label,
        position: [station.position[0], station.position[1] + 1.2, station.position[2]] as [number, number, number],
        distance: 5,
      }
    const timer = setTimeout(() => handleFocus(focusTarget), 700)
    return () => clearTimeout(timer)
    // activityManager/handleFocus are stable per mount; re-run only on URL context change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, state])

  // ── Per-frame tick for the activity manager ───────────────────
  // We use a lightweight component inside the Canvas to drive ticks
  return (
    <div className="relative h-screen w-full">
      <Canvas
        shadows
        dpr={dpr}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        }}
        onCreated={({ gl }) => {
          // Global exposure lift — the ACES tonemapper crushes an already
          // dark scene; 1.25 keeps highlights filmic but opens the shadows.
          gl.toneMappingExposure = 1.25
        }}
        camera={{
          position: OFFICE_ROOM.cameraInitial,
          fov: 45,
          near: 0.1,
          far: 100,
        }}
      >
        <PerformanceMonitor
          onIncline={() => setDpr(1.5)}
          onDecline={() => setDpr(1.0)}
        />
        <AdaptiveDpr pixelated />
        <AdaptiveEvents />

        <color attach="background" args={['#0c0f11']} />
        <fog attach="fog" args={['#0c0f11', 18, 45]} />

        <Suspense fallback={null}>
          <Lighting room={OFFICE_ROOM} />
          <CameraRig
            ref={cameraRef}
            initialPosition={OFFICE_ROOM.cameraInitial}
            target={OFFICE_ROOM.cameraTarget}
          />
          <Furniture />
          <EnvironmentLife />
          <CharacterController
            store={store}
            walker={walker}
            spawnPosition={OFFICE_ROOM.characterSpawn}
            info={workerInfo}
            onCharacterClick={handleCharacterClick}
          />

          {/* Activity manager tick — drives the character's behavior */}
          <ActivityTicker activityManager={activityManager} />

          {/* Invisible click targets for desk focus — double-click to focus */}
          {OFFICE_ROOM.focusTargets.map((target) => (
            <DeskClickTarget
              key={target.id}
              target={target}
              onDoubleClick={() => handleFocus(target)}
            />
          ))}
        </Suspense>
      </Canvas>

      {/* Worker mini-HUD — model / task / elapsed, all real context */}
      {hudOpen && (
        <WorkerHudPanel
          info={workerInfo}
          activityLabel={activityLabel || 'idle'}
          elapsed={elapsed}
          onClose={() => setHudOpen(false)}
        />
      )}

      {/* HTML overlay — UI controls on top of the 3D canvas */}
      <RoomOverlay
        room={OFFICE_ROOM}
        focusedTarget={focusedTarget}
        onReset={handleReset}
        onFocus={handleFocus}
        activityLabel={store.getActivity()}
      />

      {/* Loading screen — Suspense fallback for the Canvas */}
      <Suspense fallback={<LoadingScreen />}>
        <SceneReady />
      </Suspense>
    </div>
  )
}

/** Drives the activity manager tick inside the Canvas's render loop. */
function ActivityTicker({ activityManager }: { activityManager: ReturnType<typeof useActivityManager> }) {
  // useFrame is only available inside Canvas — this component exists
  // solely to call activityManager.tick() each frame
  useFrame((_, delta) => {
    activityManager.tick(delta)
  })
  return null
}

/** Invisible mesh that captures double-clicks to focus the camera. */
function DeskClickTarget({
  target,
  onDoubleClick,
}: {
  target: FocusTarget
  onDoubleClick: () => void
}) {
  return (
    <mesh
      position={target.position}
      onDoubleClick={onDoubleClick}
      visible={false}
    >
      <boxGeometry args={[4, 2, 2]} />
      <meshBasicMaterial transparent opacity={0} />
    </mesh>
  )
}

/** No-op component that just renders children — keeps Suspense happy. */
function SceneReady() {
  return null
}

// ── Worker mini-HUD panel ──────────────────────────────────────────

function formatElapsed(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const m = Math.floor(s / 60)
  return m > 0 ? `${m}m ${s % 60}s` : `${s}s`
}

function WorkerHudPanel({
  info,
  activityLabel,
  elapsed,
  onClose,
}: {
  info?: WorkerInfo
  activityLabel: string
  elapsed: number
  onClose: () => void
}) {
  const task = info?.surface
    ? `${info.surface} · ${activityLabel}`
    : `ambient · ${activityLabel}`

  return (
    <div className="absolute right-6 top-20 z-20 min-w-[210px] rounded-lg border border-primary/30 bg-surface-secondary/90 p-3 font-mono text-[11px] backdrop-blur">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[9px] uppercase tracking-widest text-primary">Enry</span>
        <button
          onClick={onClose}
          aria-label="Close"
          className="px-1 text-xs leading-none text-muted-foreground transition-colors hover:text-foreground"
        >
          ×
        </button>
      </div>
      {[
        ['Model', info?.topModel ?? '—'],
        ['Task', task],
        ['Elapsed', formatElapsed(elapsed)],
      ].map(([k, v]) => (
        <div key={k} className="flex items-center justify-between gap-4 py-0.5">
          <span className="text-muted-foreground">{k}</span>
          <span className="max-w-[150px] truncate text-right text-foreground">{v}</span>
        </div>
      ))}
    </div>
  )
}
