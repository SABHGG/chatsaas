import { Badge } from '@/components/ui/badge'

/**
 * The line vocabulary: every bot reads as a line state, never a generic
 * status widget. These four strings are the binding UI labels.
 *
 * Flight-strip grammar — state is carried by FORM, never by hue alone.
 * The pill is the quiet state word next to the stamp; each state owns a
 * distinct form: unplugged = plain hairline word, connecting = dashed
 * stamp outline, live = ink-solid word (the red LIVE stamp itself lives
 * on the strip/header, exactly one per surface), on hold = the red
 * hold-block (the destructive family — a held line is a blocked line).
 */
export type LineState = 'unplugged' | 'connecting' | 'live' | 'on hold'

/** The binding operator-facing labels. */
export const LINE_STATE_LABELS: Record<LineState, string> = {
  unplugged: 'Unplugged',
  connecting: 'Connecting',
  live: 'Live',
  'on hold': 'On hold',
}

/** All states in board order — the single source for iteration/tests. */
export const LINE_STATES: readonly LineState[] = ['unplugged', 'connecting', 'live', 'on hold']

export interface LineStatePillProps {
  state: LineState
}

/** Badge variant per line state — form carries the state, not hue. */
const STATE_VARIANT: Record<LineState, { variant: 'default' | 'secondary' | 'outline' | 'destructive' | 'ghost'; className?: string }> = {
  live: { variant: 'default' },
  connecting: { variant: 'ghost', className: 'stamp-dashed text-foreground' },
  unplugged: { variant: 'outline', className: 'text-muted-foreground' },
  'on hold': { variant: 'destructive' },
}

export function LineStatePill({ state }: LineStatePillProps) {
  const treatment = STATE_VARIANT[state]

  return (
    <Badge
      data-line-state={state}
      data-testid="line-state-pill"
      variant={treatment.variant}
      className={treatment.className}
    >
      {LINE_STATE_LABELS[state]}
    </Badge>
  )
}
