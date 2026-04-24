import type { PayloadHandler } from 'payload'
import { SquareError } from 'square'

import { createSquareClient } from '../lib/squareClient.js'
import type { SquareSubscriptionsAPI } from '../lib/squareTypes.js'
import type { PayloadPluginSquareConfig } from '../types.js'

/**
 * Resolve the Payload customer ID for a given user.
 * Returns null if no customer record exists for the user.
 */
async function resolveCustomerId(
  req: Parameters<PayloadHandler>[0],
  userId: string,
): Promise<string | null> {
  const result = await req.payload.find({
    collection: 'customers',
    where: { user: { equals: userId } },
    limit: 1,
    overrideAccess: true,
  })
  return result.docs.length > 0 ? (result.docs[0]!.id as string) : null
}

/** GET /api/square/subscriptions — list the authenticated user's subscriptions */
export function createListSubscriptionsHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const userId = (req.user as { id: string }).id
    const customerId = await resolveCustomerId(req, userId)
    if (!customerId) {
      return Response.json({ subscriptions: [], totalDocs: 0, hasMore: false })
    }

    if (!req.url) return Response.json({ error: 'Invalid request' }, { status: 400 })
    const url = new URL(req.url)
    const page = Math.max(1, parseInt(url.searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)))

    const result = await req.payload.find({
      collection: 'square-subscriptions',
      where: { customer: { equals: customerId } },
      overrideAccess: true,
      limit,
      page,
      sort: '-createdAt',
    })

    return Response.json({
      subscriptions: result.docs,
      totalDocs: result.totalDocs,
      totalPages: result.totalPages,
      page: result.page,
      hasMore: result.hasNextPage,
    })
  }
}

/** POST /api/square/subscriptions/cancel */
export function createCancelSubscriptionHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const client = createSquareClient(options.accessToken, options.environment ?? 'sandbox')
    const userId = (req.user as { id: string }).id

    let body: { subscriptionId: string }
    try {
      body = JSON.parse((await req.text?.()) ?? '{}') as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.subscriptionId) {
      return Response.json({ error: 'subscriptionId is required' }, { status: 400 })
    }

    const existing = await findOwnedSubscription(req, body.subscriptionId, userId)
    if (!existing) {
      return Response.json({ error: 'Subscription not found' }, { status: 404 })
    }

    try {
      await (client.subscriptions as unknown as SquareSubscriptionsAPI).cancelSubscription(body.subscriptionId)
    } catch (err) {
      if (err instanceof SquareError) {
        req.payload.logger.error({ err }, 'Failed to cancel subscription')
        return Response.json({ error: 'Failed to cancel subscription' }, { status: 502 })
      }
      throw err
    }

    await req.payload.update({
      collection: 'square-subscriptions',
      id: existing.id as string,
      data: { status: 'CANCELED' },
      overrideAccess: true,
    })

    return Response.json({ success: true })
  }
}

/** POST /api/square/subscriptions/pause */
export function createPauseSubscriptionHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const client = createSquareClient(options.accessToken, options.environment ?? 'sandbox')
    const userId = (req.user as { id: string }).id

    let body: { subscriptionId: string; effectiveDate?: string }
    try {
      body = JSON.parse((await req.text?.()) ?? '{}') as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.subscriptionId) {
      return Response.json({ error: 'subscriptionId is required' }, { status: 400 })
    }

    const existing = await findOwnedSubscription(req, body.subscriptionId, userId)
    if (!existing) {
      return Response.json({ error: 'Subscription not found' }, { status: 404 })
    }

    try {
      await (client.subscriptions as unknown as SquareSubscriptionsAPI).pauseSubscription(body.subscriptionId, {
        pause: {
          effectiveDate: body.effectiveDate ?? new Date().toISOString().split('T')[0]!,
        },
      })
    } catch (err) {
      if (err instanceof SquareError) {
        req.payload.logger.error({ err }, 'Failed to pause subscription')
        return Response.json({ error: 'Failed to pause subscription' }, { status: 502 })
      }
      throw err
    }

    await req.payload.update({
      collection: 'square-subscriptions',
      id: existing.id as string,
      data: { status: 'PAUSED' },
      overrideAccess: true,
    })

    return Response.json({ success: true })
  }
}

/** POST /api/square/subscriptions/resume */
export function createResumeSubscriptionHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const client = createSquareClient(options.accessToken, options.environment ?? 'sandbox')
    const userId = (req.user as { id: string }).id

    let body: { subscriptionId: string; resumeEffectiveDate?: string }
    try {
      body = JSON.parse((await req.text?.()) ?? '{}') as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.subscriptionId) {
      return Response.json({ error: 'subscriptionId is required' }, { status: 400 })
    }

    const existing = await findOwnedSubscription(req, body.subscriptionId, userId)
    if (!existing) {
      return Response.json({ error: 'Subscription not found' }, { status: 404 })
    }

    try {
      await (client.subscriptions as unknown as SquareSubscriptionsAPI).resumeSubscription(body.subscriptionId, {
        resumeEffectiveDate: body.resumeEffectiveDate ?? new Date().toISOString().split('T')[0]!,
      })
    } catch (err) {
      if (err instanceof SquareError) {
        req.payload.logger.error({ err }, 'Failed to resume subscription')
        return Response.json({ error: 'Failed to resume subscription' }, { status: 502 })
      }
      throw err
    }

    await req.payload.update({
      collection: 'square-subscriptions',
      id: existing.id as string,
      data: { status: 'ACTIVE' },
      overrideAccess: true,
    })

    return Response.json({ success: true })
  }
}

/**
 * Find a subscription by Square subscription ID that belongs to the given user.
 * Uses a two-step lookup (user → customer → subscription) to avoid relying on
 * nested relationship join queries that may not resolve consistently in all adapters.
 * Returns null (never throws) when not found or not owned by the user.
 */
async function findOwnedSubscription(
  req: Parameters<PayloadHandler>[0],
  squareSubscriptionId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const customerId = await resolveCustomerId(req, userId)
  if (!customerId) return null

  const result = await req.payload.find({
    collection: 'square-subscriptions',
    where: {
      squareSubscriptionId: { equals: squareSubscriptionId },
      customer: { equals: customerId },
    },
    limit: 1,
    overrideAccess: true,
  })

  return result.docs.length > 0 ? (result.docs[0] as Record<string, unknown>) : null
}
