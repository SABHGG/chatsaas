import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { ZodError } from 'zod'
import { verifyCognitoJwt, cognitoConfigForCognito, type CognitoVerifierConfig } from './auth/verifyCognitoJwt'
import type { UserPreHook } from './api/hooks'
import './types/fastify.d.ts'
import { creditsBalancePlugin } from './api/creditsBalance'
import { creditsDebitPlugin } from './api/creditsDebit'
import { creditsReplenishPlugin } from './api/creditsReplenish'
import { plansAvailablePlugin } from './api/plansAvailable'
import { plansSubscribePlugin } from './api/plansSubscribe'
import { contentGetPlugin } from './api/contentGet'
import { chatPublicPlugin } from './api/chatPublic'
import { documentsUploadPlugin } from './api/documentsUpload'
import { documentsListPlugin } from './api/documentsList'
import { documentGetPlugin } from './api/documentGet'
import { chatPublicMessagePlugin, chatRouteEnvFromProcess } from './api/chatPublicMessage'

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
  /**
   * Documents bucket name (WI-005). Required to register the upload route.
   * If omitted, the upload / list / get routes are not mounted.
   */
  documentsBucket?: string
  /**
   * Documents DynamoDB table name (WI-005). Required to register the upload / list / get routes.
   */
  documentsTable?: string
  /**
   * Chatbots DynamoDB table name (WI-005). Required for cross-tenant ownership checks in upload/list routes.
   */
  chatbotsTable?: string
}

export interface CreateServerDeps {
  userPreHook: UserPreHook
  allowedOrigins: string[]
}

async function resolveDeps(opts: CreateServerOptions): Promise<CreateServerDeps> {
  let userPreHook: UserPreHook
  if (opts.userPreHook) {
    userPreHook = opts.userPreHook
  } else if (opts.cognito) {
    userPreHook = verifyCognitoJwt(opts.cognito)
  } else {
    throw new Error(
      'createServer requires either `cognito` or `userPreHook` — admin routes need an auth hook.'
    )
  }

  // Resolve and validate the CORS allowlist. Two non-obvious edge cases
  // the operator must not get bitten by:
  //  1. `ALLOWED_ORIGINS=""` (set-but-empty) is treated the same as
  //     unset: a wildcard. Otherwise an empty list would silently
  //     lock the dashboard out with no log line.
  //  2. Mixed allowlist (`https://app.example.com,*`) is rejected at
  //     boot. Either you want a tight allowlist (with credentials) or
  //     an open wildcard (no credentials) — silently flipping
  //     credentials off because someone appended `*` to a concrete
  //     list has burned people before.
  const rawCsv = opts.allowedOrigins ?? process.env.ALLOWED_ORIGINS
  const originsCsv = (rawCsv ?? '').trim() || '*'
  const allowedOrigins =
    originsCsv === '*'
      ? ['*']
      : originsCsv
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)

  if (
    originsCsv !== '*' &&
    allowedOrigins.length > 1 &&
    allowedOrigins.includes('*')
  ) {
    throw new Error(
      `Invalid ALLOWED_ORIGINS: mixing '*' with concrete origins is not allowed. ` +
        `Use either a single '*' (no credentials) or a comma-separated list of origins.`
    )
  }

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

  // CORS configuration. Three rules to keep this spec-correct:
  // 1. Never combine `origin: '*'` with `credentials: true` — modern
  //    browsers reject the response and the dashboard silently breaks.
  // 2. When the allowlist is `*`, reflect no origin (so the response
  //    header is `*`) and disable credentials.
  // 3. When a concrete origin is rejected, return `cb(null, false)` —
  //    do NOT throw an Error. A thrown Error routes into the central
  //    error handler as a 500, which is the wrong shape for CORS
  //    rejection (the browser just needs the missing header to drop
  //    the response).
  const isWildcard = deps.allowedOrigins.includes('*')
  await fastify.register(cors, {
    origin: (origin, cb) => {
      if (isWildcard) {
        cb(null, true)
        return
      }
      if (!origin || deps.allowedOrigins.includes(origin)) {
        cb(null, true)
        return
      }
      cb(null, false)
    },
    credentials: !isWildcard,
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

  // WI-005 ingest routes. Mounted only when both env vars are configured so
  // existing tests of the chat surface keep running without DynamoDB / S3.
  const documentsBucket = opts.documentsBucket ?? process.env.DOCUMENTS_BUCKET
  const documentsTable = opts.documentsTable ?? process.env.DOCUMENTS_TABLE
  const chatbotsTable = opts.chatbotsTable ?? process.env.CHATBOTS_TABLE_NAME
  if (documentsBucket && documentsTable && chatbotsTable) {
    await fastify.register(documentsUploadPlugin, {
      prefix: '/api/chatbots',
      preHook: deps.userPreHook,
      documentsBucket,
      documentsTable,
      chatbotsTable,
    })
    await fastify.register(documentsListPlugin, {
      prefix: '/api/chatbots',
      preHook: deps.userPreHook,
      documentsTable,
      chatbotsTable,
    })
    await fastify.register(documentGetPlugin, {
      prefix: '/api/documents',
      preHook: deps.userPreHook,
      documentsTable,
    })
  } else {
    fastify.log.warn(
      'WI-005 document routes disabled: DOCUMENTS_BUCKET, DOCUMENTS_TABLE, and/or CHATBOTS_TABLE_NAME not set'
    )
  }

  // Mount the public chat surface. It stays anonymous by design (chatbots
  // are publicly embedded), so no hook is attached here.
  await fastify.register(chatPublicPlugin, {
    prefix: '/api/chat/public',
  })

  // WI-006 public retrieval+chat surface. Anonymous (no JWT preHook); the
  // chatbot row is the tenant-scope source. Mounted only when the full env
  // set is present so legacy tests keep running without RDS/Bedrock.
  const chatRouteEnv = chatRouteEnvFromProcess()
  if (chatRouteEnv) {
    await fastify.register(chatPublicMessagePlugin, {
      prefix: '/api/public/chat',
      env: chatRouteEnv,
    })
  } else {
    fastify.log.warn(
      'WI-006 public chat route disabled: missing one of CHATBOTS_TABLE_NAME, CONVERSATIONS_TABLE_NAME, MESSAGES_TABLE_NAME, SUBSCRIPTIONS_TABLE_NAME, CREDITS_TABLE_NAME, RDS_CLUSTER_ARN, RDS_SECRET_ARN, RDS_DATABASE, BEDROCK_EMBED_MODEL_ID, CHAT_MODEL_ID',
    )
  }

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
  const host = process.env.HOST ?? '0.00.0.0'

  const fastify = await createServer({
    cognito: cognitoConfigForCognito(
      process.env.AWS_REGION!,
      process.env.COGNITO_USER_POOL_ID!,
      process.env.COGNITO_CLIENT_ID!
    ),
  })

  await fastify.listen({ port, host })
}