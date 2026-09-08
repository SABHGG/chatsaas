"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Progress({
  className,
  value,
  indicatorClassName,
  indicatorProps,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root> & {
  /** Extra classes for the indicator bar (e.g. an achromatic fill). */
  indicatorClassName?: string
  /** Props forwarded to the indicator (e.g. a test id). */
  indicatorProps?: React.HTMLAttributes<HTMLDivElement> & { "data-testid"?: string }
}) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-1 w-full items-center overflow-x-hidden rounded-none border border-border bg-muted",
        className
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className={cn("size-full flex-1 bg-primary transition-all", indicatorClassName)}
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
        {...indicatorProps}
      />
    </ProgressPrimitive.Root>
  )
}

export { Progress }
