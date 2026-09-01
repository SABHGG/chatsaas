'use client'

import { useEffect, useState } from 'react'
import { creditBalanceSchema } from '@/lib/api-schemas'
import { proxyRequest } from '@/lib/bff-request'
import { ApiError, asApiError } from '@/lib/api-errors'
import { useHydrated } from '@/lib/use-hydrated'
import { ALMOST_OUT_LABEL, ON_HOLD_LABEL, meterStatus } from './usage-meter'

/**
 * The compact credits pill in the board header (WI-007 Task 12 layout,
 * Index Rail revision): fetches the prepaid credit balance through the
 * BFF proxy once the component is hydrated (DC-007-5 — the pill never
 * reads server state that could differ across the boundary).
 *
 * Rehomed meter: on the board, the full usage meter now lives at the
 * rail's foot (RailUsage). This header pill covers the below-lg sizes —
 * where the rail collapses to a horizontal strip — so the operator's
 * credits position stays in the first viewport. It mirrors the meter's
 * status ladder exactly (same inputs, same verdict) so the two surfaces
 * can never disagree. A 429 renders the line-vocabulary 'On hold'.
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
    <span
      data-testid="usage-slot-compact"
      className="inline-flex shrink-0 items-center rounded-plate bg-slate-ink px-2.5 py-1 font-mono text-xs uppercase tracking-plate text-operators-ivory lg:hidden"
    >
      {pillText}
    </span>
  )
}
