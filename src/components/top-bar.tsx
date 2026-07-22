'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Search, Globe, Moon, Activity, Settings, ChevronRight } from 'lucide-react'

interface Crumb {
  label: string
  href?: string
}

const CRUMBS: Record<string, Crumb[]> = {
  '/': [{ label: 'Home', href: '/' }],
  '/agent': [{ label: 'Workspace', href: '/' }, { label: 'Drive' }],
  '/learn': [{ label: 'Workspace', href: '/' }, { label: 'Learn' }],
  '/lab': [{ label: 'Workspace', href: '/' }, { label: 'Lab' }],
  '/resources': [{ label: 'Library', href: '/' }, { label: 'Tools' }],
  '/prompts': [{ label: 'Library', href: '/' }, { label: 'Prompts' }],
  '/resources/memory': [{ label: 'Library', href: '/' }, { label: 'Memory' }],
  '/room': [{ label: 'Library', href: '/' }, { label: 'The Room' }],
  '/models': [{ label: 'Platform', href: '/' }, { label: 'Model Intelligence' }],
  '/usage': [{ label: 'Platform', href: '/' }, { label: 'Usage' }],
  '/settings': [{ label: 'System', href: '/' }, { label: 'Settings' }],
}

const DESCRIPTIONS: Record<string, string> = {
  '/': 'Dashboard overview',
  '/agent': 'Autonomous coding agent',
  '/learn': 'Tutorials and skills',
  '/lab': 'Experiments and overnight runs',
  '/resources': 'Built-in tools and resources',
  '/prompts': 'Saved prompts and recipes',
  '/resources/memory': 'Saved facts and context',
  '/room': '3D headquarters view',
  '/models': 'Benchmark and monitor models',
  '/usage': 'Track tokens, cost, and alerts',
  '/settings': 'Manage your account and integrations',
}

export function TopBar() {
  const pathname = usePathname()
  const crumbs = CRUMBS[pathname] ?? [{ label: 'Home', href: '/' }]
  const description = DESCRIPTIONS[pathname] ?? 'Enry dashboard'

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-surface-secondary/80 px-4 backdrop-blur">
      {/* Left: breadcrumb + description */}
      <div className="flex flex-col justify-center">
        <nav className="flex items-center gap-1 text-xs text-muted-foreground">
          {crumbs.map((crumb, idx) => (
            <span key={crumb.label} className="flex items-center gap-1">
              {idx > 0 && <ChevronRight className="h-3 w-3 text-border" />}
              {crumb.href ? (
                <Link href={crumb.href} className="hover:text-foreground transition-colors">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-foreground font-medium">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
        <p className="text-[11px] text-muted-foreground/70">{description}</p>
      </div>

      {/* Right: utility icons */}
      <div className="flex items-center gap-1">
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground" aria-label="Search">
          <Search className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground" aria-label="Language">
          <Globe className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground" aria-label="Theme">
          <Moon className="h-4 w-4" />
        </button>
        <button className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground" aria-label="Status">
          <Activity className="h-4 w-4" />
        </button>
        <Link
          href="/settings"
          className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-surface-elevated hover:text-foreground"
          aria-label="Settings"
        >
          <Settings className="h-4 w-4" />
        </Link>
      </div>
    </header>
  )
}
