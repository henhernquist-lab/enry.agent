'use client'

import { useState, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Zap,
  Plus,
  ToggleLeft,
  ToggleRight,
  Clock,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Loader2,
  Trash2,
  X,
  Activity,
} from 'lucide-react'
import type { Automation, AutomationRun } from '@/lib/automations'
import {
  loadAutomations,
  saveAutomation,
  deleteAutomation,
  toggleAutomation,
  newAutomationId,
  AUTOMATION_SCHEDULES,
} from '@/lib/automations'

interface AutomationsSectionProps {
  onAutomationsChange?: () => void
}

export function AutomationsSection({ onAutomationsChange }: AutomationsSectionProps) {
  const [automations, setAutomations] = useState<Automation[]>(() => loadAutomations())
  const [expanded, setExpanded] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setAutomations(loadAutomations())
    onAutomationsChange?.()
  }, [onAutomationsChange])

  const handleToggle = (id: string) => {
    toggleAutomation(id)
    refresh()
  }

  const handleDelete = (id: string) => {
    deleteAutomation(id)
    if (selectedId === id) setSelectedId(null)
    refresh()
  }

  const enabledCount = automations.filter((a) => a.enabled).length
  const selectedAutomation = automations.find((a) => a.id === selectedId)

  return (
    <>
      {/* Section Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="mb-2 flex w-full items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Zap className="h-3.5 w-3.5 text-primary" />
          <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Automations
          </h3>
          {enabledCount > 0 && (
            <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-mono font-medium text-primary">
              {enabledCount} active
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-3 w-3 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            {/* Create Button */}
            <button
              onClick={() => setShowCreate(true)}
              className="mb-2 flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-border px-2 py-1.5 text-[10px] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary"
            >
              <Plus className="h-3 w-3" />
              New Automation
            </button>

            {/* Automation List */}
            {automations.length === 0 ? (
              <p className="mb-2 text-center text-[10px] text-muted-foreground/60">
                No automations yet
              </p>
            ) : (
              <div className="space-y-1">
                {automations.map((automation) => (
                  <AutomationItem
                    key={automation.id}
                    automation={automation}
                    isSelected={selectedId === automation.id}
                    onToggle={() => handleToggle(automation.id)}
                    onSelect={() => setSelectedId(selectedId === automation.id ? null : automation.id)}
                    onDelete={() => handleDelete(automation.id)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Modal */}
      <AnimatePresence>
        {showCreate && (
          <CreateAutomationModal
            onClose={() => setShowCreate(false)}
            onCreate={(auto) => {
              saveAutomation(auto)
              refresh()
              setShowCreate(false)
            }}
          />
        )}
      </AnimatePresence>

      {/* Detail / Logs Modal */}
      <AnimatePresence>
        {selectedAutomation && (
          <AutomationDetailModal
            automation={selectedAutomation}
            onClose={() => setSelectedId(null)}
            onToggle={() => handleToggle(selectedAutomation.id)}
            onDelete={() => handleDelete(selectedAutomation.id)}
          />
        )}
      </AnimatePresence>
    </>
  )
}

// ─── Automation List Item ────────────────────────────────────────

function AutomationItem({
  automation,
  isSelected,
  onToggle,
  onSelect,
  onDelete,
}: {
  automation: Automation
  isSelected: boolean
  onToggle: () => void
  onSelect: () => void
  onDelete: () => void
}) {
  const lastRun = automation.lastRunAt
    ? formatRelativeTime(automation.lastRunAt)
    : 'Never'

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -8 }}
      className={`group rounded px-2 py-1.5 cursor-pointer transition-colors ${
        isSelected ? 'bg-surface-elevated' : 'hover:bg-surface-elevated/60'
      }`}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2">
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggle()
          }}
          className="flex-shrink-0"
          title={automation.enabled ? 'Disable' : 'Enable'}
        >
          {automation.enabled ? (
            <ToggleRight className="h-4 w-4 text-primary" />
          ) : (
            <ToggleLeft className="h-4 w-4 text-muted-foreground/50" />
          )}
        </button>
        <div className="min-w-0 flex-1">
          <p
            className={`truncate text-[11px] font-medium ${
              automation.enabled ? 'text-foreground' : 'text-muted-foreground'
            }`}
          >
            {automation.name}
          </p>
          <div className="flex items-center gap-1.5">
            <Clock className="h-2.5 w-2.5 text-muted-foreground/50" />
            <span className="text-[9px] text-muted-foreground/60">
              {formatSchedule(automation.scheduleMs)} · {lastRun}
            </span>
          </div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="rounded p-0.5 opacity-0 transition-opacity hover:bg-surface-secondary group-hover:opacity-100"
        >
          <Trash2 className="h-3 w-3 text-muted-foreground/50" />
        </button>
      </div>
    </motion.div>
  )
}

