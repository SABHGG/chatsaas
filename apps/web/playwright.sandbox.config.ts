import { defineConfig } from '@playwright/test'

/**
 * SANDBOX web e2e — the REAL browser flow against the REAL local sandbox
 * stack (separate from playwright.config.ts, which runs against mocks):
 *
 *   127.0.0.1:3001  the sandbox API (apps/functions via floci + mock
 *                   Bedrock + pgvector) — assumed ALREADY RUNNING by the
 *                   operator (`pnpm dev:api` at the repo root).
 *   127.0.0.1:4568  fake Cognito (e2e/fixtures/fake-cognito.mts) — a real
 *                   HTTPS OAuth2 IdP (self-signed cert under
 *                   /tmp/opencode/sandbox/) so the app's ACTUAL
 *                   authorization-code + PKCE login runs end to end.
 *   localhost:3000  the app itself (`next dev`), env-inlined at boot so
 *                   both the issuer (lib/jwt.ts) and the OAuth2 domain
 *                   (lib/oauth.ts) point at the fake IdP.
 *
 * HOST NOTE (verified empirically): Next 16's dev server canonicalizes
 * `request.nextUrl.origin` to `http://localhost:3000` even when the
 * request's Host is `127.0.0.1:3000` — so the login route builds
 * `redirect_uri=http://localhost:3000/api/auth/callback` and the OAuth
 * cookies end up host-bound to localhost. The browser MUST therefore ride
 * `localhost` end to end (baseURL included); running it on 127.0.0.1
 * strands the `oauth_state` cookie on the wrong host and the callback
 * fails with `?error=state_mismatch`.
 *
 * Self-signed TLS: browsers ignore the cert via use.ignoreHTTPSErrors;
 * the web server's server-side fetches (token exchange, and the JWKS
 * fetch that the edge middleware performs) trust it via
 * NODE_EXTRA_CA_CERTS — never NODE_TLS_REJECT_UNAUTHORIZED=0.
 *
 * NOTE: NEXT_PUBLIC_* vars are inlined at dev-server boot. If a stale
 * `next dev` without them is still alive on port 3000, kill it first
 * (with reuseExistingServer a stale server would be reused as-is).
 *
 * Manual ingest is part of the flow (production ingest is an EventBridge
 * Lambda floci does not wire): the spec runs
 * apps/functions/scripts/sandbox-ingest-bot.mjs between the upload and
 * the review step.
 *
 * Only *.sandbox.spec.ts files run here — the mock-based happy path
 * (playwright.config.ts) is untouched.
 */

const APP_PORT = 3000
const API_PORT = 3001
const IDP_PORT = 4568
const IDP_HOST = '127.0.0.1'
const APP_HOST = 'localhost'
const TLS_CERT = '/tmp/opencode/sandbox/fake-cognito-cert.pem'
const IDP_ISSUER = `https://${IDP_HOST}:${IDP_PORT}`

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.sandbox.spec.ts',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://${APP_HOST}:${APP_PORT}`,
    ignoreHTTPSErrors: true,
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm exec tsx e2e/fixtures/fake-cognito.mts',
      url: `${IDP_ISSUER}/.well-known/jwks.json`,
      // Supported by @playwright/test >= 1.37 (installed: 1.62.1) — no
      // stdout-based readiness fallback needed.
      ignoreHTTPSErrors: true,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
    },
    {
      command: `pnpm exec next dev --port ${APP_PORT}`,
      url: `http://${APP_HOST}:${APP_PORT}/login`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_API_URL: `http://127.0.0.1:${API_PORT}/api`,
        // Issuer for lib/jwt.ts (JWKS + iss claim match, no trailing slash).
        NEXT_PUBLIC_COGNITO_ISSUER_URL: IDP_ISSUER,
        // OAuth2 host for lib/oauth.ts (authorize + token endpoints).
        NEXT_PUBLIC_COGNITO_DOMAIN: `${IDP_HOST}:${IDP_PORT}`,
        NEXT_PUBLIC_COGNITO_CLIENT_ID: 'sandbox-web-client',
        NEXT_PUBLIC_COGNITO_REGION: 'us-east-1',
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: 'sandbox-pool',
        // Trust the fake IdP's self-signed cert for server-side fetches.
        NODE_EXTRA_CA_CERTS: TLS_CERT,
        PORT: String(APP_PORT),
      },
    },
  ],
})
