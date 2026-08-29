import { describe, it, expect } from 'vitest'
import { checkLimits } from '../checkLimits'
import { RetrievalError } from '../types'

/**
 * ADR-005 / business.md matrix: 80% alert, 100% hard 402, prepaid credit
 * path, no-subscription path.
 */
const base = {
  monthlyUsed: 0,
  monthlyLimit: 100,
  creditBalance: 5,
  creditsOptedIn: false,
}

describe('checkLimits (pure matrix)', () => {
  it('allows a company well under the limit', () => {
    const r = checkLimits({ snapshot: { ...base, monthlyUsed: 10 }, companyId: 'c1' })
    expect(r.allowed).toBe(true)
    expect(r.alert80).toBeUndefined()
  })

  it('flags the 80% alert when used >= 80% of the limit', () => {
    const r = checkLimits({ snapshot: { ...base, monthlyUsed: 80 }, companyId: 'c1' })
    expect(r.allowed).toBe(true)
    expect(r.alert80).toBe(true)
  })

  it('flags the 80% alert just over the threshold (81/100)', () => {
    const r = checkLimits({ snapshot: { ...base, monthlyUsed: 81 }, companyId: 'c1' })
    expect(r.allowed).toBe(true)
    expect(r.alert80).toBe(true)
  })

  it('does not flag the alert under the threshold (79/100)', () => {
    const r = checkLimits({ snapshot: { ...base, monthlyUsed: 79 }, companyId: 'c1' })
    expect(r.allowed).toBe(true)
    expect(r.alert80).toBeUndefined()
  })

  it('hard-blocks with 402 at 100% (DC-006-5: no soft-warning)', () => {
    expect(() =>
      checkLimits({ snapshot: { ...base, monthlyUsed: 100 }, companyId: 'c1' }),
    ).toThrowError(RetrievalError)
    expect(() =>
      checkLimits({ snapshot: { ...base, monthlyUsed: 100 }, companyId: 'c1' }),
    ).toThrowError(/monthly conversation limit/)
    try {
      checkLimits({ snapshot: { ...base, monthlyUsed: 100 }, companyId: 'c1' })
    } catch (e) {
      expect((e as RetrievalError).code).toBe('monthly_limit_exhausted')
    }
  })

  it('blocks past 100% too', () => {
    expect(() =>
      checkLimits({ snapshot: { ...base, monthlyUsed: 101 }, companyId: 'c1' }),
    ).toThrowError(RetrievalError)
  })

  it('blocks with no_active_subscription when the limit is 0', () => {
    try {
      checkLimits({ snapshot: { ...base, monthlyLimit: 0 }, companyId: 'c1' })
      expect.unreachable()
    } catch (e) {
      expect((e as RetrievalError).code).toBe('no_active_subscription')
    }
  })

  it('credit path: allowed with positive balance when opted in', () => {
    const r = checkLimits({
      snapshot: { ...base, creditsOptedIn: true, creditBalance: 3 },
      companyId: 'c1',
    })
    expect(r.allowed).toBe(true)
    expect(r.creditsRemaining).toBe(3)
  })

  it('credit path: blocks with prepaid_credits_exhausted at balance 0', () => {
    try {
      checkLimits({
        snapshot: { ...base, creditsOptedIn: true, creditBalance: 0 },
        companyId: 'c1',
      })
      expect.unreachable()
    } catch (e) {
      expect((e as RetrievalError).code).toBe('prepaid_credits_exhausted')
    }
  })

  it('credit balance is ignored when the company did not opt in', () => {
    const r = checkLimits({
      snapshot: { ...base, creditsOptedIn: false, creditBalance: 0 },
      companyId: 'c1',
    })
    expect(r.allowed).toBe(true)
  })

  it('monthly limit still hard-blocks opted-in companies (DC-006-5)', () => {
    expect(() =>
      checkLimits({
        snapshot: { ...base, monthlyUsed: 100, creditsOptedIn: true, creditBalance: 50 },
        companyId: 'c1',
      }),
    ).toThrowError(RetrievalError)
  })
})
