'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  GOLEM_VISIBILITY_EVENT,
  GOLEM_VISIBILITY_STORAGE_KEY,
  loadGolemVisible,
  type GolemState,
} from '@/lib/golem-mascot'
import {
  fireGolemQuickAction,
  hasQuickActionListener,
  useGolemModel,
  useGolemSeekTarget,
} from '@/lib/golem-signals'
import { randomSuggestionCard } from '@/lib/suggestion-cards'
import { GolemFigure } from './golem-figure'
import { GolemMotion } from './golem-motion'
import { useGolemState } from './golem-state-context'
import { useGolemDroop } from './use-golem-droop'

const SIZE = 72
const MARGIN = 20

// A press that stays under this distance and duration is a click, not a drag.
const CLICK_SLOP_PX = 6
const CLICK_MAX_MS = 500

// Droop slows him to a third; dozing is a gentle idle-down.
const SPEED_SCALE = { normal: 1, dozing: 0.55, droop: 0.32 }

interface GolemMascotProps {
  /** Overrides the ambient mood from GolemStateProvider. */
  state?: GolemState
  size?: number
}

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight }
}

// Where Golem parks when motion is unwelcome: bottom-left, clear of the
// grimoire FAB and the command-palette hint that live bottom-right.
function restingSpot(size: number) {
  return { x: MARGIN, y: Math.max(MARGIN, window.innerHeight - size - MARGIN) }
}

/**
 * Golem, the house mascot — mounted once in the root layout, drifts across the
 * viewport above page content, reacts to what the app is doing, and can be
 * grabbed, thrown, or clicked for a quick action.
 *
 * Frame writes go straight to `style.transform` from a single rAF; React
 * renders only when visibility, reduced-motion, mood, model or droop change.
 */
