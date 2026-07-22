'use client'

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Globe, Timer, ToggleLeft, ToggleRight, Zap } from 'lucide-react'
import { DailyBriefingPanel } from './daily-briefing-panel'
import { UrlWatcherPanel } from './url-watcher-panel'
import { StudyTimerPanel } from './study-timer-panel'
import { loadToggles, setToggle, type BuiltinAutomationId, type BuiltinAutomationToggles } from '@/lib/builtin-automations'
import { loadWatchedUrls, checkUrl } from '@/lib/url-watcher'

const URL_WATCH_INTERVAL_MS = 15 * 60 * 1000

const ITEMS: { id: BuiltinAutomationId; label: string; icon: typeof Zap }[] = [
  { id: 'dailyBriefing', label: 'Daily Briefing', icon: Zap },
  { id: 'urlWatcher', label: 'URL Watcher', icon: Globe },
  { id: 'studyTimer', label: 'Smart Study Timer', icon: Timer },
]

export function BuiltinAutomationsLauncher() {
  const [toggles, setToggles] = useState<BuiltinAutomationToggles | null>(() => loadToggles())
  const [openPanel, setOpenPanel] = useState<BuiltinAutomationId | null>(null)

  useEffect(() => {
    if (!toggles?.urlWatcher) return
    const tick = () => {
      const urls = loadWatchedUrls()
      urls.forEach((entry) => {
        checkUrl(entry).catch((err) => console.error('background url check failed:', err))
      })
    }
    const interval = setInterval(tick, URL_WATCH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [toggles?.urlWatcher])

  if (!toggles) return null

  const handleToggle = (id: BuiltinAutomationId, e: React.MouseEvent) => {
    e.stopPropagation()
    setToggles(setToggle(id, !toggles[id]))
  }

  return (
    <>
      <div className="mb-2 flex items-center gap-2">
        <Zap className="h-3.5 w-3.5 text-primary" />
        <h3 className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Automations
        </h3>
      </div>
      <div className="space-y-1">
        {ITEMS.map(({ id, label, icon: Icon }) => (
          <motion.button
            key={id}
            layout
            onClick={() => setOpenPanel(id)}
            className="group flex w-full items-center gap-2 rounded px-2 py-1.5 text-left transition-colors hover:bg-surface-elevated/60"
          >
            <Icon className={`h-3.5 w-3.5 flex-shrink-0 ${toggles[id] ? 'text-primary' : 'text-muted-foreground'}`} />
            <span className={`flex-1 truncate text-xs ${toggles[id] ? 'text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </span>
            <button onClick={(e) => handleToggle(id, e)} className="flex-shrink-0" title={toggles[id] ? 'Disable' : 'Enable'}>
              {toggles[id] ? (
                <ToggleRight className="h-4 w-4 text-primary" />
              ) : (
                <ToggleLeft className="h-4 w-4 text-muted-foreground/50" />
              )}
            </button>
          </motion.button>
        ))}
      </div>

      {openPanel === 'dailyBriefing' && <DailyBriefingPanel onClose={() => setOpenPanel(null)} />}
      {openPanel === 'urlWatcher' && <UrlWatcherPanel onClose={() => setOpenPanel(null)} />}
      {openPanel === 'studyTimer' && <StudyTimerPanel onClose={() => setOpenPanel(null)} />}

    </>
  )
}
