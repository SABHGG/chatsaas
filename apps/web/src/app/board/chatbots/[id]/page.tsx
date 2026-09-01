import { redirect } from 'next/navigation'

/**
 * Route compatibility (locked direction "The Index Rail"): the old
 * detail route is a redirect into the pane — `/board?line=<id>`. The
 * wizard's landing target (`router.push('/board/chatbots/<id>')` at
 * publish) keeps working unchanged; the line's full detail now opens
 * beside the index on the board.
 *
 * Auth is enforced by the /board layout (session gate) and the
 * middleware matcher; an unknown id lands on the board's glance pane —
 * the board never dead-ends.
 */
export default async function ChatbotDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  redirect(`/board?line=${encodeURIComponent(id)}`)
}
