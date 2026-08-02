'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { GolemState } from '@/lib/golem-mascot'
import { useGolemColors, type GolemColors } from './golem-colors'

// Golem, in 3D.
//
// A round blob-creature — no species, no limbs, two eyes. The silhouette is a
// sphere pushed around at build time rather than a sculpted model: it keeps the
// whole character to one low-poly geometry with no asset to load.
//
// Everything that makes it read as alive runs inside useFrame and writes
// straight to object transforms. Nothing here is React state, so a breathing,
// blinking, squashing Golem costs zero renders — the same contract the SVG
// version had with its CSS keyframes, and the one golem-motion.ts already uses
// for the drift.

/** Rendered box for the floating mascot. Tunable — the mesh scales to fit. */
export const GOLEM_DEFAULT_SIZE = 140

/**
 * Per-frame deformation handed over by the motion engine (bounce squash, bob,
 * facing). A plain ref rather than props: the drift runs at rAF rate, and
 * routing it through React would re-render the tree 60 times a second.
 */
export interface GolemDeform {
  bob: number
  squashX: number
  squashY: number
  facing: 1 | -1
}

export type GolemDeformRef = React.RefObject<GolemDeform | null>

interface GolemArtProps {
  state: GolemState
  /** Supplied by the floating mascot; omitted for static inline placements. */
  deformRef?: GolemDeformRef
}

// ─── Geometry ────────────────────────────────────────────────────────
//
// Built once per module, not per instance: every Golem on the page is the same
// shape, so they share the buffer.

function buildBlobGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 32, 24)
  const pos = geo.attributes.position

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    // Fattest around the middle, tapering top and bottom — reads as a soft
    // body rather than a ball.
    const t = (y + 1) / 2
    const widen = 1 + 0.14 * Math.sin(t * Math.PI)

    // Gently squash vertically, then soften the very bottom so it looks like
    // it settles rather than balancing on a point.
    let ny = y * 0.9
    if (ny < -0.68) ny = -0.68 + (ny + 0.68) * 0.45

    pos.setXYZ(i, x * widen, ny, z * widen)
  }

  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

const BLOB_GEOMETRY = /* @__PURE__ */ buildBlobGeometry()
const EYE_GEOMETRY = /* @__PURE__ */ new THREE.SphereGeometry(0.19, 16, 12)
const HIGHLIGHT_GEOMETRY = /* @__PURE__ */ new THREE.SphereGeometry(0.062, 8, 6)

// ─── Per-state tuning ────────────────────────────────────────────────

interface StateTuning {
  /** Breathing rate, cycles per second. */
  breathRate: number
  breathDepth: number
  /** 0 = wide open, 1 = fully shut. */
  eyeClose: number
  /** Lean, in radians. Negative leans forward/alert. */
  lean: number
  blinks: boolean
}

const TUNING: Record<GolemState, StateTuning> = {
  idle: { breathRate: 0.55, breathDepth: 0.045, eyeClose: 0, lean: 0, blinks: true },
  dozing: { breathRate: 0.28, breathDepth: 0.065, eyeClose: 0.88, lean: 0.1, blinks: false },
  thinking: { breathRate: 1.15, breathDepth: 0.03, eyeClose: 0.25, lean: -0.16, blinks: true },
  success: { breathRate: 0.8, breathDepth: 0.05, eyeClose: 0, lean: -0.05, blinks: true },
  error: { breathRate: 0.5, breathDepth: 0.035, eyeClose: 0.45, lean: 0.14, blinks: true },
}

