'use client'

import { motion, useReducedMotion } from 'motion/react'
import { LineStatePill, LINE_STATE_LABELS, type LineState } from './line-state-pill'

/**
 * The labeled jack row (ADR-007 Shapes): a gently rounded card with a
 * circular jack indicator on its leading edge, the bot name as an
 * engraved-plate label (Jack Label Rule: short, machine-precise), and
 * the line-state pill on the trailing edge.
 *
 * Rules encoded here:
 * - Live Line Rule: Patch Amber appears on the jack body only when the
 *   line is live — every other state is Slate Ink (unlit jack bodies).
 * - Flat-by-Default Rule: the card itself is always flat; the only
 *   elevation in the system is `--shadow-live-jack` on the lit jack.
 * - Motion (ADR-007): the one authored moment is the patch-cord "click"
 *   when a line is plugged in at publish — opt-in via `justPlugged`, so
 *   the board never animates for decoration. The click rides Motion
 *   (motion/react): a stiff spring scale-in (0.6 → 1, small overshoot)
 *   that respects prefers-reduced-motion with an opacity-only fade.
 *   The `--animate-jack-click` CSS keyframe stays reserved for the
 *   embed panel's copy moment (the non-publish use of the click).
 */
export interface JackCardProps {
  /** Bot name — kept short and plate-like by the caller (Jack Label Rule). */
  name: string
  lineState: LineState
  /**
   * True only for the card the operator just published: plays the
   * one-time patch-cord click. Never set on plain board renders.
   */
  justPlugged?: boolean
}

/** Visual treatment of the jack body per line state (no green/red). */
const JACK_BODY: Record<LineState, string> = {
  unplugged: 'bg-slate-ink',
  connecting: 'animate-pulse bg-slate-ink/50',
  live: 'bg-patch-amber shadow-live-jack',
  'on hold': 'bg-slate-ink/40',
}

export function JackCard({ name, lineState, justPlugged = false }: JackCardProps) {
  const isLive = lineState === 'live'
  const reducedMotion = useReducedMotion()
  const playsClick = justPlugged && isLive

  return (
    <article
      data-testid="jack-card"
      data-line-state={lineState}
      className="flex items-center gap-4 rounded-card border border-hairline-slate bg-panel-warm p-5"
    >
      {/* The jack: circular, on one edge, reads as the connection point. */}
      <motion.span
        aria-hidden
        data-testid="jack-body"
        className={`flex size-11 shrink-0 items-center justify-center rounded-jack transition-colors duration-300 motion-reduce:transition-none ${JACK_BODY[lineState]}`}
        /* The key remounts the jack the moment the plug lands, so the
           spring click replays from its initial pose — and never runs on
           resting or plain-board renders (ADR-007: one authored moment). */
        key={playsClick ? 'just-plugged' : 'resting'}
        initial={playsClick ? (reducedMotion ? { opacity: 0 } : { scale: 0.6 }) : false}
        animate={playsClick ? (reducedMotion ? { opacity: 1 } : { scale: 1 }) : undefined}
        transition={
          reducedMotion
            ? { duration: 0.25 }
            : { type: 'spring', stiffness: 520, damping: 20, mass: 0.5 }
        }
      >
        {/* The pinhole — always ivory, amber or ink body around it. */}
        <span className="size-3 rounded-jack bg-operators-ivory" />
      </motion.span>

      {/* Engraved-plate bot label. */}
      <h3
        data-testid="jack-name"
        title={name}
        className="min-w-0 truncate font-mono text-sm font-medium uppercase tracking-plate"
      >
        {name}
      </h3>

      <div className="ml-auto pl-4">
        <LineStatePill state={lineState} />
      </div>

      {/* Screen-reader line: the pill text is visible, the jack is decorative. */}
      <span className="sr-only">
        {name} — {LINE_STATE_LABELS[lineState]}
      </span>
    </article>
  )
}
