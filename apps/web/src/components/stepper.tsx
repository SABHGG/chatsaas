import type { ReactNode } from 'react'

/**
 * The guided create flow: four discrete steps — name → documents →
 * review → publish — rendered as the plan's sections on the flight-plan
 * filing form. The wizard owns the step state; the stepper only
 * renders it.
 *
 * Emphasis discipline: the CURRENT section carries the primary (ink)
 * emphasis — a filled square waypoint; completed sections are a tonal
 * step of the ink; future sections stay quiet (hairline). Waypoints are
 * squared, like everything on the board.
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
  complete: 'border-foreground/40 bg-foreground/40',
  current: 'border-primary bg-primary',
  future: 'border-border bg-transparent',
}

const STEP_LABEL: Record<'complete' | 'current' | 'future', string> = {
  complete: 'text-foreground',
  current: 'text-primary font-medium',
  future: 'text-muted-foreground',
}

/** The rule between sections: solid once filed, quiet ahead. */
function Cord({ wired }: { wired: boolean }) {
  return (
    <span
      aria-hidden
      className={`h-px flex-1 ${wired ? 'bg-foreground/40' : 'bg-border'}`}
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
              {/* The section waypoint — a small square, ink only when
                  current. */}
              <span
                aria-hidden
                data-testid={`stepper-dot-${step.id}`}
                className={`size-3.5 shrink-0 border-2 ${STEP_DOT[phase]}`}
              />
              {index < last && <Cord wired={phase !== 'future'} />}
            </div>
            <span className={`label-mono mt-2 block ${STEP_LABEL[phase]}`}>
              {step.label}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
