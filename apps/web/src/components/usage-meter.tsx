import { ApiError } from '@/lib/api-errors'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'

/**
 * The usage meter: plan + prepaid credits as panel instrumentation — a
 * gauge channel with an 80% boundary tick, not a marketing progress bar.
 *
 * Status surfaces read in line vocabulary:
 * - used ≥ 80% of the plan            → 'Almost out of credits'
 * - plan exhausted / zero balance 429 → 'On hold' (matches the line word)
 * - a 429 from the API                → 'On hold' (the API said it first)
 *
 * Emphasis discipline: the meter is instrumentation, not the live line —
 * the fill stays achromatic (bg-foreground) at every level. Alert states
 * speak through badges and copy, never through green/red.
 */
export interface UsageMeterProps {
  /** Plan name (e.g. 'Starter'); null/undefined when the line has no plan yet. */
  planName?: string | null
  /** Monthly credits allocated by the plan. 0 → running on prepaid only. */
  monthlyLimit?: number
  /** Plan credits consumed this period. */
  used?: number
  /** Prepaid credit balance (GET /api/credits/balance). */
  prepaidBalance?: number | null
  /** The ApiError from the balance/usage fetch — 429 renders 'On hold'. */
  error?: ApiError | null
}

type MeterStatus = 'ok' | 'almost-out' | 'on-hold'

export const ALMOST_OUT_LABEL = 'Almost out of credits'
export const ON_HOLD_LABEL = 'On hold'

export function UsageMeter({ planName, monthlyLimit = 0, used = 0, prepaidBalance, error }: UsageMeterProps) {
  const loading = error == null && prepaidBalance == null
  const status = meterStatus({ monthlyLimit, used, prepaidBalance, error })
  const hasReadings = !loading && error == null
  const ratio = monthlyLimit > 0 ? Math.min(1, used / monthlyLimit) : 0

  return (
    <section
      data-testid="usage-meter"
      aria-label="Credits"
      className="border border-border bg-card p-5 text-card-foreground"
    >
      <div className="flex items-baseline justify-between gap-4">
        <h3 className="label-mono text-foreground">Credits</h3>
        {status !== 'ok' && (
          <Badge
            data-testid="usage-status"
            variant={status === 'on-hold' ? 'destructive' : 'outline'}
          >
            {status === 'on-hold' ? ON_HOLD_LABEL : ALMOST_OUT_LABEL}
          </Badge>
        )}
      </div>

      {/* The gauge channel: paper-dim track, ink fill, 80% tick. */}
      {hasReadings && (
        <div className="relative mt-4">
          <Progress
            data-testid="usage-channel"
            role="meter"
            aria-label="Monthly plan credits"
            aria-valuemin={0}
            aria-valuemax={Math.max(monthlyLimit, 1)}
            aria-valuenow={used}
            value={Math.round(ratio * 100)}
            indicatorClassName="bg-foreground"
            indicatorProps={{ 'data-testid': 'usage-fill' }}
          />
          <span
            aria-hidden
            className="absolute inset-y-0 left-[80%] w-px bg-foreground/40"
          />
        </div>
      )}

      <div className="readout-mono mt-3 flex items-baseline justify-between gap-4 text-xs">
        <span data-testid="usage-plan">
          {planName ?? 'No plan'} · {loading ? '— / —' : `${used} / ${monthlyLimit}`}
        </span>
        <span data-testid="usage-prepaid">
          Prepaid {prepaidBalance == null ? '—' : prepaidBalance}
        </span>
      </div>

      {status === 'on-hold' && (
        <p className="mt-2 text-sm text-muted-foreground">
          This line is on hold. Top up your plan to bring it back.
        </p>
      )}
      {status === 'almost-out' && (
        <p className="mt-2 text-sm text-muted-foreground">Add prepaid credits to stay live through the month.</p>
      )}
    </section>
  )
}

export function meterStatus(input: {
  monthlyLimit: number
  used: number
  prepaidBalance: number | null | undefined
  error: ApiError | null
}): MeterStatus {
  // The API said it first: a 429 IS the on-hold state.
  if (input.error?.status === 429) return 'on-hold'

  const planExhausted = input.monthlyLimit > 0 && input.used >= input.monthlyLimit
  const zeroBalance = input.prepaidBalance != null && input.prepaidBalance <= 0

  // 100% of the plan, or a zero prepaid balance, puts the line on hold.
  if (planExhausted || zeroBalance) return 'on-hold'

  if (input.monthlyLimit > 0 && input.used / input.monthlyLimit >= 0.8) return 'almost-out'
  return 'ok'
}
