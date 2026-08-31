import type { ReactNode } from 'react'

/**
 * The guided create flow (WI-007 Task 8): four discrete steps —
 * name → documents → review → publish. The wizard owns the step state;
 * the stepper only renders it.
 *
 * Color discipline: the CURRENT step carries Patch Amber — the create
 * flow IS the plug path, a primary-waypoint use in the Live Line
 * Rule's spirit. Completed steps are tonal ink; future steps stay
 * hairline.
 */
export const WIZARD_STEPS = [
  { id: 'name', label: 'Name' },
  { id: 'documents', label: 'Documents' },
  { id: 'review', label: 'Review' },
  { id: 'publish', label: 'Publish' },
] as const

export type WizardStepId = (typeof WIZARD_STEPS)[number]['id']

export interface StepperProps {
  current: WizardStepId
}

const STEP_DOT: Record<'complete' | 'current' | 'future', string> = {
  complete: 'border-slate-ink bg-slate-ink',
  current: 'border-patch-amber bg-patch-amber',
  future: 'border-hairline-slate bg-transparent',
}

const STEP_LABEL: Record<'complete' | 'current' | 'future', string> = {
  complete: 'text-slate-ink',
  current: 'text-patch-amber-deep',
  future: 'text-slate-ink/70',
}

/** The cord between waypoints: solid once wired, hairline ahead. */
function Cord({ wired }: { wired: boolean }) {
  return (
    <span
      aria-hidden
      className={`h-px flex-1 ${wired ? 'bg-slate-ink' : 'bg-hairline-slate'}`}
    />
  )
}

export function Stepper({ current }: StepperProps) {
  const currentIndex = WIZARD_STEPS.findIndex((step) => step.id === current)
  const last = WIZARD_STEPS.length - 1

  return (
    <ol data-testid="stepper" aria-label="Create flow progress" className="flex w-full items-start">
      {WIZARD_STEPS.map((step, index) => {
        const phase: 'complete' | 'current' | 'future' =
          index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'future'

        return (
          <li
            key={step.id}
            data-testid={`stepper-step-${step.id}`}
            data-state={phase}
            aria-current={phase === 'current' ? 'step' : undefined}
            className={index < last ? 'flex-1' : 'shrink-0'}
          >
            <div className="flex items-center">
              {/* The waypoint jack — a small circle, Patch Amber only when current. */}
              <span
                aria-hidden
                data-testid={`stepper-dot-${step.id}`}
                className={`size-4 shrink-0 rounded-jack border-2 ${STEP_DOT[phase]}`}
              />
              {index < last && <Cord wired={phase !== 'future'} />}
            </div>
            <span
              className={`mt-2 block font-mono text-xs uppercase tracking-plate ${STEP_LABEL[phase]}`}
            >
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
