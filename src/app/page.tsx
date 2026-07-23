import { Suspense } from 'react'
import { DashboardLayout } from '@/components/dashboard/dashboard-layout'
import { ApertureBriefingCard } from '@/components/dashboard/aperture-briefing-card'
import { ActivityStrip } from '@/components/dashboard/activity-strip'
import { ModelStatusCard } from '@/components/dashboard/model-status-card'
import { CruiseStatusCard } from '@/components/dashboard/cruise-status-card'
import { ModeLauncher } from '@/components/dashboard/mode-launcher'
import { MemoryFeedCard } from '@/components/dashboard/memory-feed-card'
import { RepoSummariesCard } from '@/components/dashboard/repo-summaries-card'
import { HeroSkeleton, CardSkeleton } from '@/components/dashboard/skeletons'

export default function DashboardPage() {
  return (
    <DashboardLayout>
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Hero row */}
        <section aria-label="Daily Briefing">
          <Suspense fallback={<HeroSkeleton />}>
            <ApertureBriefingCard />
          </Suspense>
        </section>

        {/* Live state row */}
        <section aria-label="Live state" className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Suspense fallback={<CardSkeleton />}>
            <ActivityStrip />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <ModelStatusCard />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <CruiseStatusCard />
          </Suspense>
        </section>

        {/* Mode launcher row */}
        <section aria-label="Mode launcher">
          <ModeLauncher />
        </section>

        {/* Knowledge / Dev row */}
        <section aria-label="Knowledge and development" className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Suspense fallback={<CardSkeleton />}>
            <MemoryFeedCard />
          </Suspense>
          <Suspense fallback={<CardSkeleton />}>
            <RepoSummariesCard />
          </Suspense>
        </section>
      </div>
    </DashboardLayout>
  )
}
