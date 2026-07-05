'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { GraduationCap, Plus, Trash2, Save } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'
import { ToolPanel } from '@/components/tools/tool-panel'
import { saveResource } from '@/lib/resources'

interface GradeClass {
  id: string
  name: string
  currentGrade: number
  finalWeight: number
  credits: number
}

function gradeToGpa(pct: number): number {
  if (pct >= 93) return 4.0
  if (pct >= 90) return 3.7
  if (pct >= 87) return 3.3
  if (pct >= 83) return 3.0
  if (pct >= 80) return 2.7
  if (pct >= 77) return 2.3
  if (pct >= 73) return 2.0
  if (pct >= 70) return 1.7
  if (pct >= 67) return 1.3
  if (pct >= 63) return 1.0
  if (pct >= 60) return 0.7
  return 0.0
}

function letterGrade(pct: number): string {
  if (pct >= 93) return 'A'
  if (pct >= 90) return 'A-'
  if (pct >= 87) return 'B+'
  if (pct >= 83) return 'B'
  if (pct >= 80) return 'B-'
  if (pct >= 77) return 'C+'
  if (pct >= 73) return 'C'
  if (pct >= 70) return 'C-'
  return 'D'
}

function newClass(): GradeClass {
  return { id: Math.random().toString(36).slice(2), name: '', currentGrade: 85, finalWeight: 20, credits: 1 }
}

interface GradeCalculatorProps {
  onClose: () => void
  mode?: 'modal' | 'page'
  onSave?: () => void
}

