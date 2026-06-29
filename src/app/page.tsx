'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
import { hasCompletedSetup } from '@/lib/user-profile'
import { OnboardingFlow } from '@/components/onboarding-flow'

export default function EnryAgentPage() {
  const [agentStatus, setAgentStatus] = useState<'online' | 'thinking' | 'executing' | 'idle'>('online')
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>(() => newConversationId())
  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [currentModel, setCurrentModel] = useState('z-ai/glm-5.1')
  const [lastResponseMs, setLastResponseMs] = useState<number | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
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
    setConversations(loadConversations())
    // Check if this is the first launch — show onboarding if no profile exists
    if (!hasCompletedSetup()) {
      setShowOnboarding(true)
    }
  }, [])

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
          onSetupProfile={() => setShowOnboarding(true)}
        />

        <OnboardingFlow
          open={showOnboarding}
          onComplete={() => setShowOnboarding(false)}
          onClose={() => setShowOnboarding(false)}
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
