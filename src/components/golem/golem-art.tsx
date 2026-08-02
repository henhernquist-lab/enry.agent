'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { GolemState } from '@/lib/golem-mascot'
import { useGolemColors, type GolemColors } from './golem-colors'

// Golem, in 3D.
//
// A toad — the alchemist's familiar. The silhouette is a sphere pushed around
// at build time rather than a sculpted model: it keeps the body to one
// low-poly geometry with no asset to load, and the limbs and eye domes are
// scaled instances of two more shared spheres.
//
// The species reads at 40px because of where the mass sits, not because of
// detail: squat and widest below the middle, with two eye domes riding on top
// of the skull that break the upper silhouette. Ears and tails vanish at that
// size; a toad's profile doesn't.
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

// Body proportions, named because the feature placement below solves against
// them. Retuning the shape moves the eyes and markings with it.
const SQUASH = 0.78 // vertical scale — lower is squatter
const WIDEN = 0.26 // how much the mid-body bulges out
const X_SCALE = 1.04 // broader across than deep
const Z_SCALE = 0.92
const FLATTEN_AT = -0.5 // below this the underside flattens onto its base

/** How far out the bulge pushes at a given normalised height (0 base, 1 top). */
function widenAt(t: number): number {
  // The exponent drags the widest point down to ~40% of the height. That low
  // centre of mass is most of what separates "toad" from "ball with eyes".
  return 1 + WIDEN * Math.sin(Math.PI * Math.pow(t, 0.8))
}

function buildBodyGeometry(): THREE.BufferGeometry {
  const geo = new THREE.SphereGeometry(1, 32, 24)
  const pos = geo.attributes.position

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const z = pos.getZ(i)

    const widen = widenAt((y + 1) / 2)

    // Squat, and flat-bottomed so he reads as planted rather than balanced.
    let ny = y * SQUASH
    if (ny < FLATTEN_AT) ny = FLATTEN_AT + (ny - FLATTEN_AT) * 0.35

    pos.setXYZ(i, x * widen * X_SCALE, ny, z * widen * Z_SCALE)
  }

  pos.needsUpdate = true
  geo.computeVertexNormals()
  return geo
}

/**
 * Front-facing z of the body surface at a given (x, y) in final coordinates.
 *
 * Placing eyes and markings by eye-balled constants is how the first pass put
 * the mouth and both spots *inside* the body — the bulge pushes the surface
 * much further forward than a unit sphere suggests. Solving the deformation
 * backwards instead keeps every feature glued on, and keeps them there if the
 * proportions above are ever retuned.
 *
 * `sink` < 1 embeds the feature into the surface rather than floating it.
 */
function surfaceZ(x: number, y: number, sink = 1): number {
  const yOrig = y / SQUASH
  const widen = widenAt((yOrig + 1) / 2)
  const xOrig = x / (widen * X_SCALE)
  const remainder = 1 - xOrig * xOrig - yOrig * yOrig
  if (remainder <= 0) return 0
  return Math.sqrt(remainder) * widen * Z_SCALE * sink
}

// Feature anchors, solved once against the geometry above.
const EYE_Y = 0.6
const EYE_X = 0.34
const EYE_Z = /* @__PURE__ */ surfaceZ(EYE_X, EYE_Y, 0.8)
const SPOT_X = 0.62
const SPOT_Y = 0.3
const SPOT_Z = /* @__PURE__ */ surfaceZ(SPOT_X, SPOT_Y, 0.97)
const MOUTH_Y = 0.02
const MOUTH_Z = /* @__PURE__ */ surfaceZ(0, MOUTH_Y, 0.98)

const BODY_GEOMETRY = /* @__PURE__ */ buildBodyGeometry()
// One unit sphere for every appendage; each instance scales it. Cheaper than
// five bespoke geometries and they all deform the same way.
const BLOB_GEOMETRY = /* @__PURE__ */ new THREE.SphereGeometry(1, 16, 12)
const EYE_GEOMETRY = /* @__PURE__ */ new THREE.SphereGeometry(0.3, 16, 12)
const PUPIL_GEOMETRY = /* @__PURE__ */ new THREE.SphereGeometry(0.145, 12, 8)
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