// ─── Create Automation Modal ─────────────────────────────────────

function CreateAutomationModal({
  onClose,
  onCreate,
}: {
  onClose: () => void
  onCreate: (automation: Automation) => void
}) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [action, setAction] = useState('')
  const [scheduleMs, setScheduleMs] = useState(60_000)
  const [scheduleOpen, setScheduleOpen] = useState(false)

  const handleCreate = () => {
    if (!name.trim()) return
    onCreate({
      id: newAutomationId(),
      name: name.trim(),
      description: description.trim() || 'No description',
      action: action.trim() || 'General automation',
      scheduleMs,
      enabled: true,
      createdAt: Date.now(),
      lastRunAt: null,
      runs: [],
    })
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative w-[420px] rounded border border-border bg-surface-secondary p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded p-1 text-muted-foreground hover:bg-surface-elevated"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-4 flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">New Automation</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monitor news feeds"
              className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Description
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What does this automation do?"
              className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div>
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Action
            </label>
            <input
              type="text"
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. Search web for latest headlines"
              className="w-full rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          <div className="relative">
            <label className="mb-1 block font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Schedule
            </label>
            <button
              type="button"
              onClick={() => setScheduleOpen(!scheduleOpen)}
              className="flex w-full items-center justify-between rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground transition-colors hover:border-primary/30 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            >
              <span>{AUTOMATION_SCHEDULES.find((s) => s.ms === scheduleMs)?.label}</span>
              <ChevronDown
                className={`h-3 w-3 text-muted-foreground transition-transform ${
                  scheduleOpen ? 'rotate-180' : ''
                }`}
              />
            </button>
            {scheduleOpen && (
              <div className="absolute z-10 mt-1 w-full rounded border border-border bg-surface-secondary shadow-xl">
                {AUTOMATION_SCHEDULES.map((s) => (
                  <button
                    key={s.ms}
                    onClick={() => {
                      setScheduleMs(s.ms)
                      setScheduleOpen(false)
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors hover:bg-surface-elevated ${
                      scheduleMs === s.ms ? 'text-primary' : 'text-muted-foreground'
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        scheduleMs === s.ms ? 'bg-primary' : 'bg-border'
                      }`}
                    />
                    {s.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-surface-elevated"
          >
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!name.trim()}
            className="rounded border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Create
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Automation Detail / Logs Modal ──────────────────────────────

function AutomationDetailModal({
  automation,
  onClose,
  onToggle,
  onDelete,
}: {
  automation: Automation
  onClose: () => void
  onToggle: () => void
  onDelete: () => void
}) {
  const runs = [...automation.runs].reverse() // newest first

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="relative flex max-h-[80vh] w-[480px] flex-col rounded border border-border bg-surface-secondary shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-sm font-semibold text-foreground">
              {automation.name}
            </h3>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {automation.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="ml-3 rounded p-1 text-muted-foreground hover:bg-surface-elevated"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Details */}
        <div className="border-b border-border p-4">
          <div className="grid grid-cols-2 gap-3">
            <DetailRow label="Schedule" value={formatSchedule(automation.scheduleMs)} />
            <DetailRow
              label="Status"
              value={automation.enabled ? 'Enabled' : 'Disabled'}
              valueClass={automation.enabled ? 'text-primary' : 'text-muted-foreground'}
            />
            <DetailRow label="Action" value={automation.action} />
            <DetailRow
              label="Created"
              value={new Date(automation.createdAt).toLocaleDateString()}
            />
            <DetailRow
              label="Last Run"
              value={
                automation.lastRunAt
                  ? formatRelativeTime(automation.lastRunAt)
                  : 'Never'
              }
            />
            <DetailRow
              label="Total Runs"
              value={automation.runs.length.toString()}
            />
          </div>

          <div className="mt-3 flex gap-2">
            <button
              onClick={onToggle}
              className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-xs font-medium transition-colors ${
                automation.enabled
                  ? 'border-primary/30 bg-primary/10 text-primary hover:bg-primary/20'
                  : 'border-border bg-surface-elevated text-muted-foreground hover:border-primary/30 hover:text-primary'
              }`}
            >
              {automation.enabled ? (
                <>
                  <ToggleRight className="h-3.5 w-3.5" />
                  Disable
                </>
              ) : (
                <>
                  <ToggleLeft className="h-3.5 w-3.5" />
                  Enable
                </>
              )}
            </button>
            <button
              onClick={() => {
                onDelete()
                onClose()
              }}
              className="flex items-center gap-1.5 rounded border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </button>
          </div>
        </div>

        {/* Run Log */}
        <div className="flex-1 overflow-y-auto p-4 scrollbar-hidden">
          <div className="mb-2 flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-accent" />
            <h4 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
              Recent Runs
            </h4>
          </div>

          {runs.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground/60">
              No runs yet. Enable the automation to start.
            </p>
          ) : (
            <div className="space-y-1.5">
              {runs.map((run) => (
                <RunLogItem key={run.id} run={run} />
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────

function DetailRow({
  label,
  value,
  valueClass,
}: {
  label: string
  value: string
  valueClass?: string
}) {
  return (
    <div>
      <p className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground/60">
        {label}
      </p>
      <p className={`text-xs ${valueClass ?? 'text-foreground'}`}>{value}</p>
    </div>
  )
}

function RunLogItem({ run }: { run: AutomationRun }) {
  const iconMap = {
    running: <Loader2 className="h-3 w-3 animate-spin text-accent" />,
    success: <CheckCircle2 className="h-3 w-3 text-primary" />,
    error: <XCircle className="h-3 w-3 text-destructive" />,
  }

  const statusLabel = {
    running: 'Running',
    success: 'Success',
    error: 'Failed',
  }

  const statusColor = {
    running: 'text-accent',
    success: 'text-primary',
    error: 'text-destructive',
  }

  const duration =
    run.completedAt && run.startedAt
      ? `${((run.completedAt - run.startedAt) / 1000).toFixed(1)}s`
      : '—'

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-center gap-2 rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5"
    >
      {iconMap[run.status]}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-medium ${statusColor[run.status]}`}>
            {statusLabel[run.status]}
          </span>
          {run.message && (
            <span className="truncate text-[9px] text-muted-foreground/60">
              · {run.message}
            </span>
          )}
        </div>
      </div>
      <span className="font-mono text-[9px] text-muted-foreground/50">{duration}</span>
      <span className="font-mono text-[9px] text-muted-foreground/50">
        {new Date(run.startedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        })}
      </span>
    </motion.div>
  )
}

// ─── Utilities ───────────────────────────────────────────────────

function formatSchedule(ms: number): string {
  if (ms < 60_000) return `${ms / 1000}s`
  if (ms < 3_600_000) return `${ms / 60_000}m`
  return `${ms / 3_600_000}h`
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts
  const seconds = Math.floor(diffMs / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}
