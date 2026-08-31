// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { ApiError } from '@/lib/api-errors'
import { ALMOST_OUT_LABEL, ON_HOLD_LABEL, UsageMeter } from './usage-meter'

/**
 * WI-007 Task 7: threshold surfaces read in line vocabulary —
 * 80% → 'Almost out of credits', 100%/zero balance/429 → 'On hold'.
 */
describe('UsageMeter', () => {
  afterEach(cleanup)

  it('stays quiet below the 80% threshold', () => {
    render(<UsageMeter planName="Starter" monthlyLimit={100} used={79} prepaidBalance={40} />)
    expect(screen.queryByTestId('usage-status')).toBeNull()
  })

  it('surfaces "Almost out of credits" at the 80% threshold', () => {
    render(<UsageMeter planName="Starter" monthlyLimit={100} used={80} prepaidBalance={40} />)
    expect(screen.getByTestId('usage-status').textContent).toBe(ALMOST_OUT_LABEL)
    expect(ALMOST_OUT_LABEL).toBe('Almost out of credits')
  })

  it('surfaces "On hold" when the plan is exhausted (100%)', () => {
    render(<UsageMeter planName="Starter" monthlyLimit={100} used={100} prepaidBalance={40} />)
    expect(screen.getByTestId('usage-status').textContent).toBe(ON_HOLD_LABEL)
    expect(ON_HOLD_LABEL).toBe('On hold')
  })

  it('surfaces "On hold" on a zero prepaid balance', () => {
    render(<UsageMeter planName="Starter" monthlyLimit={100} used={10} prepaidBalance={0} />)
    expect(screen.getByTestId('usage-status').textContent).toBe(ON_HOLD_LABEL)
  })

  it('renders "On hold" on a 429 from the API', () => {
    render(
      <UsageMeter
        planName="Starter"
        monthlyLimit={100}
        used={10}
        error={new ApiError(429, 'RATE_LIMIT_ERROR', 'On hold')}
      />,
    )
    expect(screen.getByTestId('usage-status').textContent).toBe('On hold')
  })

  it('renders the plan readout with tabular numerals and no status label under 80%', () => {
    render(<UsageMeter planName="Starter" monthlyLimit={100} used={12} prepaidBalance={5} />)
    expect(screen.getByTestId('usage-plan').textContent).toBe('Starter · 12 / 100')
    expect(screen.getByTestId('usage-prepaid').textContent).toBe('Prepaid 5')
    expect(screen.queryByTestId('usage-status')).toBeNull()
  })

  it('fills the gauge channel proportionally and keeps it achromatic', () => {
    const { container } = render(
      <UsageMeter planName="Starter" monthlyLimit={100} used={40} prepaidBalance={5} />,
    )
    const fill = container.querySelector('[data-testid="usage-fill"]') as HTMLElement
    expect(fill.style.width).toBe('40%')
    expect(fill.className).not.toContain('patch-amber')
  })
})
