import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { OperatorProvider } from '@/components/operator-context'
import { UsageSlot } from '@/components/usage-slot'

/**
 * The board shell (WI-007): product name, the usage-meter slot, and the
 * panel nav — shared by "Your lines", the wizard, detail, and the plan
 * page. The layout is a Server Component; the meter slot is a client
 * island that fetches its own balance through the BFF proxy after
 * hydration (DC-007-5).
 */
export default async function BoardLayout({ children }: { children: React.ReactNode }) {
  const session = await requireSession()

  return (
    <OperatorProvider operatorId={session.sub}>
      <header className="border-b border-hairline-slate bg-operators-ivory">
        {/* Mobile rows are tight: the compact credits pill shares this row
            below sm, so the gaps tighten until there is room for it. */}
        <div className="mx-auto flex w-full max-w-5xl items-center gap-3 px-6 py-4 sm:gap-6">
          <Link
            href="/board"
            className="font-mono text-sm font-semibold uppercase tracking-plate text-slate-ink"
          >
            chatSaaS
          </Link>
          <span
            aria-hidden
            className="hidden font-mono text-xs uppercase tracking-plate text-slate-ink/70 sm:block"
          >
            Operator&rsquo;s Board
          </span>

          <nav aria-label="Board" className="ml-auto flex items-center gap-3 sm:gap-6">
            <Link
              href="/board"
              className="font-mono text-xs uppercase tracking-plate text-slate-ink hover:text-slate-ink/70"
            >
              Your lines
            </Link>
            <Link
              href="/board/plan"
              className="font-mono text-xs uppercase tracking-plate text-slate-ink hover:text-slate-ink/70"
            >
              Plan
            </Link>
          </nav>

          <UsageSlot />
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 py-10">{children}</main>
    </OperatorProvider>
  )
}
