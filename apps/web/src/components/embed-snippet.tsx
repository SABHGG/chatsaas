'use client'

import { useEffect, useRef, useState } from 'react'
import { buildIframeSnippet, copyToClipboard } from '@/lib/embed'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * The embed generator: the label with the live-line stamp, the snippet
 * on paper in mono, and the copy control. Copying confirms itself
 * through the "Copied." readout — motion is reserved for the ONE
 * authored moment (the stamp press at publish), never for feedback
 * decoration. The stamp is red because the line IS live.
 */
export function EmbedSnippet({ url }: { url: string }) {
  const snippet = buildIframeSnippet(url)
  const [copied, setCopied] = useState(false)
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
    if (timer.current) clearTimeout(timer.current)
    // The "Copied." readout lingers a beat, then resets.
    timer.current = setTimeout(() => {
      setCopied(false)
    }, 1600)
  }

  return (
    <section data-testid="embed-snippet" aria-label="Embed this line on your site">
      <div className="flex items-center gap-3">
        {/* The live-line stamp rides the embed label. */}
        <span
          aria-hidden
          data-testid="embed-jack"
          className="label-mono flex size-6 shrink-0 items-center justify-center bg-stamp text-[0.5rem] text-primary-foreground"
        >
          Live
        </span>
        <h2 className="text-sm font-medium text-foreground">
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
        className="readout-mono mt-3 w-full resize-y border border-input bg-card p-4 text-xs leading-relaxed text-foreground"
      />

      <div className="mt-3 flex items-center gap-3">
        {/* The one tooltip on the board (shadcn tooltip) — naming the
            copy control's job. The trigger IS the copy button, so the
            DOM and testid stay. */}
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button type="button" data-testid="embed-copy" onClick={() => void onCopy()}>
                Copy snippet
              </Button>
            </TooltipTrigger>
            <TooltipContent sideOffset={8} data-testid="embed-copy-tooltip">
              Copy embed code
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <span aria-live="polite" data-testid="embed-copied" className="readout-mono text-xs text-muted-foreground">
          {copied ? 'Copied.' : ''}
        </span>
      </div>
    </section>
  )
}
