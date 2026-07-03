'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'

export function GridBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0">
      <div className="absolute inset-0 grid-overlay opacity-40" />
      <div className="absolute inset-0 scanlines" />
      <div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 0%, rgba(8,8,8,0.4) 100%)',
        }}
      />
      <DataTraces />
    </div>
  )
}

function DataTraces() {
  const [traces] = useState(() =>
    Array.from({ length: 8 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      delay: Math.random() * 5,
      duration: 4 + Math.random() * 2,
    })),
  )

  return (
    <div className="absolute inset-0 overflow-hidden opacity-20">
      {traces.map((trace) => (
        <motion.div
          key={trace.id}
          className="absolute h-32 w-px bg-gradient-to-b from-transparent via-primary to-transparent"
          style={{ left: `${trace.x}%` }}
          initial={{ y: '-100%', opacity: 0 }}
          animate={{
            y: ['0%', '200%'],
            opacity: [0, 0.5, 0],
          }}
          transition={{
            duration: trace.duration,
            repeat: Infinity,
            delay: trace.delay,
            ease: 'linear',
          }}
        />
      ))}
    </div>
  )
}

export function CornerAccents() {
  return (
    <>
      <div className="pointer-events-none fixed left-0 top-0 z-50">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M0 0 L40 0 L40 2 L2 2 L2 40 L0 40 Z" fill="#262626" />
          <path d="M0 0 L12 0 L12 1 L1 1 L1 12 L0 12 Z" className="fill-primary/50" />
        </svg>
      </div>
      <div className="pointer-events-none fixed right-0 top-0 z-50">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M40 0 L0 0 L0 2 L38 2 L38 40 L40 40 Z" fill="#262626" />
          <path d="M40 0 L28 0 L28 1 L39 1 L39 12 L40 12 Z" className="fill-primary/50" />
        </svg>
      </div>
      <div className="pointer-events-none fixed bottom-0 left-0 z-50">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M0 40 L40 40 L40 38 L2 38 L2 0 L0 0 Z" fill="#262626" />
          <path d="M0 40 L12 40 L12 39 L1 39 L1 28 L0 28 Z" className="fill-primary/50" />
        </svg>
      </div>
      <div className="pointer-events-none fixed bottom-0 right-0 z-50">
        <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
          <path d="M40 40 L0 40 L0 38 L38 38 L38 0 L40 0 Z" fill="#262626" />
          <path d="M40 40 L28 40 L28 39 L39 39 L39 28 L40 28 Z" className="fill-primary/50" />
        </svg>
      </div>
    </>
  )
}
