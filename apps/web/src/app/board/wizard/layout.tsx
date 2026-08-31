'use client'

import { usePathname } from 'next/navigation'
import { Stepper, type WizardStepId } from '@/components/stepper'

/**
 * The wizard shell (WI-007 Task 11): the 4-step indicator plus the step
 * panel. The client shell reads the route to know the current step —
 * the server layout cannot, because the step lives in the URL.
 *
 * Layout contract (DESIGN.md): all four steps occupy the SAME vertical
 * space — the panel below reserves one fixed min-height and the footer
 * controls sit at its end, so nothing shifts as the operator moves
 * name → documents → review → publish.
 */

const STEP_BY_PATH: Record<string, WizardStepId> = {
  '/board/wizard': 'name',
  '/board/wizard/documents': 'documents',
  '/board/wizard/review': 'review',
  '/board/wizard/publish': 'publish',
}

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const current = STEP_BY_PATH[pathname] ?? 'name'

  return (
    <section aria-label="Create a new line" className="flex flex-col">
      <Stepper current={current} />
      {/* One fixed vertical space for every step — nothing shifts. */}
      <div data-testid="wizard-panel" className="mt-8 flex min-h-[26rem] flex-col">
        {children}
      </div>
    </section>
  )
}
