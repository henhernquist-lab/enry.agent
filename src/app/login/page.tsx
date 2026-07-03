'use client'

import { useEffect, useRef } from 'react'
import { signIn } from 'next-auth/react'
import { motion } from 'framer-motion'

const MATRIX_CHARS = 'ｦｧｨｩｪｫｬｭｮｯｱｲｳｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉ0123456789ABCDEF'

class MatrixRain {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private drops: number[] = []
  private animationId: number | null = null

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')!
  }

  resize() {
    this.canvas.width = window.innerWidth
    this.canvas.height = window.innerHeight
    const columns = Math.floor(this.canvas.width / 20)
    this.drops = Array(columns).fill(1)
  }

  draw() {
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.05)'
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height)

    this.ctx.fillStyle = '#003300'
    this.ctx.font = '14px monospace'

    for (let i = 0; i < this.drops.length; i++) {
      // Random chance to show a character
      if (Math.random() > 0.3) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        const x = i * 20
        const y = this.drops[i] * 20
        this.ctx.fillText(char, x, y)
      }

      if (this.drops[i] * 20 > this.canvas.height && Math.random() > 0.975) {
        this.drops[i] = 0
      }
      this.drops[i]++
    }

    // Highlight some drops with brighter green
    this.ctx.fillStyle = '#00ff41'
    this.ctx.font = '14px monospace'
    for (let i = 0; i < this.drops.length; i++) {
      if (Math.random() > 0.975) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        const x = i * 20
        const y = this.drops[i] * 20
        this.ctx.fillText(char, x, y)
      }
    }
  }

  start() {
    this.resize()
    const loop = () => {
      this.draw()
      this.animationId = requestAnimationFrame(loop)
    }
    loop()
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId)
      this.animationId = null
    }
  }
}

export default function LoginPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rain = new MatrixRain(canvas)
    rain.start()
    const handleResize = () => rain.resize()
    window.addEventListener('resize', handleResize)
    return () => {
      rain.stop()
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-[#080808]">
      {/* Matrix rain background */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 z-0 opacity-25"
      />

      {/* Vignette overlay */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          background: 'radial-gradient(ellipse at center, transparent 40%, rgba(8,8,8,0.8) 100%)',
        }}
      />

      {/* Scanlines */}
      <div className="pointer-events-none absolute inset-0 z-[1] opacity-[0.03]">
        <div
          className="h-full w-full"
          style={{
            background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)',
          }}
        />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Logo mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="flex flex-col items-center gap-6"
        >
          {/* Icon */}
          <motion.div
            className="flex h-20 w-20 items-center justify-center rounded-xl border border-primary/30 bg-surface-secondary"
            animate={{
              boxShadow: [
                '0 0 8px rgba(0,255,102,0.1)',
                '0 0 24px rgba(0,255,102,0.25)',
                '0 0 8px rgba(0,255,102,0.1)',
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-12 w-12" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" className="fill-primary/20 stroke-primary" />
              <path d="M2 17L12 22L22 17" className="stroke-primary" />
              <path d="M2 12L12 17L22 12" className="stroke-primary/60" />
            </svg>
          </motion.div>

          {/* Title */}
          <div className="text-center">
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="font-display text-4xl font-bold tracking-tight"
            >
              <span className="text-foreground">ENRY</span>
              <span className="text-primary">.</span>
              <span className="text-foreground">AGENT</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5, duration: 0.6 }}
              className="mt-2 font-mono text-sm text-muted-foreground tracking-wider"
            >
              personal AI superagent
            </motion.p>
          </div>
        </motion.div>

        {/* Google sign-in button */}
        <motion.button
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          whileHover={{
            borderColor: 'rgba(0,255,102,0.6)',
            boxShadow: '0 0 24px rgba(0,255,102,0.12)',
          }}
          whileTap={{ scale: 0.98 }}
          onClick={() => signIn('google', { callbackUrl: '/' })}
          className="group relative flex items-center gap-3 rounded-lg border border-primary/20 bg-surface-secondary px-8 py-3.5 font-mono text-sm text-foreground transition-all duration-300 hover:border-primary/40 hover:bg-surface-elevated"
        >
          {/* Google icon */}
          <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
              fill="#4285F4"
            />
            <path
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              fill="#34A853"
            />
            <path
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
              fill="#FBBC05"
            />
            <path
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
              fill="#EA4335"
            />
          </svg>
          <span>sign in with google</span>
          <motion.span
            className="font-mono text-primary opacity-0 transition-opacity group-hover:opacity-100"
            initial={{ x: -5 }}
            whileHover={{ x: 0 }}
          >
            →
          </motion.span>
        </motion.button>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="font-mono text-[10px] text-muted-foreground/50 tracking-widest uppercase"
        >
          secure • encrypted • autonomous
        </motion.p>
      </div>
    </div>
  )
}
