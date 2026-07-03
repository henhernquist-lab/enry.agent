'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import type { UIMessage } from 'ai'
import { LeftSidebar, CenterPanel, RightPanel, GridBackground, CornerAccents } from '@/components/components'
import {
  loadConversations,
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

export default function EnryAgentPage() {
  const { data: session, status: sessionStatus } = useSession()
  const [agentStatus, setAgentStatus] = useState<'online' | 'thinking' | 'executing' | 'idle'>('online')
  const [conversations, setConversations] = useState<Conversation[]>(() => loadConversations())
  const [activeId, setActiveId] = useState<string>(() => newConversationId())
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [currentModel, setCurrentModel] = useState('deepseek-ai/deepseek-v4-pro')
  const [lastResponseMs, setLastResponseMs] = useState<number | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showProfileEditor, setShowProfileEditor] = useState(false)
  const responseStartRef = useRef<number | null>(null)

  // ─── Automation scheduler lifecycle ─────────────────────────
  useEffect(() => {
    setOnAutomationRun((_automation: Automation, _run: AutomationRun) => {
      // Could pipe automation events into the activity timeline here
    })
    startAllSchedulers()
    return () => stopAllSchedulers()
  }, [])

  const handleAutomationsChange = useCallback(() => {
    // Re-sync schedulers when automations are created/toggled/deleted
    stopAllSchedulers()
    startAllSchedulers()
  }, [])

  useEffect(() => {
    // Wait for the session to be confirmed before checking for an existing profile
    if (sessionStatus !== 'authenticated') {
      console.log('[page] Session status:', sessionStatus, '— skipping profile load')
      return
    }
    console.log('[page] Session authenticated — loading profile')
    loadProfileAsync().then((profile) => {
      console.log('[page] Profile loaded:', profile ? `setupComplete=${profile.setupComplete}` : 'null')
      if (!profile?.setupComplete) {
        console.log('[page] Profile not set up — showing onboarding')
        setShowOnboarding(true)
      }
    })
  }, [sessionStatus])

  const activeConversation = conversations.find((c) => c.id === activeId)

  const handleSaveMessages = useCallback(
    (messages: UIMessage[], model: string) => {
      if (messages.length === 0) return
      const firstUserMsg = messages.find((m) => m.role === 'user')
      const textPart = firstUserMsg?.parts.find((p) => p.type === 'text')
      const title = textPart && 'text' in textPart ? textPart.text.slice(0, 60) : 'New chat'

      const conv: Conversation = {
        id: activeId,
        title,
        model,
        createdAt: activeConversation?.createdAt ?? Date.now(),
        updatedAt: Date.now(),
        messages,
      }
      saveConversation(conv)
      setConversations(loadConversations())
    },
    [activeId, activeConversation],
  )

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

  const handleNewChat = useCallback(() => {
    setActiveId(newConversationId())
    resetActivityState()
  }, [resetActivityState])

  const handleSelectConversation = useCallback(
    (id: string) => {
      setActiveId(id)
      resetActivityState()
    },
    [resetActivityState],
  )

  const handleDeleteConversation = useCallback(
    (id: string) => {
      deleteConversation(id)
      setConversations(loadConversations())
      if (id === activeId) {
        setActiveId(newConversationId())
        resetActivityState()
      }
    },
    [activeId, resetActivityState],
  )

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-surface-base">
      <GridBackground />
      <CornerAccents />

      <div className="relative z-10 flex h-full w-full">
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
            console.log('[page:skip] Saving default profile')
            saveProfile(skipped).then((ok) => {
              if (!ok) console.error('[page:skip] Failed to save skipped profile')
              else console.log('[page:skip] Skipped profile saved successfully')
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
          initialMessages={activeConversation?.messages}
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
        />
      </div>
    </div>
  )
}