// Retuned for the toad: leans that read as "alert" on a featureless blob read
// as a faceplant on something with a head on top, so every angle is gentler
// than the blob's was.
const TUNING: Record<GolemState, StateTuning> = {
  idle: { breathRate: 0.55, breathDepth: 0.045, eyeClose: 0, lean: 0, blinks: true },
  dozing: { breathRate: 0.28, breathDepth: 0.07, eyeClose: 0.85, lean: 0.07, blinks: false },
  thinking: { breathRate: 1.15, breathDepth: 0.03, eyeClose: 0.12, lean: -0.1, blinks: true },
  success: { breathRate: 0.8, breathDepth: 0.05, eyeClose: 0, lean: -0.03, blinks: true },
  error: { breathRate: 0.5, breathDepth: 0.035, eyeClose: 0.5, lean: 0.11, blinks: true },
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
      // A closing toad's eyes sink back into the skull rather than just
      // shrinking, so drop the domes as they shut.
      eyes.current.position.y = EYE_Y - closed * 0.14
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
        <mesh geometry={BODY_GEOMETRY}>
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

        {/* Hind haunches: the bulges that sell "about to hop". Set back and
            low, half-sunk into the flank so they read as part of him. */}
        {([-1, 1] as const).map((side) => (
          <mesh
            key={`haunch${side}`}
            geometry={BLOB_GEOMETRY}
            position={[side * 0.66, -0.22, -0.18]}
            scale={[0.34, 0.3, 0.38]}
          >
            <meshStandardMaterial color={colors.bodyShade} roughness={0.85} metalness={0.03} />
          </mesh>
        ))}

        {/* Forelimbs: two stubs planted out front. Not articulated — at this
            size an articulated limb is three pixels of noise. */}
        {([-1, 1] as const).map((side) => (
          <mesh
            key={`foreleg${side}`}
            geometry={BLOB_GEOMETRY}
            position={[side * 0.42, -0.5, 0.66]}
            scale={[0.15, 0.13, 0.26]}
          >
            <meshStandardMaterial color={colors.bodyShade} roughness={0.85} metalness={0.03} />
          </mesh>
        ))}

        {/* Dorsal spots, on the flanks where the three-quarter view can see
            them. These are the surface the thinking-state glow pulses on. */}
        {([-1, 1] as const).map((side) => (
          <mesh
            key={`spot${side}`}
            geometry={BLOB_GEOMETRY}
            position={[side * SPOT_X, SPOT_Y, SPOT_Z]}
            scale={[0.085, 0.065, 0.085]}
          >
            <meshStandardMaterial color={colors.accent} roughness={0.6} metalness={0.05} />
          </mesh>
        ))}

        {/* Mouth: one wide shallow line across the front. A toad is mostly
            mouth, and it costs a single scaled sphere. */}
        <mesh geometry={BLOB_GEOMETRY} position={[0, MOUTH_Y, MOUTH_Z]} scale={[0.46, 0.04, 0.1]}>
          <meshStandardMaterial color={colors.bodyShade} roughness={0.7} metalness={0} />
        </mesh>

        {/* Eye domes ride on top of the skull and break the upper silhouette —
            the single most important cue that this is a toad and not a ball.
            The group sits at eye height so a blink can scale it in place. */}
        <group ref={eyes} position={[0, EYE_Y, 0]}>
          {([-1, 1] as const).map((side) => (
            <group key={side} position={[side * EYE_X, 0, EYE_Z]}>
              <mesh geometry={EYE_GEOMETRY}>
                <meshStandardMaterial color={colors.bodyLight} roughness={0.35} metalness={0} />
              </mesh>
              <mesh geometry={PUPIL_GEOMETRY} position={[side * 0.05, 0.02, 0.21]}>
                <meshStandardMaterial color={colors.eye} roughness={0.18} metalness={0} />
              </mesh>
              <mesh geometry={HIGHLIGHT_GEOMETRY} position={[side * 0.11, 0.12, 0.27]}>
                <meshBasicMaterial color="#ffffff" />
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
        camera={{ position: [0, 0, 5.4], fov: 40 }}
        style={{ background: 'transparent' }}
      >
        {lights}
        <Blob state={state} deformRef={deformRef} colors={colors} />
      </Canvas>
    </div>
  )
}
