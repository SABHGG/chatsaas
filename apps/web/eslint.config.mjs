import nextConfig from 'eslint-config-next'

/**
 * Flat ESLint config (ESLint 9). Next 16 removed `next lint`, so the lint
 * script calls `eslint .` directly with the shared Next.js config.
 */
const config = [
  ...nextConfig,
  {
    ignores: ['.next/**', 'node_modules/**', 'coverage/**', 'next-env.d.ts'],
  },
]

export default config
