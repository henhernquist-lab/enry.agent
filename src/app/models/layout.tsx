import Link from 'next/link'
import { ArrowLeft, Cpu } from 'lucide-react'
import { ModelTabNav } from '@/components/models/tab-nav'

export const metadata = {
  title: 'Model Intelligence — ENRY.AGENT',
  description: 'Benchmark scores and real-time health for all AI models',
}

export default function ModelsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col bg-transparent">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 grid-overlay opacity-30" />
        <div
          className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse at center, transparent 0%, rgba(8,8,8,0.6) 100%)' }}
        />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-6xl px-6 py-12">
        {/* Back link */}
        <Link
          href="/"
          className="mb-8 inline-flex items-center gap-2 font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          back to enry
        </Link>

        {/* Page header */}
        <div className="mb-8 flex items-center gap-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-primary/30 bg-primary/10">
            <Cpu className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold leading-tight text-foreground">Model Intelligence</h1>
            <p className="font-mono text-xs text-muted-foreground">Benchmark scores & real-time health for every model in Enry Engine</p>
          </div>
        </div>

        {/* Tab navigation (client — uses usePathname for active state) */}
        <ModelTabNav />

        {children}
      </div>
    </div>
  )
}
