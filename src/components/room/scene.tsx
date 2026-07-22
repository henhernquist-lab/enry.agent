'use client'

import { Suspense, useRef, useState, useCallback } from 'react'
import { Canvas } from '@react-three/fiber'
import { AdaptiveDpr, AdaptiveEvents, PerformanceMonitor } from '@react-three/drei'
import { Lighting } from './lighting'
import { CameraRig, type CameraHandle } from './camera'
import { Furniture } from './furniture'
import { Character } from './character'
import { LoadingScreen } from './loading-screen'
import { RoomOverlay } from './room-overlay'
import { OFFICE_ROOM } from './constants'
import type { FocusTarget } from './types'

/**
 * Scene — the 3D scene assembled inside a Canvas.
 *
 * Architecture:
 *   <Canvas>              — R3F WebGL context + render loop
 *     <PerformanceMonitor> — auto-adjusts DPR to maintain 60 FPS
 *     <Lighting>           — ambient + directional + accent lights
 *     <CameraRig>          — OrbitControls + smooth focus/reset
 *     <Furniture>          — floor, walls, desk, chair, monitor
 *     <Character>          — stylized worker with idle animations
 *
 * The camera ref is held at this level so the HTML overlay (RoomOverlay)
 * can call reset() and focusOn() imperatively.
 */
export function Scene() {
  const cameraRef = useRef<CameraHandle>(null)
  const [focusedTarget, setFocusedTarget] = useState<string | null>(null)
  const [dpr, setDpr] = useState(1.5)

  const handleReset = useCallback(() => {
    cameraRef.current?.reset()
    setFocusedTarget(null)
  }, [])

  const handleFocus = useCallback((target: FocusTarget) => {
    cameraRef.current?.focusOn(target)
    setFocusedTarget(target.id)
  }, [])

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

        <color attach="background" args={['#080808']} />
        <fog attach="fog" args={['#080808', 15, 35]} />

        <Suspense fallback={null}>
          <Lighting room={OFFICE_ROOM} />
          <CameraRig
            ref={cameraRef}
            initialPosition={OFFICE_ROOM.cameraInitial}
            target={OFFICE_ROOM.cameraTarget}
          />
          <Furniture />
          <Character spawnPosition={OFFICE_ROOM.characterSpawn} />

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
      />

      {/* Loading screen — Suspense fallback for the Canvas */}
      <Suspense fallback={<LoadingScreen />}>
        <SceneReady />
      </Suspense>
    </div>
  )
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
