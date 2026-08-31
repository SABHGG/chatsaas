'use client'

import { createContext, useContext, type ReactNode } from 'react'

/**
 * The operator identity for client-side drafts (WI-007 Task 9): the
 * wizard draft key is per-operator (`chatsaas:draft:<operatorId>:...`),
 * so wizard pages read the session's `sub` from this provider instead of
 * re-deriving it. The board layout (server) reads the session once and
 * feeds it here — the browser never receives a token, only the id.
 */

const OperatorContext = createContext<string | null>(null)

export function OperatorProvider({
  operatorId,
  children,
}: {
  operatorId: string
  children: ReactNode
}) {
  return <OperatorContext.Provider value={operatorId}>{children}</OperatorContext.Provider>
}

export function useOperatorId(): string {
  const operatorId = useContext(OperatorContext)
  if (!operatorId) {
    throw new Error('useOperatorId must be used inside <OperatorProvider>')
  }
  return operatorId
}
