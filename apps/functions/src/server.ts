import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { ZodError } from 'zod'
import { verifyCognitoJwt, cognitoConfigForCognito, type CognitoVerifierConfig } from './auth/verifyCognitoJwt'
import type { UserPreHook } from './api/hooks'
import { creditsBalancePlugin } from './api/creditsBalance'
import { creditsDebitPlugin } from './api/creditsDebit'
import { creditsReplenishPlugin } from './api/creditsReplenish'
import { plansAvailablePlugin } from './api/plansAvailable'
import { plansSubscribePlugin } from './api/plansSubscribe'
import { contentGetPlugin } from './api/contentGet'
import { chatPublicPlugin } from './api/chatPublic'

/**
 * Public surface — these routes skip the Cognito JWT verification. Everything
 * else is treated as admin and requires a valid Bearer token.
 */
const PUBLIC_ROUTE_PREFIXES = ['/api/chat/public'] as const

export interface CreateServerOptions {
  /**
   * Cognito verifier configuration. Required to start the server; if you
   * want a hookless server (e.g. for an in-process integration test that
   * stubs the verifier at the route level), pass a pre-built hook via
   * `userPreHook` instead.
   */
  cognito?: CognitoVerifierConfig
  /**
   * Pre-built auth hook. Useful in tests where the JWKS roundtrip is
   * undesirable. If both `cognito` and `userPreHook` are passed, the
   * latter takes precedence.
   */
  userPreHook?: UserPreHook
  /**
   * Comma-separated list of allowed origins for CORS. Defaults to the
   * `ALLOWED_ORIGINS` env var, or `*` if unset (intentionally permissive
   * for dev; the Lambda edge config is expected to lock this down).
   */
  allowedOrigins?: string
  /**
   * Disable request logging. Default: `false` (logger is enabled).
   */
  loggerDisabled?: boolean
}

export interface CreateServerDeps {
  userPreHook: UserPreHook
  allowedOrigins: string[]
}

async function resolveDeps(opts: CreateServerOptions): Promise<CreateServerDeps> {
  if (opts.userPreHook) {
    // Caller supplied a pre-built hook. Skip JWKS wiring.
  } else if (opts.cognito) {
    opts.userPreHook = verifyCognitoJwt(opts.cognito)
  } else {
    throw new Error(
      'createServer requires either `cognito` or `userPreHook` — admin routes need an auth hook.'
    )
  }
  const userPreHook = opts.userPreHook!

  const originsCsv = opts.allowedOrigins ?? process.env.ALLOWED_ORIGINS ?? '*'
  const allowedOrigins =
    originsCsv === '*'
      ? ['*']
      : originsCsv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)

  return { userPreHook, allowedOrigins }
}

/**
 * Build the production Fastify server with all routes wired. Admin routes
 * receive the Cognito JWT verifier; `/api/chat/public/*` is mounted without
 * auth (it is the anonymous, rate-limited chatbot surface).
 */
export async function createServer(
  opts: CreateServerOptions = {}
): Promise<FastifyInstance> {
  const deps = await resolveDeps(opts)

  const fastify = Fastify({
    logger: opts.loggerDisabled
      ? false
      : {
          level: process.env.LOG_LEVEL ?? 'info',
          redact: ['req.headers.authorization'],
        },
  })

  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (deps.allowedOrigins.includes('*')) {
        cb(null, true)
        return
      }
      if (!origin || deps.allowedOrigins.includes(origin)) {
        cb(null, true)
        return
      }
      cb(new Error('Origin not allowed'), false)
    },
    credentials: true,
  })

  // Centralized error handler. Maps ZodError -> 400 and sanitizes any
  // unhandled error into a 500 without leaking the stack trace.
  fastify.setErrorHandler((err, _request, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        success: false,
        error: 'Validation failed',
        code: 'VALIDATION_ERROR',
        issues: err.issues,
      })
    }
    // Fastify validation errors come through here as a FastifyError-shaped
    // object with a numeric `statusCode` between 400 and 499. Anything else
    // is treated as a server error.
    const fastifyErr = err as { statusCode?: number; message?: string }
    if (
      typeof fastifyErr.statusCode === 'number' &&
      fastifyErr.statusCode >= 400 &&
      fastifyErr.statusCode < 500
    ) {
      return reply.code(fastifyErr.statusCode).send({
        success: false,
        error: fastifyErr.message ?? 'Bad request',
      })
    }
    reply.log.error({ err }, 'unhandled error')
    return reply.code(500).send({
      success: false,
      error: 'Internal server error',
    })
  })

  // Mount admin routes behind the auth hook.
  await fastify.register(creditsBalancePlugin, {
    prefix: '/api/credits/balance',
    preHook: deps.userPreHook,
  })
  await fastify.register(creditsDebitPlugin, {
    prefix: '/api/credits',
    preHook: deps.userPreHook,
  })
  await fastify.register(creditsReplenishPlugin, {
    prefix: '/api/credits',
    preHook: deps.userPreHook,
  })
  await fastify.register(plansAvailablePlugin, {
    prefix: '/api/plans/available',
    preHook: deps.userPreHook,
  })
  await fastify.register(plansSubscribePlugin, {
    prefix: '/api/plans',
    preHook: deps.userPreHook,
  })
  await fastify.register(contentGetPlugin, {
    prefix: '/api/content',
    preHook: deps.userPreHook,
  })

  // Mount the public chat surface. It stays anonymous by design (chatbots
  // are publicly embedded), so no hook is attached here.
  await fastify.register(chatPublicPlugin, {
    prefix: '/api/chat/public',
  })

  // Light health endpoint. Useful in Lambda container startup probes too.
  fastify.get('/healthz', async () => ({ status: 'ok' }))

  // Log the mounted route table on boot so misconfigurations are obvious
  // in the CloudWatch logs of the first cold start.
  fastify.addHook('onReady', async () => {
    const table = fastify.printRoutes({ commonPrefix: false })
    fastify.log.info(
      { publicPrefixes: [...PUBLIC_ROUTE_PREFIXES], auth: 'cognito-jwt' },
      `server ready\n${table}`
    )
  })

  return fastify
}

/**
 * Entry point for direct Node execution. Reads the Cognito config from
 * env. The `dev`/`start` npm scripts in package.json wire this to `tsx`,
 * so this file does not auto-start when imported as a module.
 */
export async function startServer(): Promise<void> {
  const requiredEnv = [
    'AWS_REGION',
    'COGNITO_USER_POOL_ID',
    'COGNITO_CLIENT_ID',
  ] as const
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      throw new Error(`Missing required env var: ${key}`)
    }
  }

  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? '0.0.0.0'

  const fastify = await createServer({
    cognito: cognitoConfigForCognito(
      process.env.AWS_REGION!,
      process.env.COGNITO_USER_POOL_ID!,
      process.env.COGNITO_CLIENT_ID!
    ),
  })

  await fastify.listen({ port, host })
}
