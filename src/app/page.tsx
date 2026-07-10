'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import type { UIMessage } from 'ai'
import { LeftSidebar, CenterPanel, RightPanel, GridBackground, CornerAccents } from '@/components/components'
import {
  loadConversations,
  loadConversationMessages,
  saveConversation,
  deleteConversation,
  newConversationId,
  type Conversation,
  type ActivityEvent,
} from '@/lib/chat-history'
import {
  startAllSchedulers,
  stopAllSchedulers,
  setOnAutomationRun,
  type Automation,
  type AutomationRun,
} from '@/lib/automations'
import { loadProfileAsync, createDefaultProfile, saveProfile } from '@/lib/user-profile'
import { OnboardingFlow } from '@/components/onboarding-flow'
import { ProfileEditor } from '@/components/profile-editor'
import { QuickNotesWidget } from '@/components/home/quick-notes-widget'
import { SystemStatusStrip } from '@/components/home/system-status-strip'
import { ActivityChart } from '@/components/home/activity-chart'

export default function EnryAgentPage() {
  const { data: session, status: sessionStatus } = useSession()
  const [agentStatus, setAgentStatus] = useState<'online' | 'thinking' | 'executing' | 'idle'>('online')

  // Conversations list (no messages — loaded separately on demand)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>('')
  // Messages for the currently active conversation (fetched on select)
  const [activeMessages, setActiveMessages] = useState<UIMessage[] | undefined>(undefined)
  // Track createdAt for the active conversation so saveConversation can preserve it
  const activeCreatedAtRef = useRef<number>(Date.now())

  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [currentModel, setCurrentModel] = useState('deepseek-ai/deepseek-v4-pro')
  const [lastResponseMs, setLastResponseMs] = useState<number | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showProfileEditor, setShowProfileEditor] = useState(false)
  const responseStartRef = useRef<number | null>(null)

  // ─── Automation scheduler lifecycle ─────────────────────────
  useEffect(() => {
    setOnAutomationRun((_automation: Automation, _run: AutomationRun) => {})
    startAllSchedulers()
    return () => stopAllSchedulers()
  }, [])

  const handleAutomationsChange = useCallback(() => {
    stopAllSchedulers()
    startAllSchedulers()
  }, [])

  // ─── Load conversations + profile when session is authenticated ───
  // Clears state first so a freshly-logged-in user never sees another
  // user's chats that were resident in React state.
  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      // Wipe all chat state immediately on logout
      setConversations([])
      setActiveId('')
      setActiveMessages(undefined)
      return
    }

    if (sessionStatus !== 'authenticated') return

    // Load this user's chats from Supabase
    loadConversations().then((convs) => {
      setConversations(convs)
      // Default to a new blank chat — don't auto-select the last conversation
      // so the user consciously chooses to resume one
      setActiveId(newConversationId())
      setActiveMessages(undefined)
      activeCreatedAtRef.current = Date.now()
    })

    // Load profile / show onboarding
    loadProfileAsync().then((profile) => {
      if (!profile?.setupComplete) setShowOnboarding(true)
    })
  }, [sessionStatus])

  // ─── Refresh conversation list (without disrupting active chat) ───
  const refreshConversations = useCallback(() => {
    loadConversations().then(setConversations)
  }, [])

  // ─── Save messages to Supabase ────────────────────────────────────
  const handleSaveMessages = useCallback(
    async (messages: UIMessage[], model: string) => {
      if (messages.length === 0) return
      const firstUserMsg = messages.find((m) => m.role === 'user')
      const textPart = firstUserMsg?.parts.find((p) => p.type === 'text')
      const title = textPart && 'text' in textPart ? textPart.text.slice(0, 60) : 'New chat'

      const conv: Conversation = {
        id: activeId,
        title,
        model,
        createdAt: activeCreatedAtRef.current,
        updatedAt: Date.now(),
        messages,
      }
      await saveConversation(conv)
      refreshConversations()
    },
    [activeId, refreshConversations],
  )

  // ─── Activity timeline ────────────────────────────────────────────
  const handleActivity = useCallback((event: Omit<ActivityEvent, 'id'>) => {
    setActivities((prev) => [...prev.slice(-19), { ...event, id: Math.random().toString(36).slice(2) }])
    if (event.type === 'assistant-start') {
      responseStartRef.current = Date.now()
    }
    if (event.type === 'assistant-complete') {
      if (responseStartRef.current) {
        setLastResponseMs(Date.now() - responseStartRef.current)
        responseStartRef.current = null
      }
      setStreamingText('')
    }
    if (event.type === 'error') {
      responseStartRef.current = null
      setStreamingText('')
    }
  }, [])

  const resetActivityState = useCallback(() => {
    setActivities([])
    setStreamingText('')
  }, [])

  // ─── Chat management ──────────────────────────────────────────────
  const handleNewChat = useCallback(() => {
    setActiveId(newConversationId())
    setActiveMessages(undefined)
    activeCreatedAtRef.current = Date.now()
    resetActivityState()
  }, [resetActivityState])

  const handleSelectConversation = useCallback(
    async (id: string) => {
      setActiveId(id)
      setActiveMessages(undefined) // clear while loading
      resetActivityState()

      // Fetch messages from Supabase — server verifies ownership (403 if wrong user)
      const msgs = await loadConversationMessages(id)
      setActiveMessages(msgs)

      const conv = conversations.find((c) => c.id === id)
      activeCreatedAtRef.current = conv?.createdAt ?? Date.now()
    },
    [resetActivityState, conversations],
  )

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id)
      refreshConversations()
      if (id === activeId) {
        setActiveId(newConversationId())
        setActiveMessages(undefined)
        activeCreatedAtRef.current = Date.now()
        resetActivityState()
      }
    },
    [activeId, refreshConversations, resetActivityState],
  )

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-transparent">
      <GridBackground />
      <CornerAccents />

      <div className="relative z-10 flex h-full w-full flex-col">
        <SystemStatusStrip />

        <div className="flex min-h-0 w-full flex-1">
        <LeftSidebar
          agentStatus={agentStatus}
          conversations={conversations}
          activeId={activeId}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onAutomationsChange={handleAutomationsChange}
          onSetupProfile={() => setShowProfileEditor(true)}
        />

        <OnboardingFlow
          open={showOnboarding}
          onComplete={() => setShowOnboarding(false)}
          onClose={() => setShowOnboarding(false)}
          onSkip={() => {
            const skipped = { ...createDefaultProfile(), setupComplete: true, setupDate: Date.now() }
            saveProfile(skipped).then((ok) => {
              if (!ok) console.error('[page:skip] Failed to save skipped profile')
            })
            setShowOnboarding(false)
          }}
        />

        <ProfileEditor
          open={showProfileEditor}
          onClose={() => setShowProfileEditor(false)}
        />

        <CenterPanel
          key={activeId}
          agentStatus={agentStatus}
          setAgentStatus={setAgentStatus}
          initialMessages={activeMessages}
          conversationCount={conversations.length}
          lastResponseMs={lastResponseMs}
          onSaveMessages={handleSaveMessages}
          onActivity={handleActivity}
          onStreamUpdate={setStreamingText}
          onModelChange={setCurrentModel}
        />

        <RightPanel
          agentStatus={agentStatus}
          activities={activities}
          streamingText={streamingText}
          currentModel={currentModel}
        >
          <QuickNotesWidget />
          <div className="mt-4 border-t border-border pt-4">
            <ActivityChart />
          </div>
        </RightPanel>
        </div>
      </div>
    </div>
  )
}
