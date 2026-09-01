import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { OperatorProvider } from '@/components/operator-context'
import { UsageSlot } from '@/components/usage-slot'

/**
 * The board shell (WI-007, redesigned per the locked direction
 * "The Index Rail"): a compact engraved-plate header — product name and
 * the board name, no tagline clutter — shared by the board, the wizard,
 * and the plan page. The usage meter lives at the rail's foot on the
 * board itself (RailUsage); below lg, where the rail collapses to a
 * strip, the credits pill and the plan link ride this header instead.
 * The layout is a Server Component.
 */
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <OperatorProvider operatorId={session.sub}>
      <header className="border-b border-hairline-slate bg-operators-ivory">
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 py-4 sm:gap-4">
          <Link
            href="/board"
            className="min-w-0 font-mono text-sm font-semibold uppercase tracking-plate text-slate-ink hover:text-slate-ink/70"
          >
            chatSaaS
          </Link>

          {/* Engraved divider, then the board name as its plate. Below sm
              the plate stands down: on a phone width the wordmark plus
              the credits pill are the load-bearing marks, and the pill
              must always clear the right gutter (min-w-0 lets the
              shrinkable children yield instead of clipping it). */}
          <span aria-hidden className="hidden h-4 w-px bg-hairline-slate sm:block" />
          <p className="hidden min-w-0 font-mono text-xs font-medium uppercase tracking-plate text-slate-ink sm:block">
            Operator&rsquo;s Board
          </p>

          {/* Below lg the rail collapses to a strip: the plan link and
              the compact credits pill ride the header so the operator's
              state stays in the first viewport. */}
          <nav aria-label="Board" className="ml-auto flex min-w-0 items-center gap-3 sm:gap-4 lg:hidden">
            <Link
              href="/board/plan"
              className="font-mono text-xs uppercase tracking-plate text-slate-ink hover:text-slate-ink/70"
            >
              Plan
            </Link>
            <UsageSlot />
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
    </OperatorProvider>
  )
}
