'use client'

import { useEffect, useState } from 'react'
import { creditBalanceSchema } from '@/lib/api-schemas'
import { proxyRequest } from '@/lib/bff-request'
import { ApiError, asApiError } from '@/lib/api-errors'
import { useHydrated } from '@/lib/use-hydrated'
import { ALMOST_OUT_LABEL, ON_HOLD_LABEL, UsageMeter, meterStatus } from './usage-meter'

/**
 * The usage-meter slot in the board header (WI-007 Task 12 layout):
 * fetches the prepaid credit balance through the BFF proxy once the
 * component is hydrated (DC-007-5 — the slot never reads server state
 * that could differ across the boundary) and renders the shared
 * presentational meter with it.
 *
 * Data honesty: the API contract today exposes only the prepaid balance
 * (`GET /api/credits/balance`); there is no current-plan usage endpoint,
 * so the plan channel stays empty until the backend adds one. A 429
 * renders the line-vocabulary 'On hold' through the shared meter.
 */
export function UsageSlot() {
  const hydrated = useHydrated()
  const [balance, setBalance] = useState<number | null>(null)
  const [error, setError] = useState<ApiError | null>(null)

  useEffect(() => {
    if (!hydrated) return
    let cancelled = false
    proxyRequest('/credits/balance', { dataSchema: creditBalanceSchema })
      .then((data) => {
        if (cancelled) return
        setBalance(data.balance)
        setError(null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(asApiError(err))
      })
    return () => {
      cancelled = true
    }
  }, [hydrated])

  // The compact pill mirrors the meter's own status ladder (same inputs,
  // same verdict) so the two surfaces can never disagree on the line's
  // credits position.
  const status = meterStatus({ monthlyLimit: 0, used: 0, prepaidBalance: balance, error })
  let pillText = `Credits: ${balance ?? '—'}`
  if (status === 'almost-out' && balance != null) {
    pillText = `Credits: ${balance} · ${ALMOST_OUT_LABEL}`
  } else if (status === 'on-hold') {
    pillText = ON_HOLD_LABEL
  }

  return (
    <>
      <div data-testid="usage-slot" className="hidden w-64 shrink-0 md:block">
        <UsageMeter monthlyLimit={0} used={0} prepaidBalance={balance} error={error} />
      </div>
      {/* Small screens: the meter card is hidden below md, so the credits
          position rides the header as a compact ink pill (flat, no shadow)
          — the operator's credits state stays in the first viewport. */}
      <span
        data-testid="usage-slot-compact"
        className="inline-flex shrink-0 items-center rounded-plate bg-slate-ink px-2.5 py-1 font-mono text-xs uppercase tracking-plate text-operators-ivory md:hidden"
      >
        {pillText}
      </span>
    </>
  )
}
