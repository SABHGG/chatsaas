import type { NextConfig } from 'next'

/**
 * The Impeccable finish-review captures (e2e/happy-path.spec.ts) must
 * show the product only — the Next dev-tools badge is a capture
 * pollutant, so it stays off in dev entirely.
 */
const nextConfig: NextConfig = {
  devIndicators: false,
}

export default nextConfig