function Blob({ state, deformRef, colors }: { state: GolemState; deformRef?: GolemDeformRef; colors: GolemColors }) {
  const root = useRef<THREE.Group>(null)
  const body = useRef<THREE.Group>(null)
  const eyes = useRef<THREE.Group>(null)
  const bodyMat = useRef<THREE.MeshStandardMaterial>(null)

  // Animation clocks and transient impulses live in a ref, so a state change
  // starts a reaction without re-rendering anything.
  const anim = useRef({
    t: 0,
    blinkAt: 1.5 + Math.random() * 3,
    blinkFor: 0,
    hop: 0,
    shudder: 0,
    prevState: state as GolemState,
    squashX: 1,
    squashY: 1,
  })

  useFrame((_, rawDelta) => {
    const a = anim.current
    // A backgrounded tab returns one enormous delta; clamp so nothing lurches.
    const dt = Math.min(rawDelta, 0.05)
    a.t += dt

    const tune = TUNING[state]

    // Entering success/error fires a one-shot reaction that decays out.
    if (state !== a.prevState) {
      if (state === 'success') a.hop = 1
      if (state === 'error') a.shudder = 1
      a.prevState = state
    }
    a.hop = Math.max(0, a.hop - dt * 1.6)
    a.shudder = Math.max(0, a.shudder - dt * 2.4)

    // Blink on a random cadence, skipped when the eyes are already shut.
    if (tune.blinks) {
      a.blinkAt -= dt
      if (a.blinkAt <= 0) {
        a.blinkFor = 0.13
        a.blinkAt = 2.2 + Math.random() * 4
      }
    }
    a.blinkFor = Math.max(0, a.blinkFor - dt)
    const blinking = a.blinkFor > 0 ? 1 : 0

    // Breathing — the baseline "this thing is alive" signal.
    const breath = Math.sin(a.t * tune.breathRate * Math.PI * 2) * tune.breathDepth

    // Bounce squash from the motion engine, eased so an edge hit lands soft.
    const deform = deformRef?.current
    a.squashX += ((deform?.squashX ?? 1) - a.squashX) * Math.min(1, dt * 12)
    a.squashY += ((deform?.squashY ?? 1) - a.squashY) * Math.min(1, dt * 12)

    if (body.current) {
      const hopEase = a.hop * a.hop
      body.current.scale.set(
        a.squashX * (1 - breath) * (1 + hopEase * 0.06),
        a.squashY * (1 + breath) * (1 + hopEase * 0.14),
        1 - breath,
      )
      // Bob: the engine's when it's driving, a gentle idle sway otherwise.
      const bob = deform ? deform.bob * 0.012 : Math.sin(a.t * 0.9) * 0.03
      body.current.position.y = bob + hopEase * 0.34
      body.current.rotation.z = Math.sin(a.t * 0.6) * 0.03 + a.shudder * Math.sin(a.t * 46) * 0.16
      body.current.rotation.x = tune.lean
    }

    if (root.current) {
      // Face the way it's travelling, eased so the turn reads as a bank.
      const targetY = (deform?.facing ?? 1) < 0 ? -0.42 : 0.42
      root.current.rotation.y += (targetY - root.current.rotation.y) * Math.min(1, dt * 4)
      root.current.position.x = a.shudder * Math.sin(a.t * 52) * 0.05
    }

    if (eyes.current) {
      const closed = Math.max(tune.eyeClose, blinking)
      eyes.current.scale.y = Math.max(0.06, 1 - closed)
      // Shut eyes sit slightly lower, the way a real lid does.
      eyes.current.position.y = 0.12 - closed * 0.03
    }

    if (bodyMat.current) {
      // Thinking glows faintly; error dims. Cheap emissive pulse, no extra lights.
      bodyMat.current.emissiveIntensity = state === 'thinking' ? 0.16 + Math.sin(a.t * 4.2) * 0.09 : 0
      bodyMat.current.opacity = state === 'error' ? 0.82 : 1
    }
  })

  return (
    <group ref={root}>
      <group ref={body}>
        <mesh geometry={BLOB_GEOMETRY}>
          <meshStandardMaterial
            ref={bodyMat}
            color={colors.body}
            emissive={colors.accent}
            emissiveIntensity={0}
            roughness={0.82}
            metalness={0.04}
            transparent
          />
        </mesh>

        <group ref={eyes} position={[0, 0.12, 0]}>
          {([-1, 1] as const).map((side) => (
            // z clears the body: `widen` pushes the surface out to ~1.13 at
            // this latitude, so anything at the unit sphere's radius would sit
            // buried inside the blob.
            <group key={side} position={[side * 0.33, 0, 1.0]}>
              <mesh geometry={EYE_GEOMETRY}>
                <meshStandardMaterial color={colors.eye} roughness={0.22} metalness={0} />
              </mesh>
              <mesh geometry={HIGHLIGHT_GEOMETRY} position={[0.06, 0.07, 0.13]}>
                <meshBasicMaterial color={colors.bodyLight} />
              </mesh>
            </group>
          ))}
        </group>
      </group>
    </group>
  )
}

/**
 * The character. Mounted by GolemFigure for both the floating mascot and the
 * static inline placements.
 */
export function GolemArt({ state, deformRef }: GolemArtProps) {
  const host = useRef<HTMLDivElement>(null)
  const colors = useGolemColors(host)

  // Stop rendering entirely while the tab is hidden — a drifting mascot has no
  // business burning GPU on a tab nobody is looking at.
  const [active, setActive] = useState(true)
  useEffect(() => {
    const sync = () => setActive(!document.hidden)
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  const [reducedMotion, setReducedMotion] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReducedMotion(media.matches)
    sync()
    media.addEventListener('change', sync)
    return () => media.removeEventListener('change', sync)
  }, [])

  const lights = useMemo(
    () => (
      <>
        <ambientLight intensity={1.15} />
        <directionalLight position={[2.5, 3.5, 4]} intensity={1.35} />
        {/* Rim from behind-left picks the silhouette off a dark background. */}
        <directionalLight position={[-3, 1.5, -2]} intensity={0.5} color={colors.accent} />
      </>
    ),
    [colors.accent],
  )

  return (
    <div ref={host} className="h-full w-full">
      <Canvas
        // Capped DPR: this is a small ornament, not a hero render.
        dpr={[1, 1.75]}
        frameloop={active && !reducedMotion ? 'always' : 'demand'}
        shadows={false}
        gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
        camera={{ position: [0, 0, 4.1], fov: 40 }}
        style={{ background: 'transparent' }}
      >
        {lights}
        <Blob state={state} deformRef={deformRef} colors={colors} />
      </Canvas>
    </div>
  )
}
