export function SkeletonBox({ className = '' }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-md bg-surface-elevated ${className}`}
      aria-hidden="true"
    />
  )
}

export function HeroSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-secondary p-5">
      <SkeletonBox className="mb-3 h-5 w-32" />
      <SkeletonBox className="mb-2 h-8 w-full max-w-2xl" />
      <SkeletonBox className="h-4 w-full max-w-xl" />
    </div>
  )
}

export function CardSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border/60 bg-surface-secondary p-5">
      <SkeletonBox className="mb-3 h-5 w-32" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <SkeletonBox key={i} className="h-4 w-full" />
        ))}
      </div>
    </div>
  )
}
