import Link from 'next/link'
import { asApiError, ApiError } from '@/lib/api-errors'
import { getAccessToken, requireSession } from '@/lib/auth'
import { creditBalanceSchema, planListSchema, planPriceLabel, type Plan } from '@/lib/api-schemas'
import { apiRequest } from '@/lib/api-client'
import { UsageMeter } from '@/components/usage-meter'
import { ContactModal } from '@/components/contact-modal'

/**
 * Plan + credits (WI-007 Task 14): the read-only plan view, the credits
 * meter, and the prepayment path — which is the DC-007-3 "Contact us"
 * modal placeholder, NOT a checkout. Data rides server-side Bearer
 * calls; a 429 renders the line-vocabulary 'On hold'.
 *
 * Data honesty: the contract has no current-subscription GET, so the
 * meter shows the prepaid balance (the only credit figure the API
 * exposes) and the plan list is what `GET /api/plans/available` returns.
 */
export default async function PlanPage() {
  await requireSession()
  const accessToken = await getAccessToken()

  let plans: Plan[] | null = null
  let plansError: ApiError | null = null
  try {
    // The backend already filters to active plans server-side.
    plans = await apiRequest('/plans/available', { dataSchema: planListSchema, accessToken })
  } catch (err) {
    plansError = asApiError(err)
  }

  let balance: number | null = null
  let meterError: ApiError | null = null
  try {
    const data = await apiRequest('/credits/balance', { dataSchema: creditBalanceSchema, accessToken })
    balance = data.balance
  } catch (err) {
    meterError = asApiError(err)
  }

  const availablePlans = plans ?? []

  return (
    <section aria-label="Plan and credits">
      <h1 className="text-3xl font-semibold tracking-tight text-slate-ink">Plan &amp; credits</h1>
      <p className="mt-2 max-w-lg text-sm leading-relaxed text-slate-ink/70">
        Every conversation costs one credit. The plan covers the month; prepaid credits keep you
        live past it.
      </p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div>
          <h2 className="font-mono text-xs uppercase tracking-plate text-slate-ink">Plans</h2>
          {plansError ? (
            plansError.status === 429 ? (
              <p data-testid="plans-on-hold" className="mt-3 text-sm text-slate-ink/70">
                On hold — the board is holding plan reads right now.
              </p>
            ) : (
              <p role="alert" className="mt-3 text-sm text-slate-ink/70">
                {plansError.message}
              </p>
            )
          ) : availablePlans.length === 0 ? (
            <p className="mt-3 text-sm leading-relaxed text-slate-ink/70">
              No plans are open right now. Contact us to get on the board.
            </p>
          ) : (
            <ul className="mt-3 flex flex-col gap-3">
              {availablePlans.map((plan) => (
                <li
                  key={plan.id}
                  data-testid="plan-row"
                  className="flex items-center justify-between gap-6 rounded-card border border-hairline-slate bg-panel-warm px-5 py-4"
                >
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-slate-ink">{plan.name}</h3>
                    <p className="mt-1 text-sm text-slate-ink/60">
                      {plan.description ?? 'Every conversation costs one credit.'}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-slate-ink">
                    {planPriceLabel(plan)}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-8">
            <ContactModal />
          </div>
        </div>

        <aside>
          <UsageMeter monthlyLimit={0} used={0} prepaidBalance={balance} error={meterError} />
          {meterError && meterError.status !== 429 && (
            <p role="alert" className="mt-3 text-sm text-slate-ink/70">
              {meterError.message}
            </p>
          )}
          <p className="mt-4 text-sm leading-relaxed text-slate-ink/70">
            Out of credits puts a line{' '}
            <Link href="/board" className="underline underline-offset-4">
              on hold
            </Link>{' '}
            until the plan tops up.
          </p>
        </aside>
      </div>
    </section>
  )
}
