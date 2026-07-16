import type { CruiseScan, CruiseFinding, CruiseScanfixCategory, CruiseScanfixMode } from './types'
import { SCANFIX_LABEL, SCANFIX_CATEGORIES } from './types'

export interface ScanSummary {
  /** ISO timestamp when the summary was generated */
  generatedAt: string
  /** Categories and their modes for this scan */
  categories: Record<CruiseScanfixCategory, CruiseScanfixMode>
  /** Total findings count */
  totalFindings: number
  /** Findings grouped by category */
  byCategory: Record<string, CategorySummary>
  /** Summary of what was fixed (populated by goal-run if applicable) */
  fixed?: FixSummary
  /** Build status of any resulting PR */
  buildStatus?: 'passed' | 'failed' | 'draft' | 'pending' | null
  /** PR URL if one was opened */
  prUrl?: string | null
}

export interface CategorySummary {
  label: string
  mode: CruiseScanfixMode
  count: number
  /** One-line description of the most notable findings in this category */
  notable: string[]
  /** File paths touched by this category */
  files: string[]
}

export interface FixSummary {
  /** Files that were changed */
  files: { path: string; description: string }[]
  /** Whether the fix landed successfully */
  status: 'applied' | 'partial' | 'failed'
  /** Reason for revert or failure, if applicable */
  detail?: string
}

function oneLineNotable(findings: CruiseFinding[]): string[] {
  const lines: string[] = []
  const fileCount = new Set(findings.map((f) => f.file_path).filter(Boolean)).size

  if (findings.length === 0) return lines

  // Build a short, human-readable description
  const byTitle = new Map<string, number>()
  for (const f of findings) {
    // Normalize titles to group similar findings
    const key = f.title.replace(/: .*$/, '').trim()
    byTitle.set(key, (byTitle.get(key) ?? 0) + 1)
  }

  // Sort by frequency, most common first
  const sorted = [...byTitle.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)
  for (const [key, count] of sorted) {
    if (count === 1) lines.push(key)
    else lines.push(`${count}× ${key}`)
  }

  if (fileCount > 0) {
    lines.push(`across ${fileCount} file${fileCount === 1 ? '' : 's'}`)
  }

  return lines
}

/** Generate a human-readable scan summary from the scan and its findings. */
export function generateScanSummary(
  scan: CruiseScan,
  findings: CruiseFinding[],
  categories: Record<CruiseScanfixCategory, CruiseScanfixMode>,
): ScanSummary {
  const byCategory: Record<string, CategorySummary> = {}

  // Group open findings by category
  const openFindings = findings.filter((f) => f.status === 'open')
  const resolvedFindings = findings.filter((f) => f.status !== 'open')

  for (const cat of SCANFIX_CATEGORIES) {
    const catFindings = openFindings.filter((f) => f.category === cat)
    byCategory[cat] = {
      label: SCANFIX_LABEL[cat],
      mode: categories[cat] ?? 'off',
      count: catFindings.length,
      notable: oneLineNotable(catFindings),
      files: [...new Set(catFindings.map((f) => f.file_path).filter((p): p is string => p !== null))].slice(0, 10),
    }
  }

  // Uncategorized findings
  const uncategorized = openFindings.filter((f) => !f.category)
  if (uncategorized.length > 0) {
    byCategory['other'] = {
      label: 'Type / other',
      mode: 'report_only',
      count: uncategorized.length,
      notable: oneLineNotable(uncategorized),
      files: [...new Set(uncategorized.map((f) => f.file_path).filter((p): p is string => p !== null))].slice(0, 10),
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    categories,
    totalFindings: openFindings.length,
    byCategory,
    buildStatus: null,
    prUrl: null,
  }
}

/** Render a ScanSummary to a human-readable text block. */
export function renderSummaryText(summary: ScanSummary): string {
  const lines: string[] = []
  const spacer = ''

  // Header
  lines.push('## Scan Summary')
  lines.push(spacer)

  // What was scanned
  const fixCats = SCANFIX_CATEGORIES.filter((c) => summary.categories[c] !== 'off')
  const fixModeCats = fixCats.filter((c) => summary.categories[c] === 'auto_fix')
  const reportCats = fixCats.filter((c) => summary.categories[c] === 'report_only')

  lines.push('### Scanned')
  if (fixModeCats.length > 0) {
    lines.push(`Auto-fix: ${fixModeCats.map((c) => SCANFIX_LABEL[c]).join(', ')}`)
  }
  if (reportCats.length > 0) {
    lines.push(`Report-only: ${reportCats.map((c) => SCANFIX_LABEL[c]).join(', ')}`)
  }
  lines.push(spacer)

  // What was found
  if (summary.totalFindings === 0) {
    lines.push('### Results')
    lines.push('No findings. Clean scan.')
    lines.push(spacer)
  } else {
    lines.push('### Found')
    lines.push(`${summary.totalFindings} finding${summary.totalFindings === 1 ? '' : 's'} across ${Object.keys(summary.byCategory).length} categories.`)
    lines.push(spacer)

    const categoryOrder = [...SCANFIX_CATEGORIES, 'other' as const]
    for (const cat of categoryOrder) {
      const s = summary.byCategory[cat]
      if (!s || s.count === 0) continue
      const modeTag = s.mode === 'auto_fix' ? '[Fix]' : '[Report]'
      lines.push(`**${s.label}** ${modeTag} — ${s.count} finding${s.count === 1 ? '' : 's'}`)
      for (const note of s.notable) {
        lines.push(`  • ${note}`)
      }
      lines.push(spacer)
    }
  }

  // What was fixed
  if (summary.fixed) {
    lines.push('### Fixed')
    lines.push(`Status: ${summary.fixed.status}`)
    for (const file of summary.fixed.files) {
      lines.push(`  • ${file.path} — ${file.description}`)
    }
    if (summary.fixed.detail) {
      lines.push(spacer)
      lines.push(summary.fixed.detail)
    }
    lines.push(spacer)
  }

  // What's still open
  const openByCategory = Object.entries(summary.byCategory)
    .filter(([_, s]) => s.mode === 'report_only' && s.count > 0)
  if (openByCategory.length > 0) {
    lines.push('### Still Open')
    lines.push('Report-only findings (not auto-fixed):')
    for (const [_, s] of openByCategory) {
      lines.push(`  • ${s.label} — ${s.count} remaining`)
    }
    lines.push(spacer)
  }

  // Build status
  if (summary.buildStatus) {
    const icon = summary.buildStatus === 'passed' ? '✅' : summary.buildStatus === 'failed' ? '❌' : '⏳'
    lines.push(`### Build: ${icon} ${summary.buildStatus}`)
    if (summary.prUrl) {
      lines.push(`PR: ${summary.prUrl}`)
    }
    lines.push(spacer)
  }

  return lines.join('\n')
}
