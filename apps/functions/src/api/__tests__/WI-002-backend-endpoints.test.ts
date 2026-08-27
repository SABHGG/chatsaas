import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb'

// Mock the lib/db module so no real DynamoDB is needed.
vi.mock('@/lib/db', () => ({
  put: vi.fn(),
  get: vi.fn(),
  scan: vi.fn(),
  update: vi.fn(),
  updateExpr: vi.fn(),
  query: vi.fn(),
  del: vi.fn(),
  marshal: vi.fn(),
  unmarshal: vi.fn(),
  TABLES: {
    CHAT_MESSAGES: 'chat-messages',
    CREDITS: 'credits',
    PLANS: 'plans',
    SUBSCRIPTIONS: 'subscriptions',
    CONTENT: 'content',
  },
}))

// Bring the mocked helpers into scope so we can configure them per-test.
import { scan, put, get, updateExpr, query, del } from '@/lib/db'
import { fakeUserHook } from '../hooks'

// Handler factories
import * as chatPublic from '../chatPublic'
import * as creditsBalance from '../creditsBalance'
import * as creditsDebit from '../creditsDebit'
import * as plansAvailable from '../plansAvailable'
import * as plansSubscribe from '../plansSubscribe'
import * as creditsReplenish from '../creditsReplenish'
import * as contentGet from '../contentGet'

const TEST_USER = 'test-user-123'
const userHook = fakeUserHook(TEST_USER)

