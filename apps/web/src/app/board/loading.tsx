/**
 * The rack in flight: while the board's Server Component fetches the
 * company's lines, the shell shows the rack and the workspace pane as
 * quiet paper-dim silhouettes. Loading stays STILL — no shimmer, no
 * pulse: motion on this surface is reserved for the ONE connecting
 * chase, so the skeleton reads as unfilled strip slots, not as activity.
 */
export default function BoardLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="grid gap-8 lg:grid-cols-[16rem_1fr] lg:gap-10"
    >
      {/* ---- The strip rack, unfilled ---- */}
      <aside aria-hidden className="flex min-w-0 flex-col">
        <div className="hidden items-baseline justify-between lg:flex">
          <span className="label-mono text-muted-foreground">Lines</span>
          <span className="readout-mono h-3 w-4 bg-muted" />
        </div>

        {/* Unfilled strip slots — the shapes the real rack fills in. */}
        <div className="mt-3 hidden flex-col gap-2 lg:flex">
          {[0, 1, 2].map((slot) => (
            <div
              key={slot}
              className="h-[4.6rem] w-full border border-border bg-muted/60 p-3"
            >
              <span className="block h-3 w-24 bg-muted" />
              <span className="mt-2 block h-2.5 w-12 bg-muted" />
              <span className="mt-2.5 block h-2.5 w-14 bg-muted" />
            </div>
          ))}
        </div>

        {/* Below lg the rack is a horizontal strip of slots. */}
        <div className="flex gap-2 lg:hidden">
          {[0, 1, 2].map((slot) => (
            <div
              key={slot}
              className="h-[4.6rem] w-44 shrink-0 border border-border bg-muted/60 p-3"
            >
              <span className="block h-3 w-24 bg-muted" />
              <span className="mt-2 block h-2.5 w-12 bg-muted" />
              <span className="mt-2.5 block h-2.5 w-14 bg-muted" />
            </div>
          ))}
        </div>
      </aside>

      {/* ---- The workspace pane, unfilled ---- */}
      <div aria-hidden className="flex min-w-0 flex-col">
        <span className="h-7 w-56 bg-muted" />
        <span className="mt-3 block h-4 w-80 max-w-full bg-muted" />
        <div className="mt-8 border border-border bg-card p-5">
          <span className="block h-3 w-32 bg-muted" />
          <span className="mt-4 block h-3 w-48 bg-muted" />
        </div>
        <div className="mt-10 border-t border-border pt-6">
          <span className="block h-8 w-40 bg-muted" />
        </div>
      </div>
    </div>
  )
}
