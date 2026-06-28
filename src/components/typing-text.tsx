'use client'

import { useEffect, useState, useMemo, useRef } from 'react'

interface TypingTextProps {
  text: string
  isStreaming: boolean
  speed?: number
}

export function TypingText({ text, isStreaming, speed = 40 }: TypingTextProps) {
  const [displayedWordCount, setDisplayedWordCount] = useState(0)
  const prevStreamingRef = useRef(isStreaming)

  const words = useMemo(() => text.split(/\s+/).filter(Boolean), [text])

  // Reset when streaming starts (new assistant message begins)
  useEffect(() => {
    if (isStreaming && !prevStreamingRef.current) {
      setDisplayedWordCount(0)
    }
    prevStreamingRef.current = isStreaming
  }, [isStreaming])

  // Animate words appearing one by one
  useEffect(() => {
    if (!isStreaming) {
      // Immediately reveal all text when streaming ends
      setDisplayedWordCount(words.length)
      return
    }

    const interval = setInterval(() => {
      setDisplayedWordCount((prev) => {
        if (prev < words.length) {
          return prev + 1
        }
        return prev
      })
    }, speed)

    return () => clearInterval(interval)
  }, [text, isStreaming, words.length, speed])

  if (words.length === 0) return null

  const displayedText = words.slice(0, displayedWordCount).join(' ')
  const isAnimating = isStreaming && displayedWordCount < words.length

  return (
    <span>
      {displayedText}
      {isAnimating && (
        <span className="inline-block w-[2px] h-[1em] bg-primary ml-0.5 animate-pulse align-text-bottom" />
      )}
    </span>
  )
}
