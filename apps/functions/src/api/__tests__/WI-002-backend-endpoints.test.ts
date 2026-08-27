import { describe, it, expect, beforeEach, vi } from 'vitest'

// Mock the lib/db module so no real DynamoDB is needed.
vi.mock('@/lib/db', () => ({
  put: vi.fn(),
  get: vi.fn(),
  scan: vi.fn(),
  update: vi.fn(),
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
import { scan, put, update } from '@/lib/db'
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
  })

  describe('creditsBalance', () => {
    it('should return balance 0 when no credits record exists', async () => {
      ;(scan as any).mockResolvedValueOnce([])

      const fastify = await creditsBalance.creditsBalanceFactory(userHook)
      const response = await fastify.inject({
        method: 'GET',
        url: '/',
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.balance).toBe(0)
      await fastify.close()
    })

    it('should return existing balance', async () => {
      const mockCredit = { userId: TEST_USER, balance: 150 }
      ;(scan as any).mockResolvedValueOnce([mockCredit])

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
    it('should debit successfully when sufficient credits', async () => {
      const mockCredit = { userId: TEST_USER, balance: 200 }
      const mockUpdated = { userId: TEST_USER, balance: 150 }
      ;(scan as any).mockResolvedValueOnce([mockCredit])
      ;(update as any).mockResolvedValueOnce(mockUpdated)

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
      await fastify.close()
    })

    it('should return 402 insufficient credits', async () => {
      const mockCredit = { userId: TEST_USER, balance: 10 }
      ;(scan as any).mockResolvedValueOnce([mockCredit])

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
      const mockSubscribe = {
        id: 'sub-001',
        userId: TEST_USER,
        planId: 'plan-1',
        status: 'active',
        startedAt: new Date().toISOString(),
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      }
      ;(scan as any)
        .mockResolvedValueOnce([mockPlan])
      ;(scan as any).mockResolvedValueOnce([])
      ;(put as any).mockResolvedValueOnce(mockSubscribe)

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

    it('should update existing subscription', async () => {
      const mockPlan = {
        id: 'plan-2',
        name: 'Pro',
        price: 19.99,
        interval: 'monthly',
      }
      const mockExistingSub = {
        userId: TEST_USER,
        planId: 'plan-1',
        status: 'active',
        startedAt: new Date().toISOString(),
      }
      const mockUpdated = {
        userId: TEST_USER,
        planId: 'plan-2',
        status: 'active',
        startedAt: mockExistingSub.startedAt,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: new Date().toISOString(),
      }
      ;(scan as any).mockResolvedValueOnce([mockPlan])
      ;(scan as any).mockResolvedValueOnce([mockExistingSub])
      ;(update as any).mockResolvedValueOnce(mockUpdated)

      const fastify = await plansSubscribe.plansSubscribeFactory(userHook)
      const response = await fastify.inject({
        method: 'POST',
        url: '/',
        payload: { planId: 'plan-2' },
      })

      expect(response.statusCode).toBe(200)
      const data = JSON.parse(response.payload)
      expect(data.success).toBe(true)
      expect(data.data.planId).toBe('plan-2')
      await fastify.close()
    })
  })

  describe('creditsReplenish', () => {
    it('should add credits to existing balance', async () => {
      const mockCredit = { userId: TEST_USER, balance: 100 }
      const mockUpdated = { userId: TEST_USER, balance: 150 }
      ;(scan as any).mockResolvedValueOnce([mockCredit])
      ;(update as any).mockResolvedValueOnce(mockUpdated)

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
      ;(scan as any).mockResolvedValueOnce([])
      ;(put as any).mockResolvedValueOnce({ userId: TEST_USER, balance: 75 })

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
      ;(scan as any).mockResolvedValueOnce([mockContent])

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
      ;(scan as any).mockResolvedValueOnce([])

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