import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { Separator } from '@/components/ui/separator'
import { OperatorProvider } from '@/components/operator-context'
import { UsageSlot } from '@/components/usage-slot'

/**
 * The board shell: a compact header — product name and the board name —
 * shared by the board, the wizard, and the plan page. The usage meter
 * lives at the rail's foot on the board itself (RailUsage); below lg,
 * where the rail collapses to a strip, the credits pill and the plan
 * link ride this header instead. The layout is a Server Component.
 */
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <OperatorProvider operatorId={session.sub}>
      {/* First focusable element: the keyboard path straight to the pane
          content, skipping the header nav. */}
      <a
        href="#board-main"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:left-6 focus-visible:top-4 focus-visible:z-50 focus-visible:border focus-visible:border-foreground/70 focus-visible:bg-card focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:text-foreground"
      >
        Skip to content
      </a>
      <header className="border-b border-border bg-background">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 py-4 sm:gap-4">
          <Link
            href="/board"
            className="min-w-0 text-sm font-semibold tracking-tight text-foreground hover:text-foreground/70"
          >
            chatSaaS
          </Link>

          {/* Divider, then the tower name in the typewriter voice. Below
              sm it stands down: on a phone width the wordmark plus the
              credits pill are the load-bearing marks, and the pill must
              always clear the right gutter (min-w-0 lets the shrinkable
              children yield instead of clipping it). */}
          <Separator orientation="vertical" className="hidden h-4 sm:block" />
          <p className="label-mono hidden min-w-0 text-muted-foreground sm:block">
            Operator&rsquo;s Board
          </p>

          {/* Below lg the rail collapses to a strip: the plan link and
              the compact credits pill ride the header so the operator's
              state stays in the first viewport. */}
          <nav aria-label="Board" className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4 lg:hidden">
            <Link
              href="/board/plan"
              className="label-mono text-muted-foreground hover:text-foreground"
            >
              Plan
            </Link>
            <UsageSlot />
          </nav>
        </div>
      </header>

      <main id="board-main" className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
    </OperatorProvider>
  )
}
