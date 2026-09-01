'use client'

import { useEffect, useRef, useState } from 'react'
import { Tooltip } from '@base-ui-components/react/tooltip'
import { buildIframeSnippet, copyToClipboard } from '@/lib/embed'

/**
 * The embed generator (WI-007 Task 13 + 15): the machine-precise label,
 * the snippet box, and the copy control. Copying is the patch-cord
 * moment for this panel — per ADR-007 the one motion here is the
 * "click" on the little jack when the snippet actually lands on the
 * clipboard. The jack is amber because the line IS live; the click
 * plays only after a successful copy, never for decoration.
 */
export function EmbedSnippet({ url }: { url: string }) {
  const snippet = buildIframeSnippet(url)
  const [copied, setCopied] = useState(false)
  const [clicked, setClicked] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const onCopy = async () => {
    const ok = await copyToClipboard(snippet)
    if (!ok) return
    setCopied(true)
    setClicked(true)
    if (timer.current) clearTimeout(timer.current)
    // The click animation runs once (450ms); the "Copied" readout lingers
    // a beat longer, then both reset.
    timer.current = setTimeout(() => {
      setClicked(false)
      setCopied(false)
    }, 1600)
  }

  return (
    <section data-testid="embed-snippet" aria-label="Embed this line on your site">
      <div className="flex items-center gap-3">
        {/* The live-line jack for the embed label; the copy click plays here. */}
        <span
          aria-hidden
          data-testid="embed-jack"
          className={`flex size-6 shrink-0 items-center justify-center rounded-jack bg-patch-amber shadow-live-jack ${
            clicked ? 'animate-jack-click motion-reduce:animate-none' : ''
          }`}
        >
          <span className="size-1.5 rounded-jack bg-operators-ivory" />
        </span>
        <h2 className="font-mono text-xs font-medium uppercase tracking-plate text-slate-ink">
          Embed on your site
        </h2>
      </div>

      <textarea
        data-testid="embed-snippet-text"
        readOnly
        value={snippet}
        rows={4}
        onFocus={(event) => event.currentTarget.select()}
        aria-label="Iframe snippet"
        className="mt-3 w-full resize-y rounded-card border border-hairline-slate bg-panel-warm p-4 font-mono text-xs leading-relaxed text-slate-ink"
      />

      <div className="mt-3 flex items-center gap-3">
        {/* The one tooltip on the board (Base UI, in-world: ink ground,
            ivory mono text, no shadow) — naming the copy control's job.
            The trigger IS the copy button, so the DOM and testid stay. */}
        <Tooltip.Provider>
          <Tooltip.Root>
            <Tooltip.Trigger
              type="button"
              data-testid="embed-copy"
              onClick={() => void onCopy()}
              className="rounded-plug bg-slate-ink px-5 py-2.5 font-mono text-xs font-semibold uppercase tracking-plate text-operators-ivory hover:bg-slate-ink/90"
            >
              Copy snippet
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Positioner sideOffset={8}>
                <Tooltip.Popup
                  data-testid="embed-copy-tooltip"
                  className="rounded-plate bg-slate-ink px-2.5 py-1.5 font-mono text-xs uppercase tracking-plate text-operators-ivory"
                >
                  Copy embed code
                </Tooltip.Popup>
              </Tooltip.Positioner>
            </Tooltip.Portal>
          </Tooltip.Root>
        </Tooltip.Provider>
        <span aria-live="polite" data-testid="embed-copied" className="font-mono text-xs uppercase tracking-plate text-slate-ink/70">
          {copied ? 'Copied.' : ''}
        </span>
      </div>
    </section>
  )
}
