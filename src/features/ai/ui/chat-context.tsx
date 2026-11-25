import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import type { Estimate } from '@/shared/domain/types'

import type { ClientProposal, ClientProposalProgress } from '../domain/chat-tools'
import { AiChatPanel } from './chat-panel'

export type DraftTarget = {
  estimate: Estimate
  apply: (patch: Partial<Estimate>) => void
  isNew: boolean
}
export type ClientProgress = {
  id: string
  values: ClientProposalProgress
  streaming: boolean
  stop: () => void
}
type ChatContextValue = {
  open: (prompt?: string) => void
  setEstimate: (target: DraftTarget | null) => void
  estimate: DraftTarget | null
}

const ChatContext = createContext<ChatContextValue | null>(null)

export function useAiChat() {
  return useContext(ChatContext)
}

export function AiChatProvider({
  children,
  tenantId,
  userId,
  onCreateClient,
  onClientProgress,
  completedClientProposalId,
}: {
  children: ReactNode
  tenantId: string
  userId: string
  onCreateClient: (proposal: ClientProposal, proposalId: string) => void
  onClientProgress: (progress: ClientProgress) => void
  completedClientProposalId: string | null
}) {
  const [open, setOpen] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [estimate, setEstimate] = useState<DraftTarget | null>(null)
  const identity = useRef(`${tenantId}:${userId}`)
  useEffect(() => {
    const next = `${tenantId}:${userId}`
    if (identity.current !== next) {
      identity.current = next
      setOpen(false)
      setEstimate(null)
      setPrompt('')
    }
  }, [tenantId, userId])

  return (
    <ChatContext.Provider
      value={{
        open: (value = '') => {
          setPrompt(value)
          setOpen(true)
        },
        setEstimate,
        estimate,
      }}
    >
      {children}
      <AiChatPanel
        key={`${tenantId}:${userId}`}
        open={open}
        onOpenChange={setOpen}
        prompt={prompt}
        onPromptUsed={() => setPrompt('')}
        tenantId={tenantId}
        userId={userId}
        onCreateClient={onCreateClient}
        onClientProgress={onClientProgress}
        completedClientProposalId={completedClientProposalId}
        target={estimate}
      />
    </ChatContext.Provider>
  )
}
