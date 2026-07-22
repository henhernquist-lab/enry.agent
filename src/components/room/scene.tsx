'use client'

import { Suspense, useEffect, useRef, useState, useCallback } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { AdaptiveDpr, AdaptiveEvents, PerformanceMonitor } from '@react-three/drei'
import { Lighting } from './lighting'
import { CameraRig, type CameraHandle } from './camera'
import { Furniture } from './furniture'
import { CharacterController } from './character'
import { LoadingScreen } from './loading-screen'
import { RoomOverlay } from './room-overlay'
import { EnvironmentLife } from './environment-life'
import { useRoomState } from './room-state'
import { useActivityManager } from './activity-manager'
import { useWalkingController } from './walking-controller'
import { OFFICE_ROOM, SURFACE_ENTRY_EVENTS } from './constants'
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

  // ── Entry context — opened via a "See Enry" button ────────────
  // When a surface opened The Room, the worker reflects that surface's
  // state instead of the mocked ambient timeline: stop the mock and
  // dispatch the surface's event through the existing state machine.
  // Direct visits (no `from`) keep the ambient timeline as before.
  useEffect(() => {
    if (!from) return
    const entry = SURFACE_ENTRY_EVENTS[from]
    if (!entry) return
    activityManager.stopMockTimeline()
    activityManager.dispatch(state === 'working' ? entry.working : entry.idle)
    // activityManager is stable per mount; re-dispatch only if the URL context changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from, state])

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
