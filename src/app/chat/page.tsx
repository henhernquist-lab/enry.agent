'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useRouter, useSearchParams } from 'next/navigation'
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
import { QuickNotesWidget } from '@/components/home/quick-notes-widget'
import { ActivityChart } from '@/components/home/activity-chart'
import { TerminalLauncher } from '@/components/home/terminal-launcher'
import { AgentLauncher } from '@/components/home/agent-launcher'
import { UsageAlerts } from '@/components/usage/usage-alerts'
import { TopBar } from '@/components/top-bar'
import { QuickStartCard } from '@/components/quick-start-card'
import { ProviderTopology } from '@/components/provider-topology'
import { Card } from '@/components/card'

function ChatPageInner() {
  const { data: session, status: sessionStatus } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [agentStatus, setAgentStatus] = useState<'online' | 'thinking' | 'streaming' | 'idle'>('online')

  // Conversations list (no messages — loaded separately on demand)
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeId, setActiveId] = useState<string>('')
  // Messages for the currently active conversation (fetched on select)
  const [activeMessages, setActiveMessages] = useState<UIMessage[] | undefined>(undefined)
  // Track createdAt for the active conversation so saveConversation can preserve it
  const activeCreatedAtRef = useRef<number>(Date.now())

  const [activities, setActivities] = useState<ActivityEvent[]>([])
  const [streamingText, setStreamingText] = useState('')
  const [currentModel, setCurrentModel] = useState('deepseek/deepseek-v4-pro')
  const [lastResponseMs, setLastResponseMs] = useState<number | null>(null)
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
    loadConversations().then(async (convs) => {
      setConversations(convs)

      // A deep link (e.g. the dashboard sidebar) can jump straight to a
      // saved conversation via ?id=; otherwise default to a new blank
      // chat — don't auto-select the last conversation so the user
      // consciously chooses to resume one.
      const deepLinkId = searchParams.get('id')
      const target = deepLinkId ? convs.find((c) => c.id === deepLinkId) : undefined
      if (target) {
        const msgs = await loadConversationMessages(target.id)
        setActiveId(target.id)
        setActiveMessages(msgs)
        activeCreatedAtRef.current = target.createdAt
      } else {
        setActiveId(newConversationId())
        setActiveMessages(undefined)
        activeCreatedAtRef.current = Date.now()
      }
    })
    // searchParams is read once at load, not tracked reactively — selecting
    // or starting chats afterward is handled by the handlers below, which
    // sync the URL themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    router.replace('/chat', { scroll: false })
  }, [resetActivityState, router])

  const handleSelectConversation = useCallback(
    async (id: string) => {
      resetActivityState()

      // Fetch messages BEFORE flipping activeId. CenterPanel remounts via
      // key={activeId} below, but useChat() isn't given an `id` option —
      // its internal Chat instance is built once at mount and never
      // re-synced from prop changes afterward (confirmed in @ai-sdk/react's
      // source: the Chat instance is only recreated when a `chat` object or
      // `id` option changes, not `messages`). Remounting before the real
      // messages arrive locks in an empty chat that setActiveMessages(msgs)
      // can no longer fix once it resolves — this was the root cause of
      // clicking a saved chat rendering as blank/default.
      const msgs = await loadConversationMessages(id)
      const conv = conversations.find((c) => c.id === id)

      setActiveId(id)
      setActiveMessages(msgs)
      activeCreatedAtRef.current = conv?.createdAt ?? Date.now()
      router.replace(`/chat?id=${id}`, { scroll: false })
    },
    [resetActivityState, conversations, router],
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
        router.replace('/chat', { scroll: false })
      }
    },
    [activeId, refreshConversations, resetActivityState, router],
  )

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-transparent">
      <GridBackground />
      <CornerAccents />

      <div className="relative z-10 flex h-full w-full flex-col">
        <TopBar />
        {/* Inline usage alerts — dismissible, no browser alerts. */}
        <div className="px-4 pt-2">
          <UsageAlerts compact className="space-y-1.5" />
        </div>

        <div className="flex min-h-0 w-full flex-1">
        <LeftSidebar
          agentStatus={agentStatus}
          conversations={conversations}
          activeId={activeId}
          onNewChat={handleNewChat}
          onSelectConversation={handleSelectConversation}
          onDeleteConversation={handleDeleteConversation}
          onAutomationsChange={handleAutomationsChange}
        />          <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
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
        </div>

        <RightPanel
          agentStatus={agentStatus}
          activities={activities}
          streamingText={streamingText}
          currentModel={currentModel}
        >
          <Card padding="lg">
            <QuickStartCard />
          </Card>
          <Card padding="lg">
            <ProviderTopology />
          </Card>
          <Card padding="md">
            <QuickNotesWidget />
          </Card>
          <Card padding="sm">
            <AgentLauncher />
          </Card>
          <Card padding="sm">
            <TerminalLauncher />
          </Card>
          <Card padding="md">
            <ActivityChart />
          </Card>
        </RightPanel>
        </div>
      </div>
    </div>
  )
}

// useSearchParams (for the ?id= deep link) requires a Suspense boundary.
export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center bg-background text-xs text-muted-foreground">Loading…</div>}>
      <ChatPageInner />
    </Suspense>
  )
}
