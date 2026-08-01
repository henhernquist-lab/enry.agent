'use client'

import { useCallback, useState } from 'react'
import type { UIMessage } from 'ai'
import { CenterPanel } from '@/components/center-panel'
import { SplitPane } from '@/components/split-pane'
import type { ActivityEvent } from '@/lib/chat-history'

type AgentStatus = 'online' | 'thinking' | 'streaming' | 'idle'

function noop() {}
function noopStr(_s: string) {}

export default function SplitPage() {
  // Each pane gets independent status + message state
  const [leftStatus, setLeftStatus] = useState<AgentStatus>('idle')
  const [rightStatus, setRightStatus] = useState<AgentStatus>('idle')
  const [leftMessages, setLeftMessages] = useState<UIMessage[]>([])
  const [rightMessages, setRightMessages] = useState<UIMessage[]>([])

  const handleSaveLeft = useCallback((msgs: UIMessage[], _model: string) => {
    setLeftMessages(msgs)
  }, [])

  const handleSaveRight = useCallback((msgs: UIMessage[], _model: string) => {
    setRightMessages(msgs)
  }, [])

  return (
    <SplitPane
      storageKey="golem.splitRatio.v1"
      left={
        <CenterPanel
          paneId="left"
          agentStatus={leftStatus}
          setAgentStatus={setLeftStatus}
          initialMessages={leftMessages}
          conversationCount={0}
          lastResponseMs={null}
          onSaveMessages={handleSaveLeft}
          onActivity={noop as (e: Omit<ActivityEvent, 'id'>) => void}
          onStreamUpdate={noopStr}
          onModelChange={noopStr}
        />
      }
      right={
        <CenterPanel
          paneId="right"
          agentStatus={rightStatus}
          setAgentStatus={setRightStatus}
          initialMessages={rightMessages}
          conversationCount={0}
          lastResponseMs={null}
          onSaveMessages={handleSaveRight}
          onActivity={noop as (e: Omit<ActivityEvent, 'id'>) => void}
          onStreamUpdate={noopStr}
          onModelChange={noopStr}
        />
      }
    />
  )
}
