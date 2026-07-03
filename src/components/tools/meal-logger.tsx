'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Utensils, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { ModalShell } from '@/components/automations/modal-shell'

interface Meal { id: string; description: string; calories: number; protein: number; carbs: number; fat: number; logged_at: string }

const PROTEIN_GOAL = 120

function parseMacros(text: string): { calories: number; protein: number; carbs: number; fat: number } | null {
  const cal = text.match(/calories?:?\s*(\d+)/i)
  const pro = text.match(/protein:?\s*(\d+)/i)
  const carb = text.match(/carbs?:?\s*(\d+)/i)
  const fat = text.match(/fat:?\s*(\d+)/i)
  if (!cal && !pro) return null
  return { calories: cal ? Number(cal[1]) : 0, protein: pro ? Number(pro[1]) : 0, carbs: carb ? Number(carb[1]) : 0, fat: fat ? Number(fat[1]) : 0 }
}

function todayStr(): string {
  return new Date().toISOString().slice(0, 10)
}

export function MealLogger({ onClose }: { onClose: () => void }) {
  const [meals, setMeals] = useState<Meal[]>([])
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState('')
  const [estimating, setEstimating] = useState(false)

  const load = () =>
    fetch(`/api/tools/meals?date=${todayStr()}`)
      .then((r) => r.json())
      .then((d) => { setMeals(d.meals ?? []); setLoading(false) })
      .catch(console.error)

  useEffect(() => { load() }, [])

  const totals = meals.reduce((acc, m) => ({
    calories: acc.calories + m.calories,
    protein: acc.protein + m.protein,
    carbs: acc.carbs + m.carbs,
    fat: acc.fat + m.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 })

  const proteinPct = Math.min(100, Math.round((totals.protein / PROTEIN_GOAL) * 100))
  const proteinBehind = totals.protein < PROTEIN_GOAL && new Date().getHours() >= 18

  const handleLog = async () => {
    const text = input.trim()
    if (!text) return
    setEstimating(true)
    try {
      const res = await fetch('/api/automations/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: `Estimate the macros for this meal: "${text}". Respond in exactly this format with your best estimate numbers, no other text:\nCalories: <number>\nProtein: <number>\nCarbs: <number>\nFat: <number>`,
        }),
      })
      const data = await res.json()
      const macros = data.text ? parseMacros(data.text) : null
      if (!macros) return
      await fetch('/api/tools/meals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: text, ...macros }),
      })
      setInput('')
      await load()
    } catch (err) {
      console.error('meal log failed:', err)
    } finally {
      setEstimating(false)
    }
  }

  const handleDelete = async (id: string) => {
    await fetch('/api/tools/meals', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) })
    await load()
  }

  return (
    <ModalShell
      title="Meal Logger"
      subtitle="Log meals in plain English — AI estimates macros"
      icon={<Utensils className="h-4 w-4 text-primary" />}
      onClose={onClose}
      width="w-[520px]"
    >
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="space-y-4">
          {/* Daily macro stats */}
          <div className="grid grid-cols-4 gap-2">
            {[['Calories', totals.calories], ['Protein', `${totals.protein}g`], ['Carbs', `${totals.carbs}g`], ['Fat', `${totals.fat}g`]].map(([label, val]) => (
              <div key={label as string} className="rounded border border-border bg-surface-elevated px-2 py-2 text-center">
                <p className="font-mono text-base font-semibold text-foreground">{val}</p>
                <p className="text-[10px] text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          {/* Protein progress */}
          <div className="rounded border border-border bg-surface-elevated p-3">
            <div className="mb-1 flex justify-between text-xs">
              <span className="text-muted-foreground">Protein goal</span>
              <span className="font-mono text-foreground">{totals.protein}g / {PROTEIN_GOAL}g</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-base">
              <motion.div
                className={`h-full ${proteinBehind ? 'bg-warning' : 'bg-primary'}`}
                initial={{ width: 0 }}
                animate={{ width: `${proteinPct}%` }}
                transition={{ duration: 0.6, ease: 'easeOut' }}
              />
            </div>
            {proteinBehind && (
              <div className="mt-2 flex items-center gap-1.5 text-xs text-warning">
                <AlertTriangle className="h-3 w-3 flex-shrink-0" />
                You&apos;re under on protein — {PROTEIN_GOAL - totals.protein}g to go.
              </div>
            )}
          </div>

          {/* Input */}
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleLog()}
              placeholder="e.g. 2 eggs and toast with butter"
              className="flex-1 rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
            <button
              onClick={handleLog}
              disabled={!input.trim() || estimating}
              className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary hover:bg-primary/20 disabled:opacity-40"
            >
              {estimating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              Log
            </button>
          </div>

          {/* Meal list */}
          {meals.length === 0 ? (
            <p className="py-4 text-center text-xs text-muted-foreground">No meals logged today. Start tracking above.</p>
          ) : (
            <AnimatePresence>
              {meals.map((meal) => (
                <motion.div key={meal.id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                  className="flex items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 text-xs">
                  <span className="truncate text-foreground">{meal.description}</span>
                  <div className="ml-2 flex flex-shrink-0 items-center gap-2">
                    <span className="font-mono text-[10px] text-muted-foreground">{meal.calories}cal · {meal.protein}g pro</span>
                    <button onClick={() => handleDelete(meal.id)} className="rounded p-0.5 text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          )}
        </div>
      )}
    </ModalShell>
  )
}
