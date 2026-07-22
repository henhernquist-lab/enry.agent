'use client'

import dynamic from 'next/dynamic'
import { LoadingScreen } from './loading-screen'

/**
 * The Room — client-only lazy-loaded 3D headquarters.
 *
 * next/dynamic with ssr: false ensures:
 *   1. Three.js / WebGL never runs on the server
 *   2. Normal users don't pay the bundle cost until they navigate to /room
 *   3. The loading screen shows during chunk download + scene initialization
 *
 * This is the single entry point. The page at /room imports this component.
 */
const Scene = dynamic(
  () => import('./scene').then((mod) => mod.Scene),
  {
    ssr: false,
    loading: () => <LoadingScreen />,
  },
)

export interface RoomProps {
  /** Which surface opened The Room (drive | cruise | learn | chat). */
  from?: string
  /** Whether that surface had an active run when it opened The Room. */
  state?: 'working' | 'idle'
}

export function Room({ from, state }: RoomProps) {
  return <Scene from={from} state={state} />
}
