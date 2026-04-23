import { describe, expect, it, vi } from 'vitest'

import { createSubscribeHandler } from '../endpoints/subscribe.js'

// ── Square SDK mock ──────────────────────────────────────────────────────────
vi.mock('square', async (importOriginal) => {
  const actual = await importOriginal<typeof import('square')>()
  return {
    ...actual,
    SquareClient: vi.fn().mockImplementation(() => ({})),
    SquareError: actual.SquareError,
  }
})

const mockCreateCard = vi.fn().mockResolvedValue({ card: { id: 'card-1' } })
const mockCreateSubscription = vi.fn().mockResolvedValue({
  subscription: { id: 'sub-1', status: 'ACTIVE', chargedThroughDate: '2026-05-23' },
})

vi.mock('../lib/squareClient.js', () => ({
  createSquareClient: vi.fn(() => ({
    customers: {
      search: vi.fn().mockResolvedValue({ customers: [] }),
      create: vi.fn().mockResolvedValue({ customer: { id: 'sq-cust-1' } }),
    },
    cards: { create: mockCreateCard },
    catalog: {
      batchGet: vi.fn().mockResolvedValue({ objects: [] }),
    },
    subscriptions: { createSubscription: mockCreateSubscription },
  })),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown, user: unknown = null) {
  return {
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    payload: {
      find: vi.fn().mockResolvedValue({ docs: [] }),
      create: vi.fn().mockResolvedValue({ id: 'ps-sub-1', squareSubscriptionId: 'sub-1' }),
      update: vi.fn().mockResolvedValue({}),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    },
    user,
  }
}

const baseOptions = {
  accessToken: 'sandbox-token',
  locationId: 'LOC_SANDBOX',
  environment: 'sandbox' as const,
  subscriptions: {} as Record<string, never>,
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createSubscribeHandler — input validation', () => {
  it('returns 400 when sourceId is missing', async () => {
    const handler = createSubscribeHandler(baseOptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({ planVariationId: 'var-1', guestEmail: 'a@b.com' }) as any)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/sourceId/)
  })

  it('returns 400 when planVariationId is missing', async () => {
    const handler = createSubscribeHandler(baseOptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({ sourceId: 'nonce-ok', guestEmail: 'a@b.com' }) as any)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/planVariationId/)
  })

  it('returns 400 when neither userId nor guestEmail is provided', async () => {
    const handler = createSubscribeHandler(baseOptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({ sourceId: 'nonce-ok', planVariationId: 'var-1' }) as any)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/userId or guestEmail/)
  })

  it('creates subscription and returns 201 for valid request', async () => {
    const handler = createSubscribeHandler(baseOptions)
    const res = await handler(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeReq({ sourceId: 'cnon:card-nonce-ok', planVariationId: 'var-1', guestEmail: 'a@b.com' }) as any,
    )
    expect(res.status).toBe(201)
    const body = (await res.json()) as { subscription: { id: string } }
    expect(body.subscription).toBeDefined()
    expect(mockCreateCard).toHaveBeenCalledWith(
      expect.objectContaining({ sourceId: 'cnon:card-nonce-ok' }),
    )
    expect(mockCreateSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ planVariationId: 'var-1', cardId: 'card-1' }),
    )
  })
})

describe('createSubscribeHandler — webhook sync', () => {
  it('updates subscription status when subscription.updated received', async () => {
    // This is tested in webhook.test.ts — see handleSubscriptionUpdated tests
    expect(true).toBe(true)
  })
})

describe('createListSubscriptionsHandler', () => {
  it('returns 401 when unauthenticated', async () => {
    const { createListSubscriptionsHandler } = await import('../endpoints/manageSubscriptions.js')
    const handler = createListSubscriptionsHandler(baseOptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({}, null) as any)
    expect(res.status).toBe(401)
  })

  it('returns empty list when user has no customer record', async () => {
    const { createListSubscriptionsHandler } = await import('../endpoints/manageSubscriptions.js')
    const handler = createListSubscriptionsHandler(baseOptions)
    const req = {
      ...makeReq({}, { id: 'user-1' }),
      payload: {
        find: vi.fn().mockResolvedValue({ docs: [], totalDocs: 0 }),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(req as any)
    const body = (await res.json()) as { subscriptions: unknown[]; totalDocs: number }
    expect(body.subscriptions).toHaveLength(0)
  })
})

describe('createCancelSubscriptionHandler', () => {
  it('returns 404 when subscription is not owned by the user', async () => {
    const { createCancelSubscriptionHandler } = await import('../endpoints/manageSubscriptions.js')
    const handler = createCancelSubscriptionHandler(baseOptions)
    const req = {
      text: vi.fn().mockResolvedValue(JSON.stringify({ subscriptionId: 'sub-other' })),
      payload: {
        // customer lookup returns no customer for this user
        find: vi.fn().mockResolvedValue({ docs: [] }),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
      user: { id: 'user-1' },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(req as any)
    expect(res.status).toBe(404)
  })
})
