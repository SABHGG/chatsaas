import { defineConfig } from '@playwright/test'

/**
 * WI-007 Task 17 — e2e happy path.
 *
 * Fully local architecture (orchestrator decision: no app or middleware
 * changes for testability):
 *
 *   127.0.0.1:4312  mock Cognito JWKS (e2e/fixtures/mock-jwks.mts)
 *                   — the app's issuer env (NEXT_PUBLIC_COGNITO_ISSUER_URL)
 *                     points here; forged cookies sign in the operator.
 *   127.0.0.1:4311  mock backend API (e2e/fixtures/mock-api.mts) with the
 *                   reconciled real-backend shapes; NEXT_PUBLIC_API_URL
 *                   points here, covering both the board's server-side
 *                   fetches and the BFF proxy uniformly.
 *   127.0.0.1:4310  the app itself (`next dev` — env inlining happens at
 *                     request-time compile, so the overrides below bind).
 *
 * No egress beyond localhost.
 */

const APP_PORT = 4310
const API_PORT = 4311
const JWKS_PORT = 4312
const HOST = '127.0.0.1'

process.env.E2E_HOST = HOST

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://${HOST}:${APP_PORT}`,
    screenshot: 'off',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node e2e/fixtures/mock-jwks.mts',
      url: `http://${HOST}:${JWKS_PORT}/.well-known/jwks.json`,
      reuseExistingServer: false,
      env: {
        E2E_HOST: HOST,
        E2E_JWKS_PORT: String(JWKS_PORT),
        E2E_JWKS_ISSUER: `http://${HOST}:${JWKS_PORT}`,
        E2E_CLIENT_ID: 'e2e-client',
      },
    },
    {
      command: 'node e2e/fixtures/mock-api.mts',
      url: `http://${HOST}:${API_PORT}/api/healthz`,
      reuseExistingServer: false,
      env: {
        E2E_HOST: HOST,
        E2E_API_PORT: String(API_PORT),
      },
    },
    {
      command: `pnpm exec next dev --port ${APP_PORT} --hostname ${HOST}`,
      url: `http://${HOST}:${APP_PORT}/login`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        NEXT_PUBLIC_COGNITO_ISSUER_URL: `http://${HOST}:${JWKS_PORT}`,
        NEXT_PUBLIC_COGNITO_CLIENT_ID: 'e2e-client',
        NEXT_PUBLIC_COGNITO_REGION: 'us-east-1',
        NEXT_PUBLIC_COGNITO_USER_POOL_ID: 'us-east-1_E2E',
        NEXT_PUBLIC_COGNITO_DOMAIN: 'e2e-mock.local',
        NEXT_PUBLIC_API_URL: `http://${HOST}:${API_PORT}/api`,
      },
    },
  ],
})
