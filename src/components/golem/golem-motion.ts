// Motion engine for the mascot — deliberately framework-free.
//
// No React, no DOM: it owns position/velocity and hands back a frame. The
// component drives it from one rAF and writes the result straight to
// `style.transform`, so a drifting Golem costs zero React renders.
//
// Pass two swaps behaviours by adding modes here (float toward the active
// input, land after a drag-release) — the render layer never changes.

export interface GolemBounds {
  width: number
  height: number
}

export type GolemMotionMode =
  | { kind: 'drift' }
  // Parked at an exact spot — prefers-reduced-motion.
  | { kind: 'anchor'; x: number; y: number }
  // Steering toward a point, easing to a hover as it arrives. Used while the
  // user is typing so Golem drifts over to the active input.
  | { kind: 'seek'; x: number; y: number }
  // Position is being written from outside (a pointer drag); integration is
  // suspended so the engine can't fight the hand holding it.
  | { kind: 'drag' }

export interface GolemFrame {
  x: number
  y: number
  facing: 1 | -1
  bob: number
  squashX: number
  squashY: number
}

interface GolemMotionOptions {
  size: number
  margin: number
  bounds: GolemBounds
  /** px per second */
  speed?: number
}

const DEFAULT_SPEED = 26
// A tab that was backgrounded returns with a huge gap; integrating it would
// teleport Golem through a wall.
const MAX_STEP_MS = 50

// Seek tuning: hurries compared to a drift, banks rather than pivots, and
// settles into a hover short of the target instead of sitting on top of it.
const SEEK_SPEED_BOOST = 6
const SEEK_TURN_RATE = 2.6 // radians/sec
const SEEK_HOVER_PX = 90
const SEEK_EASE_PX = 160

export class GolemMotion {
  private size: number
  private margin: number
  private bounds: GolemBounds
  private speed: number
  private speedScale = 1
  private mode: GolemMotionMode = { kind: 'drift' }

  private x: number
  private y: number
  private heading: number
  private bobPhase = Math.random() * Math.PI * 2
  private wanderPhase = Math.random() * Math.PI * 2
  private elapsed = 0

  // Bounce recoil: 1 right after an edge hit, decaying back to 0. Sign of
  // `squashAxis` picks which way the clay deforms.
  private impulse = 0
  private impulseAxis: 'x' | 'y' = 'y'

  constructor({ size, margin, bounds, speed = DEFAULT_SPEED }: GolemMotionOptions) {
    this.size = size
    this.margin = margin
    this.bounds = bounds
    this.speed = speed

    const spanX = Math.max(0, bounds.width - size - margin * 2)
    const spanY = Math.max(0, bounds.height - size - margin * 2)
    this.x = margin + Math.random() * spanX
    this.y = margin + Math.random() * spanY
    // Off-axis so the first leg is a diagonal, never a boring straight slide.
    this.heading = Math.PI * (0.25 + Math.random() * 1.5)
  }

  resize(bounds: GolemBounds): void {
    this.bounds = bounds
    this.clamp()
  }

  setMode(mode: GolemMotionMode): void {
    this.mode = mode
    if (mode.kind === 'anchor') {
      this.x = mode.x
      this.y = mode.y
      this.impulse = 0
    }
  }

  getMode(): GolemMotionMode {
    return this.mode
  }

  /**
   * Global speed multiplier. The droop (usage past its warning threshold) uses
   * it to make Golem visibly sluggish without a second motion path.
   */
  setSpeedScale(scale: number): void {
    this.speedScale = Math.max(0.05, scale)
  }

  /** Drag: place Golem exactly where the pointer is, clamped to the viewport. */
  dragTo(x: number, y: number): void {
    this.x = x
    this.y = y
    this.clamp()
  }

  /**
   * Release a drag back into free drift. The throw velocity becomes the new
   * heading, so it keeps going the way it was thrown instead of snapping onto
   * whatever direction it happened to be travelling before the drag started.
   * A near-zero throw keeps the previous heading rather than jerking to 0°.
   */
  release(vx: number, vy: number): void {
    if (Math.hypot(vx, vy) > 12) this.heading = Math.atan2(vy, vx)
    this.impulse = 0
    this.mode = { kind: 'drift' }
  }

