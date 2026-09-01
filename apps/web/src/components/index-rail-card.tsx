import Link from 'next/link'
import { LINE_STATE_LABELS, type LineState } from './line-state-pill'

/**
 * The index card of the rail (locked direction "The Index Rail"): the
 * line's name as an engraved-plate label (Jack Label Rule) plus a state
 * lamp — selectable, with the selection carried by the URL
 * (`?line=<chatbotId>`), so deep links and the wizard landing work.
 *
 * Lamp discipline (Live Line Rule): Patch Amber appears ONLY when the
 * line is live; every other state is an achromatic tonal treatment.
 * Flat-by-Default: the lamp is a plain dot — the live-jack shadow stays
 * reserved for the lit jack (detail pane, embed panel, wizard), never
 * the rail lamp.
 */
export interface IndexRailCardProps {
  id: string
  name: string
  lineState: LineState
  selected?: boolean
}

/** Lamp treatment per line state — amber only for live (no green/red). */
const LAMP: Record<LineState, string> = {
  unplugged: 'bg-slate-ink',
  connecting: 'animate-pulse bg-slate-ink/50',
  live: 'bg-patch-amber',
  'on hold': 'bg-slate-ink/40',
}

export function IndexRailCard({ id, name, lineState, selected = false }: IndexRailCardProps) {
  return (
    <Link
      href={`/board?line=${encodeURIComponent(id)}`}
      data-testid="board-line-link"
      data-line-state={lineState}
      aria-current={selected ? 'true' : undefined}
      title={name}
      className={`flex w-44 items-center gap-3 rounded-card border px-4 py-3 transition-colors duration-150 motion-reduce:transition-none lg:w-full ${
        selected
          ? 'border-slate-ink bg-well-warm'
          : 'border-hairline-slate bg-panel-warm hover:bg-well-warm'
      }`}
    >
      {/* The state lamp — a plain dot; amber only when the line is live. */}
      <span
        aria-hidden
        data-testid="rail-lamp"
        className={`size-2.5 shrink-0 rounded-jack ${LAMP[lineState]}`}
      />

      {/* Engraved-plate line label (Jack Label Rule: short, machine-precise). */}
      <span
        data-testid="rail-name"
        className="min-w-0 truncate font-mono text-sm font-medium uppercase tracking-plate text-slate-ink"
      >
        {name}
      </span>

      {/* Screen-reader line: the lamp is decorative, the state is spoken. */}
      <span className="sr-only">
        {name} — {LINE_STATE_LABELS[lineState]}
      </span>
    </Link>
  )
}
