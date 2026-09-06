'use client'

import { motion, useReducedMotion } from 'motion/react'
import { LineStatePill, LINE_STATE_LABELS, type LineState } from './line-state-pill'

/**
 * The pulled strip's record header: the line name with its state stamp
 * on the leading edge and the quiet state word on the trailing edge.
 *
 * Stamp discipline: the red LIVE stamp appears only when the line is
 * live — every other state is form, not color (dashed outline while
 * connecting, no stamp at all while unplugged, the crossing HOLD bar
 * when held). The card itself stays quiet paper.
 *
 * Motion: the one authored moment of the whole product is THE STAMP —
 * when a line is plugged in at publish, the LIVE stamp presses onto
 * the strip (`justPlugged`): a stiff spring press (0.6 → 1, small
 * overshoot) that respects prefers-reduced-motion with an opacity-only
 * fade. It never runs on resting or plain-board renders.
 */
export interface JackCardProps {
  /** Bot name — kept short by the caller. */
  name: string
  lineState: LineState
  /**
   * True only for the card the operator just published: plays the
   * one-time stamp press. Never set on plain board renders.
   */
  justPlugged?: boolean
}

/** Stamp treatment per line state — red only for live (no green/red). */
const STAMP: Record<LineState, string> = {
  unplugged: '',
  connecting: 'stamp-dashed chase-pulse text-foreground',
  live: 'bg-stamp text-primary-foreground',
  'on hold': '',
}

export function JackCard({ name, lineState, justPlugged = false }: JackCardProps) {
  const isLive = lineState === 'live'
  const reducedMotion = useReducedMotion()
  const playsPress = justPlugged && isLive

  return (
    <article
      data-testid="jack-card"
      data-line-state={lineState}
      className="relative flex items-center gap-4 border border-border bg-card p-5 text-card-foreground"
    >
      {/* The stamp block: empty while unplugged or held, dashed while
          connecting, the red LIVE stamp once the line is live. */}
      <motion.span
        aria-hidden
        data-testid="jack-body"
        className={`label-mono flex size-11 shrink-0 items-center justify-center self-start px-1 text-center transition-colors duration-300 motion-reduce:transition-none ${STAMP[lineState]}`}
        /* The key remounts the stamp the moment the plug lands, so the
           spring press replays from its initial pose — and never runs
           on resting or plain-board renders. */
        key={playsPress ? 'just-plugged' : 'resting'}
        initial={playsPress ? (reducedMotion ? { opacity: 0 } : { scale: 0.6 }) : false}
        animate={playsPress ? (reducedMotion ? { opacity: 1 } : { scale: 1 }) : undefined}
        transition={
          reducedMotion
            ? { duration: 0.25 }
            : { type: 'spring', stiffness: 520, damping: 20, mass: 0.5 }
        }
      >
        {isLive ? 'Live' : ''}
      </motion.span>

      {/* The line label — doubled rule underneath when live. */}
      <h3
        data-testid="jack-name"
        title={name}
        className={`min-w-0 truncate text-base font-medium ${isLive ? 'rule-doubled' : ''}`}
      >
        {name}
      </h3>

      <div className="ml-auto pl-4">
        <LineStatePill state={lineState} />
      </div>

      {/* The HOLD bar crosses the held strip, full width. */}
      {lineState === 'on hold' && <span aria-hidden className="hold-bar">Hold</span>}

      {/* Screen-reader line: the pill text is visible, the stamp and
          bar are decorative. */}
      <span className="sr-only">
        {name} — {LINE_STATE_LABELS[lineState]}
      </span>
    </article>
  )
}
