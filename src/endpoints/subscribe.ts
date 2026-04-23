import type { PayloadHandler } from 'payload'
import { SquareError } from 'square'

import { primaryLocation } from '../lib/locationUtils.js'
import { createSquareClient } from '../lib/squareClient.js'
import type { PayloadPluginSquareConfig } from '../types.js'

export function createSubscribeHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    const client = createSquareClient(options.accessToken, options.environment ?? 'sandbox')
    const locationId = primaryLocation(options.locationId)

    let body: {
      sourceId: string
      planVariationId: string
      userId?: string
      guestEmail?: string
      startDate?: string
    }
    try {
      const raw = (await req.text?.()) ?? ''
      body = JSON.parse(raw) as typeof body
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { sourceId, planVariationId, userId, guestEmail, startDate } = body ?? {}

    if (!sourceId) {
      return Response.json({ error: 'sourceId (Square payment token) is required' }, { status: 400 })
    }
    if (!planVariationId) {
      return Response.json({ error: 'planVariationId is required' }, { status: 400 })
    }
    if (!userId && !guestEmail) {
      return Response.json({ error: 'userId or guestEmail is required' }, { status: 400 })
    }

    // ── Step 1: Find or create Square customer ────────────────────────────────
    let squareCustomerId: string | undefined
    let payloadCustomerId: string | undefined

    const existing = await req.payload.find({
      collection: 'customers',
      where: userId ? { user: { equals: userId } } : { email: { equals: guestEmail } },
      limit: 1,
      overrideAccess: true,
    })

    if (existing.docs.length > 0) {
      const doc = existing.docs[0]!
      payloadCustomerId = doc.id as string
      squareCustomerId = doc.squareCustomerId as string | undefined
    }

    if (!squareCustomerId) {
      try {
        if (guestEmail) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const searchResp = await (client.customers as any).search({
            query: { filter: { emailAddress: { exact: guestEmail } } },
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          squareCustomerId = (searchResp as any).customers?.[0]?.id
        }

        if (!squareCustomerId) {
          const createResp = await client.customers.create({
            emailAddress: guestEmail,
            idempotencyKey: crypto.randomUUID(),
          })
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          squareCustomerId = (createResp as any).customer?.id
        }
      } catch (err) {
        req.payload.logger.warn({ msg: 'Failed to find/create Square customer', err })
        return Response.json({ error: 'Failed to create customer record' }, { status: 502 })
      }
    }

    if (!squareCustomerId) {
      return Response.json({ error: 'Could not resolve Square customer ID' }, { status: 502 })
    }

    // Ensure Payload customer record exists and has squareCustomerId
    if (!payloadCustomerId) {
      const newCustomer = await req.payload.create({
        collection: 'customers',
        data: {
          squareCustomerId,
          user: userId ?? undefined,
          email: guestEmail ?? undefined,
          loyaltyPoints: 0,
        },
        overrideAccess: true,
      })
      payloadCustomerId = newCustomer.id as string
    } else if (!existing.docs[0]?.squareCustomerId) {
      await req.payload.update({
        collection: 'customers',
        id: payloadCustomerId,
        data: { squareCustomerId },
        overrideAccess: true,
      })
    }

    // ── Step 2: Save card on file ─────────────────────────────────────────────
    // Square Subscriptions require a card-on-file (not a one-time nonce).
    // We tokenize in the browser via Web Payments SDK, then save to Square's vault here.
    let squareCardId: string
    try {
      const cardResp = await client.cards.create({
        idempotencyKey: crypto.randomUUID(),
        sourceId,
        card: {
          customerId: squareCustomerId,
        },
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cardId = (cardResp as any).card?.id
      if (!cardId) {
        return Response.json({ error: 'Failed to save card on file' }, { status: 502 })
      }
      squareCardId = cardId as string
    } catch (err) {
      if (err instanceof SquareError) {
        return Response.json({ error: 'Failed to save card', details: err.message }, { status: 402 })
      }
      throw err
    }

    // ── Step 3: Fetch plan variation details ──────────────────────────────────
    let planName: string | undefined
    let cadence: string | undefined
    let priceAmount: number | undefined
    let currency = 'USD'

    try {
      const catalogResp = await client.catalog.batchGet({ objectIds: [planVariationId] })
      const variation = catalogResp.objects?.[0]
      if (variation?.type === 'SUBSCRIPTION_PLAN_VARIATION') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vd = (variation as any).subscriptionPlanVariationData
        planName = vd?.name
        const firstPhase = vd?.phases?.[0]
        cadence = firstPhase?.cadence
        priceAmount = Number(firstPhase?.recurringPriceMoney?.amount ?? 0)
        currency = firstPhase?.recurringPriceMoney?.currency ?? 'USD'
      }
    } catch {
      // non-fatal — proceed without plan metadata
    }

    // ── Step 4: Create Square subscription ────────────────────────────────────
    let squareSubscriptionId: string
    let subscriptionStatus: string
    let chargedThroughDate: string | undefined

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const subResp = await (client.subscriptions as any).createSubscription({
        idempotencyKey: crypto.randomUUID(),
        locationId,
        planVariationId,
        customerId: squareCustomerId,
        cardId: squareCardId,
        startDate: startDate ?? new Date().toISOString().split('T')[0],
      })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = (subResp as any).subscription
      if (!sub?.id) {
        return Response.json({ error: 'Square subscription creation failed', details: subResp.errors }, { status: 502 })
      }
      squareSubscriptionId = sub.id as string
      subscriptionStatus = sub.status as string
      chargedThroughDate = sub.chargedThroughDate as string | undefined
    } catch (err) {
      if (err instanceof SquareError) {
        return Response.json({ error: 'Failed to create subscription', details: err.message }, { status: 502 })
      }
      throw err
    }

    // ── Step 5: Persist to Payload ────────────────────────────────────────────
    const subscription = await req.payload.create({
      collection: 'square-subscriptions',
      data: {
        squareSubscriptionId,
        status: subscriptionStatus,
        planVariationId,
        planName: planName ?? undefined,
        cadence: cadence ?? undefined,
        priceAmount: priceAmount ?? undefined,
        currency,
        startDate: startDate ?? new Date().toISOString().split('T')[0],
        chargedThroughDate: chargedThroughDate ?? undefined,
        squareCustomerId,
        squareCardId,
        customer: payloadCustomerId,
        userId: userId ?? undefined,
      },
      overrideAccess: true,
    })

    return Response.json({ subscription }, { status: 201 })
  }
}
