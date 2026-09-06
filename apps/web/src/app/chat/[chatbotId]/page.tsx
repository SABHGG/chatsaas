import type { Metadata } from 'next'
import { cache } from 'react'
import { fetchPublicChatbot } from '@/lib/chat-public'
import { ChatClient } from './chat-client'
import { ChatUnavailable } from './chat-unavailable'

/**
 * The public visitor chat page (WI-009 T-02): the URL and the iframe
 * target that publish hands out. Anonymous by design — the public GET is
 * the only data source, and it only ever answers for a published bot.
 *
 * Every "not available" case (unknown id, draft/archived, unreachable
 * API, malformed body) renders the same neutral state — existence of
 * unpublished bots is never leaked and no status code ever surfaces (R-6).
 *
 * `force-dynamic` + `no-store`: the page must never prerender against a
 * build-time snapshot of the backend.
 */
export const dynamic = 'force-dynamic'

// One GET per request: metadata and the page share the same result.
const loadChatbot = cache(fetchPublicChatbot)

interface PublicChatPageProps {
  params: Promise<{ chatbotId: string }>
}

export async function generateMetadata({ params }: PublicChatPageProps): Promise<Metadata> {
  const { chatbotId } = await params
  const chatbot = await loadChatbot(chatbotId)
  // R-7: the public surface exposes only the chatbot's name — no company,
  // plan, or document metadata rides on this path.
  return { title: chatbot?.name ?? 'Assistant' }
}

export default async function PublicChatPage({ params }: PublicChatPageProps) {
  const { chatbotId } = await params
  const chatbot = await loadChatbot(chatbotId)
  if (!chatbot) {
    return <ChatUnavailable />
  }
  return (
    <main className="vchat-main">
      <ChatClient name={chatbot.name} chatbotId={chatbot.chatbotId} />
    </main>
  )
}
