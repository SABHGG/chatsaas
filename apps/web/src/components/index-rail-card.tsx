import Link from 'next/link'
import { LINE_STATE_LABELS, type LineState } from './line-state-pill'

/**
 * A flight strip in the rack: the line's paper strip — name on top,
 * mono document readout, and the state stamp — selectable, with the
 * selection carried by the URL (`?line=<chatbotId>`), so deep links
 * and the wizard landing work.
 *
 * Strip discipline: the stamp appears only when the line is live; a
 * connecting line carries the dashed stamp outline with the ONE
 * chase-light; an unplugged strip shows the plain state word; a held
 * strip is crossed by the full-width HOLD bar. The selected strip is
 * the one PULLED from the rack — offset toward the workspace and
 * lifted on a soft shadow, no rotation.
 */
export interface IndexRailCardProps {
  id: string
  name: string
  lineState: LineState
  selected?: boolean
  /** Documents wired into the line — the strip's mono readout. */
  documentCount?: number
}

/**
 * The stamp treatment per line state. Live is the ONLY red stamp; the
 * unplugged strip stays plain; connecting rides the dash + chase.
 */
const STAMP: Record<LineState, string> = {
  unplugged: 'text-muted-foreground',
  connecting: 'stamp-dashed chase-pulse px-1.5 text-foreground',
  live: 'bg-stamp px-1.5 text-primary-foreground',
  'on hold': 'text-muted-foreground',
}

export function IndexRailCard({
  id,
  name,
  lineState,
  selected = false,
  documentCount,
}: IndexRailCardProps) {
  const isLive = lineState === 'live'
  const isHeld = lineState === 'on hold'

  return (
    <Link
      href={`/board?line=${encodeURIComponent(id)}`}
      data-testid="board-line-link"
      data-line-state={lineState}
      aria-current={selected ? 'true' : undefined}
      title={name}
      className={`relative flex w-44 shrink-0 flex-col gap-2.5 border bg-card px-3.5 py-3 text-card-foreground outline-none transition-[border-color,transform,box-shadow] duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 motion-reduce:transition-none lg:w-full ${
        selected
          ? 'z-10 border-foreground/70 shadow-strip-pull lg:translate-x-2'
          : 'border-border hover:border-foreground/40'
      }`}
    >
      {/* The clip: every strip hangs from the rack by this bar. */}
      <span aria-hidden className="absolute -top-px left-3 h-1 w-7 bg-foreground/60" />

      {/* The line label — doubled rule underneath when the line is live
          (doubling = live; the state never rides hue alone). */}
      <span
        data-testid="rail-name"
        className={`min-w-0 truncate text-sm font-medium ${isLive ? 'rule-doubled' : ''}`}
      >
        {name}
      </span>

      {/* The document readout — a monospaced instrument figure. */}
      <span className="readout-mono text-[0.6875rem] text-muted-foreground">
        Docs <span className="text-foreground">{documentCount ?? 0}</span>
      </span>

      {/* The state row: stamp when live, dash when connecting, plain
          word otherwise. On hold renders no stamp — the bar crosses. */}
      {isHeld ? (
        <span className="flex h-4 items-end">
          <span data-testid="rail-lamp" className={`label-mono ${STAMP[lineState]}`}>
            {LINE_STATE_LABELS[lineState]}
          </span>
        </span>
      ) : (
        <span
          data-testid="rail-lamp"
          aria-hidden
          className={`label-mono self-start ${STAMP[lineState]}`}
        >
          {LINE_STATE_LABELS[lineState]}
        </span>
      )}

      {isHeld && <span aria-hidden className="hold-bar">Hold</span>}

      {/* Screen-reader line: the stamp is decorative, the state is
          spoken once, with the name. */}
      <span className="sr-only">
        {name} — {LINE_STATE_LABELS[lineState]}
      </span>
    </Link>
  )
}
