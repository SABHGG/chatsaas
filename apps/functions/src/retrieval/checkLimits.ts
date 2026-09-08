import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'
import { GetCommand } from '@aws-sdk/lib-dynamodb'
import { RetrievalError, type LimitCheckResult } from './types.js'

/**
 * ADR-005 business rules (pure decision, no I/O beyond the two reads):
 *  - no active subscription → 402 `no_active_subscription`
 *  - monthly usage >= 100% of plan limit → 402 hard block (DC-006-5: no
 *    soft-warning); conversation count is capped (counters lag)
 *  - >= 80% used → allowed, caller must surface `x-credit-alert: 80%` header
 *  - credit path (prepaid opted in): balance >= 1 required to allow
 */
export interface LimitSnapshot {
  monthlyUsed: number
  monthlyLimit: number
  /** Prepaid credit balance; only meaningful when `creditsOptedIn`. */
  creditBalance: number
  /** Whether the company opted into prepaid credits (ADR-005). */
  creditsOptedIn: boolean
}

export interface CheckLimitsInput {
  snapshot: LimitSnapshot
  companyId: string
}

/**
 * Pure function: allow / 402 / credit-path decision from the 80%/100% matrix.
 * Throws a typed `RetrievalError` when blocked:
 *  - `monthly_limit_exhausted` (402)
 *  - `no_active_subscription` (402)
 *  - `prepaid_credits_exhausted` (402, credit path only)
 */
export function checkLimits(input: CheckLimitsInput): LimitCheckResult {
  const { snapshot } = input

  if (snapshot.monthlyLimit <= 0) {
    throw new RetrievalError(
      'no_active_subscription',
      `Company ${input.companyId} has no active subscription or plan limit`,
    )
  }
  if (snapshot.monthlyUsed >= snapshot.monthlyLimit) {
    // Hard 402 at 100% (DC-006-5). No soft-warning path.
    throw new RetrievalError(
      'monthly_limit_exhausted',
      `Company ${input.companyId} reached its monthly conversation limit (${snapshot.monthlyUsed}/${snapshot.monthlyLimit})`,
    )
  }
  if (snapshot.creditsOptedIn && snapshot.creditBalance < 1) {
    throw new RetrievalError(
      'prepaid_credits_exhausted',
      `Company ${input.companyId} opted into prepaid credits but the balance is ${snapshot.creditBalance}`,
    )
  }

  const used = snapshot.monthlyUsed
  const limit = snapshot.monthlyLimit
  const result: LimitCheckResult = {
    allowed: true,
    monthlyUsed: used,
    monthlyLimit: limit,
  }
  if (snapshot.creditsOptedIn) {
    result.creditsRemaining = snapshot.creditBalance
  }
  // 80% alert: used >= 80% of the limit but still under 100%.
  if (used * 5 >= limit * 4) {
    result.alert80 = true
  }
  return result
}

/**
 * Response header surfaced when the 80% threshold is crossed.
 */
export const CREDIT_ALERT_HEADER = 'x-credit-alert'
export const CREDIT_ALERT_VALUE = '80%'

/**
 * Reads the Subscription + CreditBalance rows and produces the snapshot for
 * `checkLimits`. Missing rows map to conservative defaults (no subscription /
 * zero credits) so `checkLimits` decides the 402.
 */
export async function loadLimitSnapshot(
  ddb: DynamoDBDocumentClient,
  tables: { subscriptionsTable: string; creditsTable: string },
  companyId: string,
): Promise<LimitSnapshot> {
  const [subResp, creditsResp] = await Promise.all([
    ddb.send(new GetCommand({ TableName: tables.subscriptionsTable, Key: { id: companyId } })),
    ddb.send(new GetCommand({ TableName: tables.creditsTable, Key: { id: companyId } })),
  ])

  const sub = subResp.Item as
    | { status?: string; monthlyLimit?: number; monthlyUsed?: number }
    | undefined
  const active =
    sub && (sub.status === undefined || sub.status === 'active') && typeof sub.monthlyLimit === 'number'

  const credits = creditsResp.Item as { balance?: number; creditsOptedIn?: boolean } | undefined

  return {
    // Usage counter rides on the subscription row; absent = 0 (nightly
    // aggregation job owns the authoritative monthly rollup).
    monthlyUsed: typeof sub?.monthlyUsed === 'number' ? sub.monthlyUsed : 0,
    monthlyLimit: active ? (sub!.monthlyLimit as number) : 0,
    creditBalance: credits?.balance ?? 0,
    creditsOptedIn: credits?.creditsOptedIn === true,
  }
}
