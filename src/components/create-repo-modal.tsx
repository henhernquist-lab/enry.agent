'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Loader2, CheckCircle2, AlertCircle, ExternalLink, Globe, Lock } from 'lucide-react'

interface CreateRepoModalProps {
  open: boolean
  onClose: () => void
}

export function CreateRepoModal({ open, onClose }: CreateRepoModalProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<{ url: string; name: string } | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(null)
    setLoading(true)

    try {
      const res = await fetch('/api/github/create-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim(), private: isPrivate }),
      })
      const data = await res.json()
      if (res.ok) {
        setSuccess({ url: data.url, name: data.name })
        setName('')
        setDescription('')
        setIsPrivate(false)
      } else {
        setError(data.error ?? 'Failed to create repository.')
      }
    } catch {
      setError('Network error while creating repository.')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (!loading) {
      setError(null)
      setSuccess(null)
      onClose()
    }
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-[#3a342e] bg-[#201b18] shadow-2xl shadow-[#b8935a]/5"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-[#3a342e] px-5 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-[#b8935a]/30 bg-[#b8935a]/10">
                  <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#b8935a]" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                  </svg>
                </div>
                <div>
                  <h2 className="font-mono text-sm font-semibold text-[#e8dccc]">New Repository</h2>
                  <p className="font-mono text-[10px] text-[#8a8076]">Create a new GitHub repo</p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={loading}
                className="rounded p-1 text-[#8a8076] transition-colors hover:text-[#e8dccc] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Success state */}
            {success ? (
              <div className="px-5 py-6">
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#b8935a]/10">
                    <CheckCircle2 className="h-6 w-6 text-[#b8935a]" />
                  </div>
                  <p className="font-mono text-sm font-medium text-[#e8dccc]">Repository created</p>
                  <p className="font-mono text-xs text-[#8a8076]">{success.name}</p>
                  <a
                    href={success.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 flex items-center gap-1.5 rounded-lg border border-[#b8935a]/30 bg-[#b8935a]/10 px-4 py-2 font-mono text-xs text-[#b8935a] transition-colors hover:bg-[#b8935a]/20"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open on GitHub
                  </a>
                  <button
                    onClick={() => setSuccess(null)}
                    className="mt-1 font-mono text-[11px] text-[#8a8076] underline transition-colors hover:text-[#e8dccc]"
                  >
                    Create another
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="px-5 py-4">
                <div className="flex flex-col gap-3">
                  {/* Repo name */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#8a8076]">
                      Repository name
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="my-awesome-project"
                      required
                      className="w-full rounded-lg border border-[#3a342e] bg-[#161210] px-3 py-2 font-mono text-sm text-[#e8dccc] placeholder:text-[#8a8076]/50 focus:border-[#b8935a]/50 focus:outline-none"
                      autoFocus
                    />
                  </div>

                  {/* Description */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#8a8076]">
                      Description <span className="text-[#8a8076]/50">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="A brief description of your project"
                      className="w-full rounded-lg border border-[#3a342e] bg-[#161210] px-3 py-2 font-mono text-sm text-[#e8dccc] placeholder:text-[#8a8076]/50 focus:border-[#b8935a]/50 focus:outline-none"
                    />
                  </div>

                  {/* Public/Private toggle */}
                  <div>
                    <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-wider text-[#8a8076]">
                      Visibility
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setIsPrivate(false)}
                        className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs transition-colors ${
                          !isPrivate
                            ? 'border-[#b8935a]/40 bg-[#b8935a]/10 text-[#b8935a]'
                            : 'border-[#3a342e] text-[#8a8076] hover:text-[#e8dccc]'
                        }`}
                      >
                        <Globe className="h-3.5 w-3.5" />
                        Public
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsPrivate(true)}
                        className={`flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 font-mono text-xs transition-colors ${
                          isPrivate
                            ? 'border-[#b8935a]/40 bg-[#b8935a]/10 text-[#b8935a]'
                            : 'border-[#3a342e] text-[#8a8076] hover:text-[#e8dccc]'
                        }`}
                      >
                        <Lock className="h-3.5 w-3.5" />
                        Private
                      </button>
                    </div>
                  </div>

                  {/* Error */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-center gap-2 rounded-lg border border-[#a85c3f]/30 bg-[#a85c3f]/10 px-3 py-2"
                      >
                        <AlertCircle className="h-3.5 w-3.5 flex-shrink-0 text-[#a85c3f]" />
                        <span className="font-mono text-[11px] text-[#a85c3f]">{error}</span>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading || !name.trim()}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-[#b8935a]/30 bg-[#b8935a]/10 px-4 py-2.5 font-mono text-sm text-[#b8935a] transition-all hover:border-[#b8935a]/60 hover:bg-[#b8935a]/20 disabled:opacity-50"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Creating…
                      </>
                    ) : (                          <>
                            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-[#b8935a]" xmlns="http://www.w3.org/2000/svg">
                              <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.385-1.335-1.755-1.335-1.755-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
                            </svg>
                            Create repository
                          </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
