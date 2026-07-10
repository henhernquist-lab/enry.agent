'use client'

import { useEffect, useRef, useState } from 'react'
import { signIn } from 'next-auth/react'
import { motion, AnimatePresence } from 'framer-motion'

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
      if (Math.random() > 0.3) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        this.ctx.fillText(char, i * 20, this.drops[i] * 20)
      }
      if (this.drops[i] * 20 > this.canvas.height && Math.random() > 0.975) {
        this.drops[i] = 0
      }
      this.drops[i]++
    }

    this.ctx.fillStyle = '#00ff41'
    this.ctx.font = '14px monospace'
    for (let i = 0; i < this.drops.length; i++) {
      if (Math.random() > 0.975) {
        const char = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]
        this.ctx.fillText(char, i * 20, this.drops[i] * 20)
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

type AuthTab = 'google' | 'github' | 'email'
type FormMode = 'signin' | 'signup'

const ERROR_MESSAGES: Record<string, string> = {
  EMAIL_TAKEN:        'An account with that email already exists.',
  USE_GOOGLE:         'That email is linked to Google. Use "Sign in with Google" instead.',
  PASSWORD_TOO_SHORT: 'Password must be at least 8 characters.',
  INVALID_INPUT:      'Please enter a valid email and password.',
  SERVER_ERROR:       'Something went wrong. Try again.',
  CREDENTIALS:        'Invalid email or password.',
}

export default function LoginPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const [tab,      setTab]      = useState<AuthTab>('google')
  const [mode,     setMode]     = useState<FormMode>('signin')
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [confirm,  setConfirm]  = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

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

  const switchTab = (t: AuthTab) => { setTab(t); setError(null) }
  const switchMode = (m: FormMode) => { setMode(m); setError(null); setConfirm('') }

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (mode === 'signup') {
      if (password !== confirm) { setError('Passwords do not match.'); return }
      if (password.length < 8)  { setError(ERROR_MESSAGES.PASSWORD_TOO_SHORT); return }

      setLoading(true)
      try {
        const res  = await fetch('/api/auth/signup', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ email, password }),
        })
        const json = await res.json()
        if (!res.ok) { setError(ERROR_MESSAGES[json.error] ?? ERROR_MESSAGES.SERVER_ERROR); return }

        // Account created — sign in immediately
        const result = await signIn('credentials', { email, password, redirect: false, callbackUrl: '/' })
        if (result?.ok) window.location.href = '/'
        else setError(ERROR_MESSAGES.CREDENTIALS)
      } finally {
        setLoading(false)
      }
    } else {
      setLoading(true)
      try {
        const result = await signIn('credentials', { email, password, redirect: false, callbackUrl: '/' })
        if (result?.ok) window.location.href = '/'
        else setError(ERROR_MESSAGES.CREDENTIALS)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="relative flex h-screen w-full flex-col items-center justify-center overflow-hidden bg-transparent">
      <canvas ref={canvasRef} className="absolute inset-0 z-0 opacity-25" />

      {/* Vignette */}
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{ background: 'radial-gradient(ellipse at center, transparent 40%, rgba(8,8,8,0.8) 100%)' }}
      />

      {/* Scanlines */}
      <div className="pointer-events-none absolute inset-0 z-[1] opacity-[0.03]">
        <div className="h-full w-full" style={{ background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.15) 2px, rgba(0,0,0,0.15) 4px)' }} />
      </div>

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center gap-8">
        {/* Logo */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: [0, 0, 0.2, 1] }}
          className="flex flex-col items-center gap-6"
        >
          <motion.div
            className="flex h-20 w-20 items-center justify-center rounded-xl border border-primary/30 bg-surface-secondary"
            animate={{ boxShadow: ['0 0 8px rgba(0,255,102,0.1)', '0 0 24px rgba(0,255,102,0.25)', '0 0 8px rgba(0,255,102,0.1)'] }}
            transition={{ duration: 3, repeat: Infinity, ease: [0.4, 0, 0.6, 1] }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="h-12 w-12" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" className="fill-primary/20 stroke-primary" />
              <path d="M2 17L12 22L22 17" className="stroke-primary" />
              <path d="M2 12L12 17L22 12" className="stroke-primary/60" />
            </svg>
          </motion.div>

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

        {/* Auth card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7, duration: 0.5 }}
          className="w-80 rounded-xl border border-border bg-surface-secondary shadow-2xl"
        >
          {/* Tab switcher */}
          <div className="flex border-b border-border">
            {(['google', 'github', 'email'] as const).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 py-3 font-mono text-xs capitalize transition-colors ${
                  tab === t
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="p-5">
            <AnimatePresence mode="wait">
              {tab === 'google' ? (
                <motion.div
                  key="google"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <button
                    onClick={() => signIn('google', { callbackUrl: '/' })}
                    className="group flex w-full items-center justify-center gap-3 rounded-lg border border-primary/20 bg-surface-elevated px-6 py-3 font-mono text-sm text-foreground transition-all duration-200 hover:border-primary/50 hover:bg-surface-elevated/80"
                  >
                    <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
                      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                    </svg>
                    sign in with google
                  </button>
                </motion.div>
              ) : tab === 'github' ? (
                <motion.div
                  key="github"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                >
                  <button
                    onClick={() => signIn('github', { callbackUrl: '/' })}
                    className="group flex w-full items-center justify-center gap-3 rounded-lg border border-primary/20 bg-surface-elevated px-6 py-3 font-mono text-sm text-foreground transition-all duration-200 hover:border-primary/50 hover:bg-surface-elevated/80"
                  >
                    {/* GitHub mark */}
                    <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                    </svg>
                    sign in with github
                  </button>
                  <p className="mt-3 text-center font-mono text-[11px] text-muted-foreground">
                    Enables GitHub tools in chat — list repos, read files, open issues.
                  </p>
                </motion.div>
              ) : (
                <motion.form
                  key="email"
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.18 }}
                  onSubmit={handleEmailSubmit}
                  className="flex flex-col gap-3"
                >
                  {/* Sign in / Sign up toggle */}
                  <div className="flex gap-1 rounded-lg border border-border bg-surface-base p-1">
                    {(['signin', 'signup'] as const).map((m) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => switchMode(m)}
                        className={`flex-1 rounded py-1.5 font-mono text-[11px] transition-all ${
                          mode === m
                            ? 'bg-primary/15 text-primary'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {m === 'signin' ? 'sign in' : 'sign up'}
                      </button>
                    ))}
                  </div>

                  <input
                    type="email"
                    placeholder="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full rounded border border-border bg-surface-base px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                  />
                  <input
                    type="password"
                    placeholder="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="w-full rounded border border-border bg-surface-base px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                  />

                  <AnimatePresence>
                    {mode === 'signup' && (
                      <motion.input
                        key="confirm"
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        type="password"
                        placeholder="confirm password"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        required
                        className="w-full rounded border border-border bg-surface-base px-3 py-2.5 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 focus:border-primary/50 focus:outline-none"
                      />
                    )}
                  </AnimatePresence>

                  <AnimatePresence>
                    {error && (
                      <motion.p
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="font-mono text-[11px] text-red-400"
                      >
                        {error}
                      </motion.p>
                    )}
                  </AnimatePresence>

                  <button
                    type="submit"
                    disabled={loading}
                    className="mt-1 flex items-center justify-center rounded border border-primary/30 bg-primary/10 py-2.5 font-mono text-sm text-primary transition-all hover:border-primary/60 hover:bg-primary/20 disabled:opacity-50"
                  >
                    {loading ? (
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : mode === 'signin' ? 'sign in' : 'create account'}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

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
