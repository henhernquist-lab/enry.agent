// Minimal global store for "is enry busy right now" — no state library
// exists anywhere in this app yet, so this uses React's built-in
// useSyncExternalStore rather than pulling in Zustand for a single boolean.
// Any part of the app can call setAgentBusy(true/false); any part can read
// it via useAgentBusy().

import { useSyncExternalStore } from 'react'

type Listener = () => void

let busyCount = 0
const listeners = new Set<Listener>()

function emit() {
  for (const l of listeners) l()
}

export function setAgentBusy(busy: boolean) {
  busyCount = Math.max(0, busyCount + (busy ? 1 : -1))
  emit()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): boolean {
  return busyCount > 0
}

function getServerSnapshot(): boolean {
  return false
}

export function useAgentBusy(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
