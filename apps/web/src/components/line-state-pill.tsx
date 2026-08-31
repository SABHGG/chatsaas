/**
 * The line vocabulary (ADR-007): every bot reads as a line state, never
 * a generic status widget. These four strings are the binding UI labels.
 *
 * Color discipline (Live Line Rule): Patch Amber marks only the live
 * line. Connecting / On hold / Unplugged are achromatic, tonal
 * treatments (Flat-by-Default).
 */
export type LineState = 'unplugged' | 'connecting' | 'live' | 'on hold'

/** The binding operator-facing labels (WI-007 Task 6). */
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

/**
 * The engraved-plate state label: mono, letter-spaced, hairline border.
 * The live state is the only one that carries Patch Amber (border, label,
 * dot); the rest stay achromatic so amber keeps its rarity.
 */
export function LineStatePill({ state }: LineStatePillProps) {
  const isLive = state === 'live'
  const isConnecting = state === 'connecting'

  return (
    <span
      data-line-state={state}
      data-testid="line-state-pill"
      className={`inline-flex items-center gap-2 rounded-plate border px-2.5 py-1 font-mono text-xs uppercase tracking-plate ${
        isLive
          ? 'border-patch-amber text-patch-amber-deep'
          : 'border-hairline-slate text-slate-ink'
      }`}
    >
      {/* State dot — the accent's presence IS the live signal (no green/red). */}
      <span
        aria-hidden
        className={`size-1.5 rounded-jack ${
          isLive
            ? 'bg-patch-amber'
            : isConnecting
              ? 'animate-pulse bg-slate-ink/70'
              : 'bg-slate-ink/40'
        }`}
      />
      {LINE_STATE_LABELS[state]}
    </span>
  )
}