describe('WI-002: Backend Endpoints Fastify', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('chatPublic', () => {
    it('should list empty messages when no messages exist', async () => {
      ;(scan as any).mockResolvedValueOnce([])

      const fastify = await chatPublic.chatPublicFactory(userHook)
      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBe(0)
      await fastify.close()
    })

    it('should publish a new message', async () => {
      const mockMessage = {
        id: 'msg-001',
        content: 'Hello world',
        username: 'testuser',
        type: 'text',
        createdAt: new Date().toISOString(),
      }
      ;(put as any).mockResolvedValueOnce(mockMessage)

      const fastify = await chatPublic.chatPublicFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { content: 'Hello world', username: 'testuser' },
      })

      expect(response.statusCode).toBe(201)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data).toBeDefined()
      // Handler generates a real uuid for new messages; verify it's a string,
      // not the mock's 'msg-001' (which is irrelevant — `put` is mocked).
      expect(typeof data.data.id).toBe('string')
      expect(data.data.id.length).toBeGreaterThan(0)
      expect(data.data.content).toBe('Hello world')
      expect(put).toHaveBeenCalledTimes(1)
      await fastify.close()
    })

    it('should publish a new message without username (no undefined crash)', async () => {
      ;(put as any).mockResolvedValueOnce({})

      const fastify = await chatPublic.chatPublicFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { content: 'Anonymous post' },
      })

      // Regression: with removeUndefinedValues:false this was a 500.
      expect(response.statusCode).toBe(201)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.content).toBe('Anonymous post')
      // The handler omits the username key entirely; the response maps to null.
      expect(data.data.username).toBeNull()
      await fastify.close()
    })

    it('should reject limit out of range', async () => {
      const fastify = await chatPublic.chatPublicFactory(userHook)
      const response = await fastify.inject({
        method: 'GET',
        url: '/?limit=500',
      })

      expect(response.statusCode).toBe(400)
      await fastify.close()
    })
  })

  describe('creditsBalance', () => {
    it('should return balance 0 when no credits record exists', async () => {
      ;(get as any).mockResolvedValueOnce(undefined)

      const fastify = await creditsBalance.creditsBalanceFactory(userHook)
      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.balance).toBe(0)
      expect(get).toHaveBeenCalledTimes(1)
      await fastify.close()
    })

    it('should return existing balance', async () => {
      const mockCredit = { userId: TEST_USER, balance: 150 }
      ;(get as any).mockResolvedValueOnce(mockCredit)

      const fastify = await creditsBalance.creditsBalanceFactory(userHook)
      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.balance).toBe(150)
      await fastify.close()
    })
  })

  describe('creditsDebit', () => {
    it('should debit atomically when sufficient credits', async () => {
      ;(updateExpr as any).mockResolvedValueOnce({
        userId: TEST_USER,
        balance: 150,
      })

      const fastify = await creditsDebit.creditsDebitFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/debit',
        payload: { amount: 50, reason: 'test purchase' },
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.newBalance).toBe(150)
      // Verify the atomic condition expression was used.
      expect(updateExpr).toHaveBeenCalledWith(
        'credits',
        { userId: TEST_USER },
        'SET balance = balance - :amount',
        { ':amount': 50 },
        'balance >= :amount AND attribute_exists(userId)'
      )
      await fastify.close()
    })

    it('should return 402 when conditional check fails (insufficient credits)', async () => {
      const condErr = new ConditionalCheckFailedException({
        $metadata: {},
        message: 'insufficient',
      })
      ;(updateExpr as any).mockRejectedValueOnce(condErr)

      const fastify = await creditsDebit.creditsDebitFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/debit',
        payload: { amount: 50 },
      })

      expect(response.statusCode).toBe(402)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Insufficient credits')
      expect(data.code).toBe('INSUFFICIENT_CREDITS')
      await fastify.close()
    })
  })

  describe('plansAvailable', () => {
    it('should list available plans', async () => {
      const mockPlans = [
        { id: 'plan-1', name: 'Basic', price: 9.99, interval: 'monthly', active: true, description: 'Basic plan' },
        { id: 'plan-2', name: 'Pro', price: 19.99, interval: 'monthly', active: true, description: 'Pro plan' },
      ]
      ;(scan as any).mockResolvedValueOnce(mockPlans)

      const fastify = await plansAvailable.plansAvailableFactory(userHook)
      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(Array.isArray(data.data)).toBe(true)
      expect(data.data.length).toBe(2)
      await fastify.close()
    })
  })

  describe('plansSubscribe', () => {
    it('should subscribe user to a plan', async () => {
      const mockPlan = {
        id: 'plan-1',
        name: 'Basic',
        price: 9.99,
        interval: 'monthly',
      }
      ;(get as any).mockResolvedValueOnce(mockPlan)
      ;(query as any).mockResolvedValueOnce([]) // no existing subscription
      ;(put as any).mockResolvedValueOnce({})

      const fastify = await plansSubscribe.plansSubscribeFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { planId: 'plan-1' },
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.planId).toBe('plan-1')
      expect(data.data.status).toBe('active')
      await fastify.close()
    })

    it('should return 404 when plan does not exist', async () => {
      ;(get as any).mockResolvedValueOnce(undefined)

      const fastify = await plansSubscribe.plansSubscribeFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { planId: 'plan-unknown' },
      })

      expect(response.statusCode).toBe(404)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Plan not found')
      await fastify.close()
    })

    it('should switch plans via delete+put when the planId changes', async () => {
      const mockPlan = {
        id: 'plan-2',
        name: 'Pro',
        price: 19.99,
        interval: 'monthly',
      }
      const existingSub = {
        id: 'sub-001',
        userId: TEST_USER,
        planId: 'plan-1',
        status: 'active',
        startedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }
      ;(get as any).mockResolvedValueOnce(mockPlan)
      ;(query as any).mockResolvedValueOnce([existingSub])
      ;(del as any).mockResolvedValueOnce({})
      ;(put as any).mockResolvedValueOnce({})

      const fastify = await plansSubscribe.plansSubscribeFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { planId: 'plan-2' },
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.data.planId).toBe('plan-2')
      // The old subscription must have been deleted before the new one was put.
      expect(del).toHaveBeenCalledWith('subscriptions', {
        userId: TEST_USER,
        planId: 'plan-1',
      })
      await fastify.close()
    })

    it('should bump currentPeriodEnd via updateExpr when re-subscribing to the same plan', async () => {
      const mockPlan = {
        id: 'plan-1',
        name: 'Basic',
        price: 9.99,
        interval: 'monthly',
      }
      const existingSub = {
        id: 'sub-001',
        userId: TEST_USER,
        planId: 'plan-1',
        status: 'active',
        startedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      }
      ;(get as any).mockResolvedValueOnce(mockPlan)
      ;(query as any).mockResolvedValueOnce([existingSub])
      ;(updateExpr as any).mockResolvedValueOnce({})

      const fastify = await plansSubscribe.plansSubscribeFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { planId: 'plan-1' },
      })

      expect(response.statusCode).toBe(200)
      // No delete+put when the plan hasn't changed.
      expect(del).not.toHaveBeenCalled()
      expect(put).not.toHaveBeenCalled()
      expect(updateExpr).toHaveBeenCalledWith(
        'subscriptions',
        { userId: TEST_USER, planId: 'plan-1' },
        expect.stringContaining('currentPeriodEnd'),
        expect.objectContaining({ ':status': 'active' })
      )
      await fastify.close()
    })
  })

  describe('creditsReplenish', () => {
    it('should add credits to existing balance atomically', async () => {
      ;(get as any).mockResolvedValueOnce({ userId: TEST_USER, balance: 100 })
      ;(updateExpr as any).mockResolvedValueOnce({
        userId: TEST_USER,
        balance: 150,
      })

      const fastify = await creditsReplenish.creditsReplenishFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/replenish',
        payload: { amount: 50 },
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.newBalance).toBe(150)
      await fastify.close()
    })

    it('should create new credit entry when none exists', async () => {
      ;(get as any).mockResolvedValueOnce(undefined)
      ;(put as any).mockResolvedValueOnce({})

      const fastify = await creditsReplenish.creditsReplenishFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/replenish',
        payload: { amount: 75 },
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.newBalance).toBe(75)
      // The create path must use a conditional put so concurrent first-time
      // replenishments can't silently overwrite each other.
      expect(put).toHaveBeenCalledWith(
        'credits',
        expect.objectContaining({ userId: TEST_USER, balance: 75 }),
        expect.objectContaining({
          conditionExpression: 'attribute_not_exists(userId)',
        })
      )
      await fastify.close()
    })

    it('should merge via atomic increment when a concurrent create beats us to it', async () => {
      // First call sees no record, tries to put; a concurrent request already
      // put it, so ConditionalCheckFailedException is thrown. The handler must
      // fall through to an atomic increment instead of losing the first amount.
      ;(get as any).mockResolvedValueOnce(undefined)
      const condErr = new ConditionalCheckFailedException({
        $metadata: {},
        message: 'already exists',
      })
      ;(put as any).mockRejectedValueOnce(condErr)
      ;(updateExpr as any).mockResolvedValueOnce({
        userId: TEST_USER,
        balance: 125, // 50 from the other writer + 75 from us
      })

      const fastify = await creditsReplenish.creditsReplenishFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/replenish',
        payload: { amount: 75 },
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.newBalance).toBe(125)
      expect(updateExpr).toHaveBeenCalledWith(
        'credits',
        { userId: TEST_USER },
        'SET balance = balance + :amount, updatedAt = :now',
        expect.objectContaining({ ':amount': 75 })
      )
      await fastify.close()
    })
  })

  describe('contentGet', () => {
    it('should return content when found', async () => {
      const mockContent = {
        id: 'content-001',
        title: 'My Article',
        message: 'Hello world',
        authorId: 'user-123',
        createdAt: new Date().toISOString(),
        status: 'published',
      }
      ;(get as any).mockResolvedValueOnce(mockContent)

      const fastify = await contentGet.contentGetFactory(userHook)
      const response = await fastify.inject({
        method: 'GET',
        url: '/content-001',
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.id).toBe('content-001')
      expect(data.data.title).toBe('My Article')
      await fastify.close()
    })

    it('should return 404 when content not found', async () => {
      ;(get as any).mockResolvedValueOnce(undefined)

      const fastify = await contentGet.contentGetFactory(userHook)
      const response = await fastify.inject({
        method: 'GET',
        url: '/nonexistent-id',
      })

      expect(response.statusCode).toBe(404)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(false)
      expect(data.error).toBe('Content not found')
      await fastify.close()
    })
  })
})
