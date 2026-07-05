'use client'

import type { ReactNode } from 'react'

export interface ToolPanelProps {
  title: string
  subtitle?: string
  icon?: ReactNode
  onClose: () => void
  width?: string
  children: ReactNode
}

export function ToolPanel({ title, subtitle, icon, children }: ToolPanelProps) {
  return (
    <div className="flex flex-col rounded border border-border bg-surface-secondary">
      <div className="flex items-center gap-2.5 border-b border-border p-4">
        {icon !== undefined && (
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-primary/30 bg-primary/10">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
