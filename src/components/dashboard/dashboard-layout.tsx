'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { LeftSidebar } from '@/components/left-sidebar'
import { TopBar } from '@/components/top-bar'
import { loadConversations, deleteConversation, type Conversation } from '@/lib/chat-history'

interface DashboardLayoutProps {
  children: React.ReactNode
}

// The dashboard has no chat surface of its own — chat lives at /chat — so
// the shared sidebar's history section here is real data + navigation,
// not a live session: selecting/starting a chat routes to /chat, which
// owns the actual useChat() instance and message state.
export function DashboardLayout({ children }: DashboardLayoutProps) {
  const router = useRouter()
  const { status: sessionStatus } = useSession()
  const [conversations, setConversations] = useState<Conversation[]>([])

  const refreshConversations = useCallback(() => {
    loadConversations().then(setConversations)
  }, [])

  useEffect(() => {
    if (sessionStatus !== 'authenticated') {
      setConversations([])
      return
    }
    refreshConversations()
  }, [sessionStatus, refreshConversations])

  const handleDeleteConversation = useCallback(
    async (id: string) => {
      await deleteConversation(id)
      refreshConversations()
    },
    [refreshConversations],
  )

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-transparent">
      <div className="relative z-10 flex h-full w-full flex-col">
        <TopBar />
        <div className="flex min-h-0 w-full flex-1">
          <LeftSidebar
            agentStatus="online"
            conversations={conversations}
            activeId=""
            onNewChat={() => router.push('/chat')}
            onSelectConversation={(id) => router.push(`/chat?id=${id}`)}
            onDeleteConversation={handleDeleteConversation}
          />
          <main className="min-w-0 flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </div>
  )
}
