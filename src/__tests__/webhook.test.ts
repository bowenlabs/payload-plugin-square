import { describe, expect, it, vi } from 'vitest'

import { createWebhookHandler } from '../endpoints/webhook.js'

// ── Square SDK mock ──────────────────────────────────────────────────────────
vi.mock('square', async (importOriginal) => {
  const actual = await importOriginal<typeof import('square')>()
  return {
    ...actual,
    WebhooksHelper: {
      verifySignature: vi.fn().mockResolvedValue(true),
    },
  }
})

vi.mock('../lib/squareClient.js', () => ({
  createSquareClient: vi.fn(() => ({})),
}))

vi.mock('../tasks/syncCatalog.js', () => ({
  syncCatalog: vi.fn().mockResolvedValue({ synced: 0 }),
}))

vi.mock('../lib/inventoryBroadcast.js', () => ({
  broadcastInventoryUpdate: vi.fn(),
  broadcastCatalogUpdate: vi.fn(),
}))

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(overrides: {
  body?: object
  signatureHeader?: string
  proto?: string
  host?: string
  payloadOverrides?: Partial<ReturnType<typeof defaultPayload>>
}) {
  const body = overrides.body ?? validEvent()
  const payload = { ...defaultPayload(), ...overrides.payloadOverrides }

  return {
    text: vi.fn().mockResolvedValue(JSON.stringify(body)),
    headers: {
      get: vi.fn((header: string) => {
        if (header === 'x-square-hmacsha256-signature') return overrides.signatureHeader ?? 'valid-sig'
        if (header === 'x-forwarded-proto') return overrides.proto ?? null
        if (header === 'x-forwarded-host') return null
        if (header === 'host') return overrides.host ?? 'localhost:3000'
        return null
      }),
    },
    payload,
  }
}

function defaultPayload() {
  return {
    find: vi.fn().mockResolvedValue({ docs: [] }),
    create: vi.fn().mockResolvedValue({ id: 'evt-1' }),
    update: vi.fn().mockResolvedValue({}),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  }
}

function validEvent(overrides?: Partial<{ event_id: string; type: string; data: object }>) {
  return {
    event_id: 'evt-abc123',
    type: 'payment.updated',
    data: { object: {} },
    ...overrides,
  }
}

const baseOptions = {
  accessToken: 'test-token',
  locationId: 'LOC_1',
  webhookSecret: 'webhook-secret-key',
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('createWebhookHandler — configuration', () => {
  it('returns 500 when webhookSecret is not configured', async () => {
    const handler = createWebhookHandler({ ...baseOptions, webhookSecret: undefined })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({}) as any)
    expect(res.status).toBe(500)
  })
})

describe('createWebhookHandler — signature verification', () => {
  it('returns 401 when the HMAC signature is invalid', async () => {
    const { WebhooksHelper } = await import('square')
    vi.mocked(WebhooksHelper.verifySignature).mockResolvedValueOnce(false)

    const handler = createWebhookHandler(baseOptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({ signatureHeader: 'bad-sig' }) as any)
    expect(res.status).toBe(401)
  })

  it('returns 401 when signature verification throws', async () => {
    const { WebhooksHelper } = await import('square')
    vi.mocked(WebhooksHelper.verifySignature).mockRejectedValueOnce(new Error('crypto error'))

    const handler = createWebhookHandler(baseOptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({}) as any)
    expect(res.status).toBe(401)
  })

  it('returns 200 for a valid signature', async () => {
    const handler = createWebhookHandler(baseOptions)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(makeReq({}) as any)
    expect(res.status).toBe(200)
  })
})

describe('createWebhookHandler — replay protection', () => {
  it('returns 200 and skips processing for a duplicate event ID', async () => {
    const handler = createWebhookHandler(baseOptions)

    const payloadOverrides = {
      // Simulate the event already being recorded
      find: vi.fn().mockResolvedValue({ docs: [{ id: 'evt-1' }] }),
      create: vi.fn(),
      update: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }

    const res = await handler(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeReq({ payloadOverrides }) as any,
    )

    expect(res.status).toBe(200)
    // create should NOT have been called (skipped duplicate)
    expect(payloadOverrides.create).not.toHaveBeenCalled()
  })

  it('records a new event ID on first processing', async () => {
    const handler = createWebhookHandler(baseOptions)

    const payloadOverrides = {
      find: vi.fn().mockResolvedValue({ docs: [] }), // not seen before
      create: vi.fn().mockResolvedValue({ id: 'evt-new' }),
      update: vi.fn(),
      logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    }

    const res = await handler(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      makeReq({ payloadOverrides }) as any,
    )

    expect(res.status).toBe(200)
    expect(payloadOverrides.create).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'square-webhook-events',
        data: expect.objectContaining({ eventId: 'evt-abc123' }),
      }),
    )
  })
})

describe('createWebhookHandler — event routing', () => {
  it('returns 400 for malformed JSON body', async () => {
    const { WebhooksHelper } = await import('square')
    vi.mocked(WebhooksHelper.verifySignature).mockResolvedValueOnce(true)

    const handler = createWebhookHandler(baseOptions)
    const req = {
      text: vi.fn().mockResolvedValue('{ invalid json'),
      headers: { get: vi.fn().mockReturnValue('valid-sig') },
      payload: {
        ...defaultPayload(),
        // Signature check passes but JSON is invalid
      },
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await handler(req as any)
    expect(res.status).toBe(400)
  })

  it('calls onWebhookReceived hook with the correct event type', async () => {
    const onWebhookReceived = vi.fn().mockResolvedValue(undefined)
    const handler = createWebhookHandler({
      ...baseOptions,
      hooks: { onWebhookReceived },
    })

    await handler(
      makeReq({
        body: validEvent({ type: 'catalog.version.updated', event_id: 'evt-cat-1' }),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    )

    expect(onWebhookReceived).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: 'catalog.version.updated' }),
    )
  })
})
