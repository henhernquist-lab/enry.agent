'use client'

import { useState } from 'react'
import { LeftSidebar, CenterPanel, RightPanel, GridBackground, CornerAccents } from '@/components/components'

export default function EnryAgentPage() {
  const [agentStatus, setAgentStatus] = useState<'online' | 'thinking' | 'executing' | 'idle'>('online')

  return (
    <div className="relative flex h-screen w-full overflow-hidden bg-surface-base">
      {/* Background Effects */}
      <GridBackground />
      <CornerAccents />
      
      {/* Main Layout */}
      <div className="relative z-10 flex h-full w-full">
        {/* Left Sidebar - 280px */}
        <LeftSidebar agentStatus={agentStatus} />
        
        {/* Center Panel - Flexible */}
        <CenterPanel agentStatus={agentStatus} setAgentStatus={setAgentStatus} />
        
        {/* Right Panel - 320px */}
        <RightPanel />
      </div>
    </div>
  )
}