export function GolemMascot({ state, size = SIZE }: GolemMascotProps) {
  const ambientState = useGolemState()
  const modelId = useGolemModel()
  const seekTarget = useGolemSeekTarget()
  // null until the client has read the preference — keeps SSR output empty and
  // the hydration pass honest. Everything below resolves eagerly instead, so
  // by the time `visible` flips true the first paint is already correct.
  const [visible, setVisible] = useState<boolean | null>(null)
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  const [motion] = useState<GolemMotion | null>(() => {
    if (typeof window === 'undefined') return null
    const engine = new GolemMotion({ size, margin: MARGIN, bounds: viewport() })
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      engine.setMode({ kind: 'anchor', ...restingSpot(size) })
    }
    return engine
  })

  const effectiveState = state ?? ambientState
  const droop = useGolemDroop(visible === true)

  const positionRef = useRef<HTMLDivElement>(null)
  const bobRef = useRef<HTMLDivElement>(null)
  // Drag bookkeeping, kept in a ref so pointermove never triggers a render.
  const dragRef = useRef({
    active: false,
    pointerId: -1,
    grabX: 0,
    grabY: 0,
    startedAt: 0,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    lastAt: 0,
    vx: 0,
    vy: 0,
    moved: 0,
  })

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisible(loadGolemVisible())

    const onPreference = () => setVisible(loadGolemVisible())
    const onStorage = (e: StorageEvent) => {
      if (e.key === GOLEM_VISIBILITY_STORAGE_KEY) setVisible(loadGolemVisible())
    }
    window.addEventListener(GOLEM_VISIBILITY_EVENT, onPreference)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(GOLEM_VISIBILITY_EVENT, onPreference)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // Speed follows mood and usage without restarting the loop.
  useEffect(() => {
    if (!motion) return
    motion.setSpeedScale(
      droop ? SPEED_SCALE.droop : effectiveState === 'dozing' ? SPEED_SCALE.dozing : SPEED_SCALE.normal,
    )
  }, [motion, droop, effectiveState])

  // Seek while the user types, free drift once the target expires. A drag in
  // progress outranks both — the hand wins.
  useEffect(() => {
    if (!motion || reducedMotion || !visible) return
    if (dragRef.current.active) return
    if (seekTarget) {
      motion.setMode({ kind: 'seek', x: seekTarget.x - size / 2, y: seekTarget.y - size / 2 })
    } else if (motion.getMode().kind === 'seek') {
      motion.setMode({ kind: 'drift' })
    }
  }, [motion, seekTarget, reducedMotion, visible, size])

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!motion || e.button !== 0) return
      const frame = motion.current()
      const drag = dragRef.current
      drag.active = true
      drag.pointerId = e.pointerId
      drag.grabX = e.clientX - frame.x
      drag.grabY = e.clientY - frame.y
      drag.startedAt = performance.now()
      drag.startX = e.clientX
      drag.startY = e.clientY
      drag.lastX = e.clientX
      drag.lastY = e.clientY
      drag.lastAt = drag.startedAt
      drag.vx = 0
      drag.vy = 0
      drag.moved = 0
      motion.setMode({ kind: 'drag' })
      e.currentTarget.setPointerCapture(e.pointerId)
    },
    [motion],
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!motion || !drag.active || e.pointerId !== drag.pointerId) return
      const now = performance.now()
      const dt = Math.max(1, now - drag.lastAt)
      // Velocity from the most recent segment only — a throw should reflect
      // the last flick of the wrist, not the whole journey.
      drag.vx = ((e.clientX - drag.lastX) / dt) * 1000
      drag.vy = ((e.clientY - drag.lastY) / dt) * 1000
      drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY))
      drag.lastX = e.clientX
      drag.lastY = e.clientY
      drag.lastAt = now
      motion.dragTo(e.clientX - drag.grabX, e.clientY - drag.grabY)
    },
    [motion],
  )

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current
      if (!motion || !drag.active || e.pointerId !== drag.pointerId) return
      drag.active = false
      e.currentTarget.releasePointerCapture?.(e.pointerId)

      const heldFor = performance.now() - drag.startedAt
      const wasClick = drag.moved < CLICK_SLOP_PX && heldFor < CLICK_MAX_MS

      if (reducedMotion) {
        motion.setMode({ kind: 'anchor', ...motion.current() })
      } else {
        // Resume drift from wherever he was let go, carrying the throw.
        motion.release(drag.vx, drag.vy)
      }

      if (wasClick && hasQuickActionListener()) {
        fireGolemQuickAction(randomSuggestionCard())
      }
    },
    [motion, reducedMotion],
  )

  useEffect(() => {
    if (!visible || !motion) return
    const position = positionRef.current
    const bob = bobRef.current
    if (!position || !bob) return

    const paint = () => {
      const frame = motion.current()
      position.style.transform = `translate3d(${frame.x}px, ${frame.y}px, 0)`
      bob.style.transform = `translateY(${frame.bob}px) scale(${frame.facing * frame.squashX}, ${frame.squashY})`
    }

    if (reducedMotion) {
      const park = () => {
        // A reduced-motion user who dragged him somewhere keeps that spot.
        if (motion.getMode().kind !== 'anchor') motion.setMode({ kind: 'anchor', ...restingSpot(size) })
        paint()
      }
      park()
      const onResizeParked = () => {
        motion.resize(viewport())
        paint()
      }
      window.addEventListener('resize', onResizeParked)
      // Still needs a frame pump while dragging, or the mascot wouldn't follow
      // the pointer at all in reduced-motion mode.
      let dragFrame = 0
      const pumpDrag = () => {
        if (dragRef.current.active) paint()
        dragFrame = requestAnimationFrame(pumpDrag)
      }
      dragFrame = requestAnimationFrame(pumpDrag)
      return () => {
        cancelAnimationFrame(dragFrame)
        window.removeEventListener('resize', onResizeParked)
      }
    }

    if (motion.getMode().kind === 'anchor') motion.setMode({ kind: 'drift' })
    motion.resize(viewport())

    let frameId = 0
    let last = performance.now()

    const tick = (now: number) => {
      motion.step(now - last)
      last = now
      paint()
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)

    const onResize = () => motion.resize(viewport())
    // Coming back from a background tab, the first delta covers the whole time
    // away; reset the clock so the step clamp isn't doing all the work.
    const onVisibilityChange = () => {
      if (!document.hidden) last = performance.now()
    }
    window.addEventListener('resize', onResize)
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [visible, reducedMotion, size, motion])

  if (!visible || !motion) return null

  // The engine already knows where Golem starts, so the very first paint lands
  // in place — no flash through the top-left corner.
  const initial = motion.current()

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[45] overflow-hidden">
      <div
        ref={positionRef}
        className="absolute left-0 top-0 will-change-transform"
        style={{ width: size, height: size, transform: `translate3d(${initial.x}px, ${initial.y}px, 0)` }}
      >
        {/* Only the mascot takes pointer events — the layer above never does,
            so nothing here can swallow a click meant for real UI. While
            seeking he's hovering next to the composer the user is actively
            typing in, so he goes click-through for the duration: a mascot
            that eats a click on the input he just flew to would be a bug. */}
        <div
          ref={bobRef}
          className={`h-full w-full origin-bottom touch-none select-none will-change-transform ${
            seekTarget ? 'pointer-events-none' : 'pointer-events-auto cursor-grab active:cursor-grabbing'
          }`}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <GolemFigure state={effectiveState} droop={droop} modelId={modelId} className="h-full w-full" />
        </div>
      </div>
    </div>
  )
}
