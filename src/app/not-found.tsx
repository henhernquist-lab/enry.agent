import Link from 'next/link'
import { GolemInline } from '@/components/golem/golem-inline'

export default function NotFound() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-transparent px-6">
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 grid-overlay opacity-20" />
      </div>

      <div className="relative z-10 flex flex-col items-center text-center">
        <GolemInline state="error" size={132} bob={false} />

        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.3em] text-muted-foreground">
          404
        </p>
        <h1 className="mt-2 font-display text-3xl font-bold text-foreground">
          This one crumbled
        </h1>
        <p className="mt-3 max-w-sm font-mono text-[12px] leading-relaxed text-muted-foreground">
          There&rsquo;s nothing at this address. Golem took it badly.
        </p>

        <Link
          href="/"
          className="mt-8 rounded border border-primary/40 bg-primary/10 px-4 py-2 font-mono text-[12px] text-primary transition-colors hover:bg-primary/20"
        >
          back to golem
        </Link>
      </div>
    </div>
  )
}
