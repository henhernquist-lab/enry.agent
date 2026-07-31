'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { useAgentBusy } from '@/lib/agent-presence'
import { useGolemPulse } from '@/lib/golem-signals'
import { DEFAULT_GOLEM_STATE, type GolemState } from '@/lib/golem-mascot'

// How long the page has to sit untouched before Golem nods off.
const DOZE_AFTER_MS = 30_000

// Activity that counts as "the user is still here". pointermove is deliberately
// absent: a mouse crossing the window on its way somewhere else shouldn't wake
// him, and listening to it would fire thousands of times per minute.
const WAKE_EVENTS = ['pointerdown', 'keydown', 'wheel', 'scroll', 'touchstart'] as const

const GolemStateContext = createContext<GolemState>(DEFAULT_GOLEM_STATE)

export function GolemStateProvider({ children }: { children: React.ReactNode }) {
  const busy = useAgentBusy()
  const pulse = useGolemPulse()
  const [dozing, setDozing] = useState(false)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    const sleep = () => setDozing(true)
    const wake = () => {
      // Only pays a React render on the actual edge, not on every keystroke.
      setDozing((current) => (current ? false : current))
      clearTimeout(timer)
      timer = setTimeout(sleep, DOZE_AFTER_MS)
    }

    timer = setTimeout(sleep, DOZE_AFTER_MS)
    for (const event of WAKE_EVENTS) {
      window.addEventListener(event, wake, { passive: true })
    }
    // A tab returning to the foreground counts as being back at the desk.
    document.addEventListener('visibilitychange', wake)

    return () => {
      clearTimeout(timer)
      for (const event of WAKE_EVENTS) window.removeEventListener(event, wake)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [])

  // Precedence: a transient pulse outranks everything, then work in flight,
  // then the doze timer. Anything that isn't one of those is plain idle.
  const state: GolemState = pulse ?? (busy ? 'thinking' : dozing ? 'dozing' : 'idle')

  return <GolemStateContext.Provider value={state}>{children}</GolemStateContext.Provider>
}

export function useGolemState(): GolemState {
  return useContext(GolemStateContext)
}
