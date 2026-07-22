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
}

interface CameraRigProps {
  initialPosition: THREE.Vector3Tuple
  target: THREE.Vector3Tuple
}

/**
 * Camera rig with OrbitControls, smooth damping, and imperative focus/reset.
 * The parent component (SceneController) holds a ref to this and exposes
 * the reset/focus methods to the React UI overlay.
 */
export const CameraRig = forwardRef<CameraHandle, CameraRigProps>(
  function CameraRig({ initialPosition, target }, ref) {
    const controlsRef = useRef<OrbitControlsImpl>(null)
    const { camera } = useThree()

    // Lerp state for smooth camera transitions
    const lerpTarget = useRef<{
      active: boolean
      position: THREE.Vector3
      lookAt: THREE.Vector3
    } | null>(null)

    const reset = useCallback(() => {
      lerpTarget.current = {
        active: true,
        position: new THREE.Vector3(...CAMERA_DEFAULTS.position),
        lookAt: new THREE.Vector3(...CAMERA_DEFAULTS.target),
      }
    }, [])

    const focusOn = useCallback((target: FocusTarget) => {
      const targetPos = new THREE.Vector3(...target.position)
      // Position camera at an offset from the target
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

    useImperativeHandle(ref, () => ({ reset, focusOn }), [reset, focusOn])

    // Smooth lerp toward the target position when active
    useFrame(() => {
      if (!lerpTarget.current?.active) return
      const { position, lookAt } = lerpTarget.current
      camera.position.lerp(position, 0.06)
      if (controlsRef.current) {
        controlsRef.current.target.lerp(lookAt, 0.06)
        controlsRef.current.update()
      }
      // Stop lerping when close enough
      if (camera.position.distanceTo(position) < 0.05) {
        lerpTarget.current.active = false
      }
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
