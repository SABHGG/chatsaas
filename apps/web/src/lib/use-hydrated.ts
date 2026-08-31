'use client'

import { useSyncExternalStore } from 'react'

/**
 * Per-component hydration guard (DC-007-5).
 *
 * Returns false on the first server pass AND on the client's
 * hydration-matching first render, then true after the first client
 * commit. Any state that could differ between server and client —
 * persisted drafts, dates, storage reads — must read through this guard
 * at the component that needs it, not at a shared layout boundary.
 *
 * Implemented with `useSyncExternalStore` instead of a setState-in-
 * effect flag: the server snapshot (false) matches the SSR output, and
 * React itself re-renders with the client snapshot (true) once mounted.
 */
const noopSubscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, getClientSnapshot, getServerSnapshot)
}
