import { describe, expect, it, vi } from 'vitest'

import { createCheckoutHandler } from '../endpoints/checkout.js'

// ── Square SDK mock ──────────────────────────────────────────────────────────
vi.mock('square', async (importOriginal) => {
  const actual = await importOriginal<typeof import('square')>()
  return {
    ...actual,
    SquareClient: vi.fn().mockImplementation(() => ({})),
    SquareError: actual.SquareError,
  }
})

vi.mock('../lib/squareClient.js', () => ({
  createSquareClient: vi.fn(() => ({
    catalog: {
      batchGet: vi.fn().mockResolvedValue({ objects: [] }),
    },
    inventory: {
      batchGetCounts: vi.fn().mockResolvedValue({ asyncIterator: () => ({ next: async () => ({ done: true }) }) }),
    },
    orders: { create: vi.fn() },
    payments: { create: vi.fn() },
    customers: {
      search: vi.fn().mockResolvedValue({ customers: [] }),
      create: vi.fn().mockResolvedValue({ customer: { id: 'sq-cust-1' } }),
    },
  })),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(body: unknown) {
  return {
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    headers: { get: vi.fn().mockReturnValue(null) },
    payload: {
      find: vi.fn().mockResolvedValue({ docs: [] }),
      create: vi.fn().mockResolvedValue({ id: 'order-1', orderNumber: 'ORD-123', total: 500 }),
      update: vi.fn().mockResolvedValue({}),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      sendEmail: vi.fn().mockResolvedValue(undefined),
    },
    user: null,
  }
}

const baseOptions = {
  accessToken: 'sandbox-token',
  locationId: 'LOC_SANDBOX',
  environment: 'sandbox' as const,
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createCheckoutHandler — input validation', () => {
  it('returns 400 when cart.items is missing', async () => {
    const handler = createCheckoutHandler(baseOptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({ sourceId: 'tok_1' }) as any)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/cart\.items/)
  })

  it('returns 400 when cart.items is an empty array', async () => {
    const handler = createCheckoutHandler(baseOptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({ sourceId: 'tok_1', cart: { items: [] } }) as any)
    expect(res.status).toBe(400)
  })

  it('returns 400 when sourceId is missing', async () => {
    const handler = createCheckoutHandler(baseOptions)
    const res = await handler(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeReq({ cart: { items: [{ variationId: 'v1', quantity: 1, unitPrice: 100 }] } }) as any,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/sourceId/)
  })

  it('returns 400 when a cart item is missing variationId', async () => {
    const handler = createCheckoutHandler(baseOptions)
    const res = await handler(
      makeReq({
        sourceId: 'tok_1',
        cart: { items: [{ quantity: 1, unitPrice: 100 }] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/variationId/)
  })

  it('returns 400 for invalid JSON body', async () => {
    const handler = createCheckoutHandler(baseOptions)
    const req = {
      text: vi.fn().mockResolvedValue('not-valid-json{{{'),
      headers: { get: vi.fn().mockReturnValue(null) },
      payload: {
        find: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      },
      user: null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(req as any)
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/Invalid JSON/)
  })
})

describe('createCheckoutHandler — price verification', () => {
  it('returns 400 when catalog variation is not found', async () => {
    const { createSquareClient } = await import('../lib/squareClient.js')
    vi.mocked(createSquareClient).mockReturnValueOnce({
      catalog: {
        batchGet: vi.fn().mockResolvedValue({ objects: [] }), // empty — variation not found
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const handler = createCheckoutHandler(baseOptions)
    const res = await handler(
      makeReq({
        sourceId: 'tok_1',
        cart: { items: [{ variationId: 'var-missing', quantity: 1, unitPrice: 100 }] },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/not found/)
  })

  it('returns 400 when client-side price does not match Square catalog', async () => {
    const { createSquareClient } = await import('../lib/squareClient.js')
    vi.mocked(createSquareClient).mockReturnValueOnce({
      catalog: {
        batchGet: vi.fn().mockResolvedValue({
          objects: [
            {
              id: 'var-1',
              type: 'ITEM_VARIATION',
              itemVariationData: { priceMoney: { amount: BigInt(500) } }, // server says 500 cents
            },
          ],
        }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const handler = createCheckoutHandler(baseOptions)
    const res = await handler(
      makeReq({
        sourceId: 'tok_1',
        cart: {
          items: [{ variationId: 'var-1', quantity: 1, unitPrice: 999 }], // client claims 999
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/[Pp]rice mismatch/)
  })
})

describe('createCheckoutHandler — shipping validation', () => {
  it('returns 400 when shippingAddress is missing required field', async () => {
    const handler = createCheckoutHandler({
      ...baseOptions,
      shipping: { rates: [{ id: 'standard', name: 'Standard', amount: 599 }] },
    })
    const res = await handler(
      makeReq({
        sourceId: 'tok_1',
        cart: {
          items: [{ variationId: 'v1', quantity: 1, unitPrice: 100 }],
          shippingAddress: { firstName: 'Jane', lastName: 'Doe', address1: '1 Main St' },
          // city/state/zip missing
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/shippingAddress\.city/)
  })

  it('returns 400 when shippingRateId is missing and shipping is configured', async () => {
    const handler = createCheckoutHandler({
      ...baseOptions,
      shipping: { rates: [{ id: 'standard', name: 'Standard', amount: 599 }] },
    })
    const res = await handler(
      makeReq({
        sourceId: 'tok_1',
        cart: {
          items: [{ variationId: 'v1', quantity: 1, unitPrice: 100 }],
          shippingAddress: {
            firstName: 'Jane', lastName: 'Doe', address1: '1 Main St',
            city: 'Portland', state: 'OR', zip: '97201',
          },
          // shippingRateId omitted
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/shippingRateId/)
  })

  it('returns 400 when shippingRateId does not match a configured rate', async () => {
    const handler = createCheckoutHandler({
      ...baseOptions,
      shipping: { rates: [{ id: 'standard', name: 'Standard', amount: 599 }] },
    })
    const res = await handler(
      makeReq({
        sourceId: 'tok_1',
        cart: {
          items: [{ variationId: 'v1', quantity: 1, unitPrice: 100 }],
          shippingAddress: {
            firstName: 'Jane', lastName: 'Doe', address1: '1 Main St',
            city: 'Portland', state: 'OR', zip: '97201',
          },
          shippingRateId: 'nonexistent-rate',
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string }
    expect(body.error).toMatch(/Unknown shippingRateId/)
  })

  it('skips shippingRateId requirement when cart qualifies for free shipping', async () => {
    const { createSquareClient } = await import('../lib/squareClient.js')
    vi.mocked(createSquareClient).mockReturnValueOnce({
      catalog: {
        batchGet: vi.fn().mockResolvedValue({
          objects: [
            {
              id: 'var-1',
              type: 'ITEM_VARIATION',
              itemVariationData: { name: 'Widget', priceMoney: { amount: BigInt(5000) } },
            },
          ],
        }),
      },
      inventory: {
        batchGetCounts: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {},
        }),
      },
      orders: {
        create: vi.fn().mockResolvedValue({
          order: {
            id: 'sq-order-1',
            totalMoney: { amount: BigInt(5000), currency: 'USD' },
            totalTaxMoney: { amount: BigInt(0), currency: 'USD' },
            fulfillments: [{ uid: 'f-uid-1' }],
          },
        }),
      },
      payments: {
        create: vi.fn().mockResolvedValue({
          payment: {
            id: 'sq-pay-1',
            status: 'COMPLETED',
            amountMoney: { amount: BigInt(5000), currency: 'USD' },
          },
        }),
      },
      customers: {
        search: vi.fn().mockResolvedValue({ customers: [] }),
        create: vi.fn().mockResolvedValue({ customer: { id: 'sq-cust-1' } }),
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const handler = createCheckoutHandler({
      ...baseOptions,
      shipping: { rates: [{ id: 'standard', name: 'Standard', amount: 599 }], freeShippingThreshold: 3000 },
    })
    const res = await handler(
      makeReq({
        sourceId: 'tok_1',
        cart: {
          items: [{ variationId: 'var-1', quantity: 1, unitPrice: 5000 }], // above threshold
          shippingAddress: {
            firstName: 'Jane', lastName: 'Doe', address1: '1 Main St',
            city: 'Portland', state: 'OR', zip: '97201',
          },
          // no shippingRateId — should be fine because cart qualifies for free shipping
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )
    expect(res.status).toBe(200)
  })
})

describe('createCheckoutHandler — loyalty opt-in gating', () => {
  it('does not attempt loyalty setup when loyaltyOptIn is false', async () => {
    const { createSquareClient } = await import('../lib/squareClient.js')
    const mockLoyaltySearchAccounts = vi.fn()
    vi.mocked(createSquareClient).mockReturnValueOnce({
      catalog: {
        batchGet: vi.fn().mockResolvedValue({
          objects: [
            {
              id: 'var-1',
              type: 'ITEM_VARIATION',
              itemVariationData: { name: 'Default', priceMoney: { amount: BigInt(100) } },
            },
          ],
        }),
      },
      inventory: {
        batchGetCounts: vi.fn().mockReturnValue({
          [Symbol.asyncIterator]: async function* () {},
        }),
      },
      orders: {
        create: vi.fn().mockResolvedValue({
          order: {
            id: 'sq-order-1',
            totalMoney: { amount: BigInt(100), currency: 'USD' },
            totalTaxMoney: { amount: BigInt(0), currency: 'USD' },
          },
        }),
      },
      payments: {
        create: vi.fn().mockResolvedValue({
          payment: {
            id: 'sq-pay-1',
            status: 'COMPLETED',
            amountMoney: { amount: BigInt(100), currency: 'USD' },
          },
        }),
      },
      customers: {
        search: vi.fn().mockResolvedValue({ customers: [] }),
        create: vi.fn().mockResolvedValue({ customer: { id: 'sq-cust-1' } }),
      },
      loyalty: { searchAccounts: mockLoyaltySearchAccounts },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)

    const handler = createCheckoutHandler({ ...baseOptions, loyalty: { programId: 'main' } })
    await handler(
      makeReq({
        sourceId: 'tok_1',
        cart: {
          items: [{ variationId: 'var-1', quantity: 1, unitPrice: 100 }],
          guestEmail: 'guest@example.com',
          loyaltyOptIn: false, // ← no opt-in
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )

    // Square loyalty API should NOT have been called
    expect(mockLoyaltySearchAccounts).not.toHaveBeenCalled()
  })
})