  current(): GolemFrame {
    return this.frame()
  }

  step(dtMs: number): GolemFrame {
    const dt = Math.min(Math.max(dtMs, 0), MAX_STEP_MS) / 1000
    this.elapsed += dt

    if (this.mode.kind === 'drift') {
      // Slow sinusoidal steering keeps the path organic instead of billiard-
      // ball straight; it never accumulates, so speed stays constant.
      this.wanderPhase += dt * 0.37
      this.heading += Math.sin(this.wanderPhase) * 0.22 * dt

      const speed = this.speed * this.speedScale
      this.x += Math.cos(this.heading) * speed * dt
      this.y += Math.sin(this.heading) * speed * dt
      this.bounce()
    } else if (this.mode.kind === 'seek') {
      this.steerToward(this.mode.x, this.mode.y, dt)
      this.bounce()
    }

    // Dozing and drooping breathe slower; thinking-era states keep the
    // baseline. Speed scale drives it so there's a single knob.
    this.bobPhase += dt * 1.5 * Math.min(1, this.speedScale)
    this.impulse = Math.max(0, this.impulse - dt * 3.2)

    return this.frame()
  }

  private frame(): GolemFrame {
    const eased = this.impulse * this.impulse
    const deform = eased * 0.14
    const horizontal = this.impulseAxis === 'x'
    return {
      x: this.x,
      y: this.y,
      facing: Math.cos(this.heading) < 0 ? -1 : 1,
      // Parked means parked: reduced-motion users get a perfectly still Golem.
      bob: this.mode.kind === 'anchor' ? 0 : Math.sin(this.bobPhase) * 2.4,
      squashX: horizontal ? 1 - deform : 1 + deform,
      squashY: horizontal ? 1 + deform : 1 - deform,
    }
  }

  /**
   * Turn toward a target at a bounded rate and ease off as it arrives, so the
   * approach reads as "wandering over" rather than a cursor snap. Inside
   * SEEK_HOVER_PX it idles in place instead of jittering on top of the target.
   */
  private steerToward(tx: number, ty: number, dt: number): void {
    const dx = tx - this.x
    const dy = ty - this.y
    const distance = Math.hypot(dx, dy)
    if (distance < 1) return

    const desired = Math.atan2(dy, dx)
    // Shortest angular path, capped so it banks instead of pivoting.
    let delta = desired - this.heading
    while (delta > Math.PI) delta -= Math.PI * 2
    while (delta < -Math.PI) delta += Math.PI * 2
    this.heading += Math.max(-SEEK_TURN_RATE * dt, Math.min(SEEK_TURN_RATE * dt, delta))

    const approach = Math.min(1, Math.max(0, (distance - SEEK_HOVER_PX) / SEEK_EASE_PX))
    const speed = this.speed * this.speedScale * SEEK_SPEED_BOOST * approach
    this.x += Math.cos(this.heading) * speed * dt
    this.y += Math.sin(this.heading) * speed * dt
  }

  private bounce(): void {
    const maxX = this.bounds.width - this.size - this.margin
    const maxY = this.bounds.height - this.size - this.margin

    let hit: 'x' | 'y' | null = null

    if (this.x < this.margin) {
      this.x = this.margin
      this.heading = Math.PI - this.heading
      hit = 'x'
    } else if (this.x > maxX) {
      this.x = maxX
      this.heading = Math.PI - this.heading
      hit = 'x'
    }

    if (this.y < this.margin) {
      this.y = this.margin
      this.heading = -this.heading
      hit = 'y'
    } else if (this.y > maxY) {
      this.y = maxY
      this.heading = -this.heading
      hit = 'y'
    }

    if (hit) {
      // Scatter the reflection slightly, otherwise Golem settles into a
      // repeating loop across the viewport within a minute or two.
      this.heading += (Math.random() - 0.5) * 0.4
      this.impulse = 1
      this.impulseAxis = hit
    }
  }

  private clamp(): void {
    const maxX = Math.max(this.margin, this.bounds.width - this.size - this.margin)
    const maxY = Math.max(this.margin, this.bounds.height - this.size - this.margin)
    this.x = Math.min(Math.max(this.x, this.margin), maxX)
    this.y = Math.min(Math.max(this.y, this.margin), maxY)
  }
}
