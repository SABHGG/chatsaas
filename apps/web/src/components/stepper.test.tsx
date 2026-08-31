// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { Stepper, WIZARD_STEPS } from './stepper'

/**
 * WI-007 Task 8: four steps — name → documents → review → publish.
 * The current step carries Patch Amber (primary-waypoint use);
 * completed steps are tonal, future steps hairline.
 */
describe('Stepper', () => {
  afterEach(cleanup)

  it('renders the four create-flow steps in order', () => {
    render(<Stepper current="documents" />)
    const labels = screen.getByTestId('stepper').textContent ?? ''
    expect(WIZARD_STEPS.map((step) => step.id)).toEqual(['name', 'documents', 'review', 'publish'])
    for (const step of WIZARD_STEPS) {
      expect(labels).toContain(step.label)
    }
  })

  it('marks the current step in Patch Amber and completed steps tonal', () => {
    render(<Stepper current="review" />)

    const current = screen.getByTestId('stepper-step-review')
    expect(current.getAttribute('data-state')).toBe('current')
    expect(screen.getByTestId('stepper-dot-review').className).toContain('patch-amber')

    const completed = screen.getByTestId('stepper-dot-name')
    expect(screen.getByTestId('stepper-step-name').getAttribute('data-state')).toBe('complete')
    expect(completed.className).not.toContain('patch-amber')

    const future = screen.getByTestId('stepper-step-publish')
    expect(future.getAttribute('data-state')).toBe('future')
    expect(screen.getByTestId('stepper-dot-publish').className).not.toContain('patch-amber')
  })

  it('sets aria-current on the current step only', () => {
    render(<Stepper current="name" />)
    expect(screen.getByTestId('stepper-step-name').getAttribute('aria-current')).toBe('step')
    for (const id of ['documents', 'review', 'publish']) {
      expect(screen.getByTestId(`stepper-step-${id}`).getAttribute('aria-current')).toBeNull()
    }
  })
})
