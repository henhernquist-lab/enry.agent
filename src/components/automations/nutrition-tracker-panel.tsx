'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Apple, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { ModalShell } from './modal-shell'
import {
  loadFoodEntries,
  logFood,
  deleteFood,
  todayEntries,
  totals,
  DAILY_PROTEIN_GOAL_G,
  type FoodEntry,
} from '@/lib/nutrition'

function parseMacros(text: string): { calories: number; protein: number; carbs: number; fat: number } | null {
  const cal = text.match(/calories?:?\s*(\d+)/i)
  const protein = text.match(/protein:?\s*(\d+)/i)
  const carbs = text.match(/carbs?:?\s*(\d+)/i)
  const fat = text.match(/fat:?\s*(\d+)/i)
  if (!cal && !protein) return null
  return {
    calories: cal ? Number(cal[1]) : 0,
    protein: protein ? Number(protein[1]) : 0,
    carbs: carbs ? Number(carbs[1]) : 0,
    fat: fat ? Number(fat[1]) : 0,
  }
}

export function NutritionTrackerPanel({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<FoodEntry[]>([])
  const [input, setInput] = useState('')
  const [estimating, setEstimating] = useState(false)

  const refresh = () => setEntries(loadFoodEntries())

  useEffect(() => {
    refresh()
  }, [])

  const today = todayEntries(entries)
  const dailyTotals = totals(today)
  const proteinPct = Math.min(100, Math.round((dailyTotals.protein / DAILY_PROTEIN_GOAL_G) * 100))
  const proteinBehind = dailyTotals.protein < DAILY_PROTEIN_GOAL_G && new Date().getHours() >= 18

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
      if (macros) {
        logFood(text, macros)
        setInput('')
        refresh()
      }
    } catch (error) {
      console.error('macro estimation failed:', error)
    } finally {
      setEstimating(false)
    }
  }

  return (
    <ModalShell title="Nutrition Tracker" subtitle="Log meals in plain English" icon={<Apple className="h-4 w-4 text-primary" />} onClose={onClose} width="w-[520px]">
      <div className="mb-4 grid grid-cols-3 gap-2">
        <StatBox label="Calories" value={dailyTotals.calories} />
        <StatBox label="Protein (g)" value={dailyTotals.protein} />
        <StatBox label="Carbs (g)" value={dailyTotals.carbs} />
      </div>

      <div className="mb-4 rounded border border-border bg-surface-elevated p-3">
        <div className="mb-1 flex justify-between text-xs">
          <span className="text-muted-foreground">Protein goal</span>
          <span className="font-mono text-foreground">
            {dailyTotals.protein}g / {DAILY_PROTEIN_GOAL_G}g
          </span>
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
            You&apos;re under on protein for today — {DAILY_PROTEIN_GOAL_G - dailyTotals.protein}g to go.
          </div>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLog()}
          placeholder="e.g. had 2 eggs and toast"
          className="flex-1 rounded border border-border bg-surface-elevated px-3 py-2 text-sm text-foreground placeholder-muted-foreground/50 focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          onClick={handleLog}
          disabled={!input.trim() || estimating}
          className="flex items-center gap-1.5 rounded border border-primary/40 bg-primary/10 px-3 py-2 text-xs font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {estimating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Log
        </button>
      </div>

      {today.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">No meals logged today. Start tracking above.</p>
      ) : (
        <div className="space-y-1.5">
          <AnimatePresence>
            {today.map((entry) => (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center justify-between rounded border border-border/50 bg-surface-elevated/50 px-2.5 py-1.5 text-xs"
              >
                <span className="truncate text-foreground">{entry.text}</span>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {entry.calories}cal · {entry.protein}p
                  </span>
                  <button
                    onClick={() => {
                      deleteFood(entry.id)
                      refresh()
                    }}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </ModalShell>
  )
}

function StatBox({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded border border-border bg-surface-elevated px-3 py-2 text-center">
      <p className="font-mono text-lg font-semibold text-foreground">{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  )
}