export function GradeCalculator({ onClose, mode = 'modal', onSave }: GradeCalculatorProps) {
  const [targetGpa, setTargetGpa] = useState('3.5')
  const [classes, setClasses] = useState<GradeClass[]>([newClass()])
  const [saving, setSaving] = useState(false)
  const [saveOk, setSaveOk] = useState(false)

  useEffect(() => {
    fetch('/api/tools/grades')
      .then((r) => r.json())
      .then((data) => {
        if (data.grades) {
          setTargetGpa(data.grades.targetGpa ?? '3.5')
          setClasses(data.grades.classes?.length ? data.grades.classes : [newClass()])
        }
      })
      .catch(console.error)
  }, [])

  const updateClass = (id: string, field: keyof GradeClass, value: string | number) => {
    setClasses((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)))
  }

  const addClass = () => setClasses((prev) => [...prev, newClass()])
  const removeClass = (id: string) => setClasses((prev) => prev.filter((c) => c.id !== id))

  const target = parseFloat(targetGpa) || 3.5

  const results = classes.map((c) => {
    const fw = c.finalWeight / 100
    const targetPct = target >= 3.7 ? 90 : target >= 3.3 ? 87 : target >= 3.0 ? 83 : target >= 2.7 ? 80 : 77
    const needed = fw === 0 ? 100 : (targetPct - c.currentGrade * (1 - fw)) / fw
    const projectedWithNeeded = c.currentGrade * (1 - fw) + Math.max(0, Math.min(100, needed)) * fw
    return { ...c, needed: Math.round(needed * 10) / 10, projected: Math.round(projectedWithNeeded * 10) / 10 }
  })

  const totalCredits = classes.reduce((s, c) => s + c.credits, 0)
  const weightedGpa = totalCredits > 0
    ? classes.reduce((s, c) => s + gradeToGpa(c.currentGrade) * c.credits, 0) / totalCredits
    : 0

  const handleSave = async () => {
    setSaving(true)
    try {
      await fetch('/api/tools/grades', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grades: { targetGpa, classes } }),
      })
      saveResource('grade_calc', `GPA target ${targetGpa} — ${new Date().toLocaleDateString()}`, {
        targetGpa,
        classes,
        weightedGpa,
      })
      onSave?.()
      setSaveOk(true)
      setTimeout(() => setSaveOk(false), 2000)
    } catch (err) {
      console.error('grade save failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const icon = <GraduationCap className="h-4 w-4 text-primary" />

  const body = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded border border-border bg-surface-elevated px-3 py-2 text-center">
          <p className="font-mono text-2xl font-semibold text-foreground">{weightedGpa.toFixed(2)}</p>
          <p className="text-[10px] text-muted-foreground">Current GPA</p>
        </div>
        <div className="rounded border border-primary/30 bg-primary/5 px-3 py-2 text-center">
          <input
            type="number"
            min="0"
            max="4.0"
            step="0.1"
            value={targetGpa}
            onChange={(e) => setTargetGpa(e.target.value)}
            className="w-full bg-transparent text-center font-mono text-2xl font-semibold text-primary focus:outline-none"
          />
          <p className="text-[10px] text-muted-foreground">Target GPA</p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="grid grid-cols-12 gap-1 px-1">
          {['Class', 'Grade %', 'Final Wt%', 'Credits', 'Need on Final', ''].map((h) => (
            <span key={h} className={`font-mono text-[9px] uppercase tracking-wider text-muted-foreground ${h === 'Class' ? 'col-span-3' : h === 'Need on Final' ? 'col-span-2' : 'col-span-2'}`}>{h}</span>
          ))}
        </div>

        {results.map((c) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-12 items-center gap-1"
          >
            <input
              value={c.name}
              onChange={(e) => updateClass(c.id, 'name', e.target.value)}
              placeholder="Class name"
              className="col-span-3 rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none"
            />
            <input
              type="number"
              value={c.currentGrade}
              onChange={(e) => updateClass(c.id, 'currentGrade', Number(e.target.value))}
              className="col-span-2 rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
            />
            <input
              type="number"
              value={c.finalWeight}
              onChange={(e) => updateClass(c.id, 'finalWeight', Number(e.target.value))}
              className="col-span-2 rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
            />
            <input
              type="number"
              value={c.credits}
              onChange={(e) => updateClass(c.id, 'credits', Number(e.target.value))}
              className="col-span-2 rounded border border-border bg-surface-elevated px-2 py-1.5 text-xs text-foreground focus:border-primary/50 focus:outline-none"
            />
            <div className={`col-span-2 rounded px-2 py-1.5 text-center font-mono text-xs font-medium ${c.needed > 100 ? 'border border-destructive/30 bg-destructive/10 text-destructive' : c.needed < 0 ? 'border border-primary/30 bg-primary/10 text-primary' : 'border border-border bg-surface-elevated text-foreground'}`}>
              {c.needed > 100 ? 'N/A' : c.needed < 0 ? 'Locked' : `${c.needed}%`}
              <span className="ml-1 text-[9px] text-muted-foreground">{letterGrade(c.projected)}</span>
            </div>
            <button onClick={() => removeClass(c.id)} className="col-span-1 flex justify-center rounded p-1 text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3 w-3" />
            </button>
          </motion.div>
        ))}
      </div>

      <button onClick={addClass} className="flex items-center gap-1.5 text-xs text-primary hover:underline">
        <Plus className="h-3.5 w-3.5" />
        Add class
      </button>

      <div className="rounded border border-border bg-surface-elevated p-3 text-xs text-muted-foreground">
        <p>Scores labeled <span className="text-destructive">N/A</span> are mathematically impossible. <span className="text-primary">Locked</span> means you already have that GPA in this class.</p>
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:opacity-40"
      >
        <Save className="h-4 w-4" />
        {saveOk ? 'Saved!' : saving ? 'Saving…' : 'Save to Profile'}
      </button>
    </div>
  )

  if (mode === 'page') {
    return (
      <ToolPanel
        title="Grade Calculator"
        subtitle="What do you need on finals?"
        icon={icon}
        onClose={onClose}
      >
        {body}
      </ToolPanel>
    )
  }

  return (
    <ModalShell
      title="Grade Calculator"
      subtitle="What do you need on finals?"
      icon={icon}
      onClose={onClose}
      width="w-[600px]"
    >
      {body}
    </ModalShell>
  )
}
