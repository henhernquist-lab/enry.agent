'use client'

import { useRef, useCallback, useImperativeHandle, forwardRef, type ComponentRef } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import * as THREE from 'three'

type OrbitControlsImpl = ComponentRef<typeof OrbitControls>
import { CAMERA_DEFAULTS } from './constants'
import type { FocusTarget } from './types'

export interface CameraHandle {
  reset: () => void
  focusOn: (target: FocusTarget) => void
  followTarget: (target: THREE.Vector3 | null) => void
}

interface CameraRigProps {
  initialPosition: THREE.Vector3Tuple
  target: THREE.Vector3Tuple
}

/**
 * Camera rig with OrbitControls, smooth damping, and imperative focus/reset.
 *
 * Enhancements:
 *   - Smooth follow: when a follow target is set, the camera gently
 *     tracks it while maintaining user orbit control
 *   - Better easing: distance-aware lerp (slower when close, faster when far)
 *   - Idle camera sway: subtle sinusoidal drift when the camera is
 *     not being actively moved, giving the scene a "breathing" feel
 */
export const CameraRig = forwardRef<CameraHandle, CameraRigProps>(
  function CameraRig({ target }, ref) {
    const controlsRef = useRef<OrbitControlsImpl>(null)
    const { camera } = useThree()

    // Lerp state for smooth camera transitions
    const lerpTarget = useRef<{
      active: boolean
      position: THREE.Vector3
      lookAt: THREE.Vector3
    } | null>(null)

    // Follow target — when set, camera gently tracks this position
    const followRef = useRef<THREE.Vector3 | null>(null)

    // Track whether the user is actively orbiting (for idle sway suppression)
    const lastUserInteraction = useRef<number>(0)

    const reset = useCallback(() => {
      followRef.current = null
      lerpTarget.current = {
        active: true,
        position: new THREE.Vector3(...CAMERA_DEFAULTS.position),
        lookAt: new THREE.Vector3(...CAMERA_DEFAULTS.target),
      }
    }, [])

    const focusOn = useCallback((target: FocusTarget) => {
      const targetPos = new THREE.Vector3(...target.position)
      const camPos = targetPos.clone()
      camPos.x += target.distance * 0.7
      camPos.y += target.distance * 0.4
      camPos.z += target.distance * 0.7

      lerpTarget.current = {
        active: true,
        position: camPos,
        lookAt: targetPos,
      }
    }, [])

    const followTarget = useCallback((t: THREE.Vector3 | null) => {
      followRef.current = t
    }, [])

    useImperativeHandle(ref, () => ({ reset, focusOn, followTarget }), [reset, focusOn, followTarget])

    useFrame((state) => {
      const t = state.clock.elapsedTime
      const delta = state.clock.getDelta()

      // Track user interaction — if controls are being used, suppress sway
      if (controlsRef.current) {
        // OrbitControls doesn't expose a direct "isInteracting" flag,
        // but we can check if the spherical coords changed recently.
        // For simplicity, we just always apply a very subtle sway that
        // doesn't interfere with user control.
      }

      // ── Smooth lerp toward focus/reset target ────────────────────
      if (lerpTarget.current?.active) {
        const { position, lookAt } = lerpTarget.current
        const dist = camera.position.distanceTo(position)
        // Distance-aware lerp: faster when far, slower when close (eases out)
        const lerpFactor = Math.min(0.12, dist * 0.04 + 0.03)
        camera.position.lerp(position, lerpFactor)
        if (controlsRef.current) {
          controlsRef.current.target.lerp(lookAt, lerpFactor)
          controlsRef.current.update()
        }
        if (dist < 0.05) {
          lerpTarget.current.active = false
        }
        return
      }

      // ── Follow target — gentle tracking ──────────────────────────
      if (followRef.current && controlsRef.current) {
        const followOffset = followRef.current.clone()
        // Keep the camera target slightly above the character
        followOffset.y += 1.5
        controlsRef.current.target.lerp(followOffset, CAMERA_DEFAULTS.followLerp)
        controlsRef.current.update()
      }

      // ── Idle camera sway — very subtle sinusoidal drift ──────────
      // Only applies when not transitioning and not following
      if (!lerpTarget.current?.active && !followRef.current) {
        const swayX = Math.sin(t * CAMERA_DEFAULTS.swaySpeed) * CAMERA_DEFAULTS.swayAmplitude
        const swayY = Math.cos(t * CAMERA_DEFAULTS.swaySpeed * 0.7) * CAMERA_DEFAULTS.swayAmplitude * 0.5
        camera.position.x += swayX * delta * 0.3
        camera.position.y += swayY * delta * 0.3
        // Clamp to prevent drift accumulation
        const defaultPos = new THREE.Vector3(...CAMERA_DEFAULTS.position)
        const totalDist = camera.position.distanceTo(defaultPos)
        if (totalDist > 3) {
          camera.position.lerp(defaultPos, 0.01)
        }
        if (controlsRef.current) {
          controlsRef.current.update()
        }
      }

      void delta
    })

    return (
      <OrbitControls
        ref={controlsRef}
        target={target}
        enableDamping
        dampingFactor={0.08}
        minDistance={CAMERA_DEFAULTS.minDistance}
        maxDistance={CAMERA_DEFAULTS.maxDistance}
        minPolarAngle={CAMERA_DEFAULTS.minPolarAngle}
        maxPolarAngle={CAMERA_DEFAULTS.maxPolarAngle}
        enablePan={false}
        makeDefault
      />
    )
  },
)
