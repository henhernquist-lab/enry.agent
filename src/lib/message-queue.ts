'use client'

import { useState, useCallback } from 'react'

/**
 * Generic message queue hook — pure state management, no side effects.
 * Callers wire auto-flush themselves via useEffect watching their
 * own isRunning/isStreaming signal.
 *
 * @example
 * // Chat: queue send payloads while streaming
 * const { queue, enqueue, dequeue, remove } = useMessageQueue<ChatQueueItem>()
 * if (isStreaming) { enqueue({ text, files, body }); return }
 * // …normal send…
 *
 * // Drive: queue raw input strings while running
 * const { queue, enqueue, dequeue, remove } = useMessageQueue<string>()
 * if (running) { enqueue(text); return }
 * // …normal send…
 */
export function useMessageQueue<T = string>() {
  const [queue, setQueue] = useState<T[]>([])

  const enqueue = useCallback((item: T) => setQueue((q) => [...q, item]), [])

  const dequeue = useCallback((): T | undefined => {
    let next: T | undefined
    setQueue((q) => {
      ;[next] = q
      return q.slice(1)
    })
    return next
  }, [])

  const remove = useCallback((index: number) => {
    setQueue((q) => q.filter((_, i) => i !== index))
  }, [])

  const clear = useCallback(() => setQueue([]), [])

  return { queue, enqueue, dequeue, remove, clear }
}
