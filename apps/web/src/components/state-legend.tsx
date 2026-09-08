import { LINE_STATE_LABELS, LINE_STATES, type LineState } from './line-state-pill'

/**
 * The level state legend: a fixed key to the four line states, pinned
 * at the rail's foot. It never moves while content changes — the
 * operator learns the grammar once and reads every strip against it.
 * Each swatch repeats the state's FORM (plain, dashed, stamp, bar),
 * never a hue alone.
 */
const SWATCH: Record<LineState, string> = {
  unplugged: 'border border-border bg-card',
  connecting: 'stamp-dashed',
  live: 'bg-stamp',
  'on hold': 'mt-1 h-1.5 w-3.5 bg-foreground',
}

export function StateLegend() {
  return (
    <div
      data-testid="state-legend"
      aria-label="Line states"
      className="sticky bottom-0 hidden border-t border-border bg-background pt-4 pb-1 lg:block"
    >
      <p className="label-mono text-muted-foreground">States</p>
      <ul className="mt-3 flex flex-col gap-1.5">
        {LINE_STATES.map((state) => (
          <li key={state} className="flex items-center gap-2.5">
            <span aria-hidden className={`inline-block size-3 shrink-0 ${SWATCH[state]}`} />
            <span className="label-mono text-foreground">{LINE_STATE_LABELS[state]}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
