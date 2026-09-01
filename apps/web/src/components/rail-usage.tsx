'use client'

import { useEffect, useState } from 'react'
import { creditBalanceSchema } from '@/lib/api-schemas'
import { proxyRequest } from '@/lib/bff-request'
import { ApiError, asApiError } from '@/lib/api-errors'
import { useHydrated } from '@/lib/use-hydrated'
import { UsageMeter } from './usage-meter'

/**
 * The rail-bottom usage meter (locked direction "The Index Rail"): the
 * company credits instrument, permanently on at the foot of the index.
 * It fetches the prepaid credit balance through the BFF proxy after
 * hydration (DC-007-5 — the slot never reads server state that could
 * differ across the boundary), the same usage-slot pattern as the old
 * header slot, rehomed to the rail.
 *
 * The `usage-slot` testid rides along: this island IS the board's usage
 * slot now — the header keeps only the compact pill below lg, where the
 * rail collapses to a strip.
 */
export function RailUsage() {
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

  return (
    <div data-testid="usage-slot">
      <UsageMeter monthlyLimit={0} used={0} prepaidBalance={balance} error={error} />
    </div>
  )
}
