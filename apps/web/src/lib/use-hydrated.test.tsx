// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { useHydrated } from './use-hydrated'

/**
 * WI-007 Task 9 (DC-007-5): the per-component hydration guard renders
 * the server snapshot (false) on the server pass — so SSR markup and
 * the client's hydration pass agree — and flips to true after the
 * client commits. A hydration mismatch is impossible by construction.
 */
function Probe() {
  const hydrated = useHydrated()
  return <span data-testid="hydrated-state">{hydrated ? 'client' : 'server'}</span>
}

describe('useHydrated', () => {
  afterEach(cleanup)

  it('renders false on the server pass (SSR-safe output)', () => {
    const serverHtml = renderToString(<Probe />)
    expect(serverHtml).toContain('>server<')
    expect(serverHtml).not.toContain('>client<')
  })

  it('is true once the client has committed', () => {
    render(<Probe />)
    expect(screen.getByTestId('hydrated-state').textContent).toBe('client')
  })
})
