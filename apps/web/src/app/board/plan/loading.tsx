/**
 * The plan surface in flight: while the Server Component reads plans and
 * the credit balance, the shell shows the tower entries as quiet
 * paper-dim silhouettes — the same still-loading grammar as the board
 * (no shimmer; motion is reserved for the connecting chase).
 */
export default function PlanLoading() {
  return (
    <section aria-busy="true" aria-live="polite" aria-label="Plan and credits">
      <span aria-hidden className="block h-4 w-36 bg-muted" />

      <span aria-hidden className="mt-4 block h-7 w-56 bg-muted" />
      <span aria-hidden className="mt-2 block h-4 w-80 max-w-full bg-muted" />

      <div aria-hidden className="mt-8 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <div>
          <span className="block h-3 w-20 bg-muted" />
          <span className="mt-1 block h-2.5 w-64 max-w-full bg-muted" />
          <div className="mt-3 flex flex-col gap-3">
            {[0, 1].map((row) => (
              <div
                key={row}
                className="flex items-center justify-between gap-6 border border-border bg-muted/40 px-5 py-4"
              >
                <div className="min-w-0">
                  <span className="block h-3.5 w-28 bg-muted" />
                  <span className="mt-2 block h-3 w-48 max-w-full bg-muted" />
                </div>
                <span className="h-3.5 w-16 shrink-0 bg-muted" />
              </div>
            ))}
          </div>
        </div>

        <aside aria-hidden>
          <div className="border border-border bg-card p-4">
            <span className="block h-3 w-16 bg-muted" />
            <span className="mt-3 block h-3.5 w-24 bg-muted" />
            <span className="mt-3 block h-1 w-full bg-muted" />
          </div>
        </aside>
      </div>
    </section>
  )
}
