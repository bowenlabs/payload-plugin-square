import type { PayloadHandler } from 'payload'
import { WebhooksHelper } from 'square'

import { broadcastCatalogUpdate, broadcastInventoryUpdate } from '../lib/inventoryBroadcast.js'
import { createSquareClient } from '../lib/squareClient.js'
import type { SquareOrdersAPI } from '../lib/squareTypes.js'
import { syncCatalog } from '../tasks/syncCatalog.js'
import type { PayloadPluginSquareConfig } from '../types.js'

export function createWebhookHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    const { webhookSecret, hooks } = options

    if (!webhookSecret) {
      req.payload.logger.warn(
        'Square webhook received but webhookSecret is not configured in plugin options',
      )
      return new Response('Webhook secret not configured', { status: 500 })
    }

    // Read raw body before any parsing — HMAC is computed over the raw bytes
    const rawBody = (await req.text?.()) ?? ''
    const signatureHeader = req.headers.get('x-square-hmacsha256-signature') ?? ''

    // Use the explicitly configured URL when available (recommended behind a reverse proxy).
    // Falling back to header reconstruction is acceptable for simple deployments but can be
    // spoofed if x-forwarded-* headers are not restricted at the proxy layer.
    const notificationUrl =
      options.webhookUrl ??
      `${req.headers.get('x-forwarded-proto') ?? 'https'}://${req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''}/api/square/webhook`

    let isValid: boolean
    try {
      isValid = await WebhooksHelper.verifySignature({
        requestBody: rawBody,
        signatureHeader,
        signatureKey: webhookSecret,
        notificationUrl,
      })
    } catch (err) {
      req.payload.logger.error({ err }, 'Square webhook signature verification threw')
      return new Response('Signature verification error', { status: 401 })
    }

    if (!isValid) {
      return new Response('Invalid signature', { status: 401 })
    }

    let event: { event_id?: string; type: string; data: { object: Record<string, unknown> } }
    try {
      event = JSON.parse(rawBody) as typeof event
    } catch {
      return new Response('Invalid JSON', { status: 400 })
    }

    const { event_id: eventId, type, data } = event

    // Replay protection — skip events we've already processed.
    // The application-level find+create has a TOCTOU window where two concurrent deliveries
    // of the same event can both pass the "not found" check. The unique constraint on eventId
    // is the hard guard: whichever request loses the race gets a unique violation. We detect
    // duplicates by doing a definitive re-check on any create error, which is robust across
    // all DB adapters without relying on error message string matching.
    if (eventId) {
      const seen = await req.payload.find({
        collection: 'square-webhook-events',
        where: { eventId: { equals: eventId } },
        limit: 1,
        overrideAccess: true,
      })
      if (seen.docs.length > 0) {
        req.payload.logger.info({ eventId }, 'Square webhook duplicate skipped')
        return new Response(null, { status: 200 })
      }
      try {
        await req.payload.create({
          collection: 'square-webhook-events',
          data: { eventId, eventType: type },
          overrideAccess: true,
        })
      } catch (err: unknown) {
        // Definitive re-check: if the record exists now, it's a concurrent duplicate.
        // This is reliable across MongoDB, PostgreSQL, and SQLite without message-string matching.
        const recheck = await req.payload.find({
          collection: 'square-webhook-events',
          where: { eventId: { equals: eventId } },
          limit: 1,
          overrideAccess: true,
        })
        if (recheck.docs.length > 0) {
          req.payload.logger.info({ eventId }, 'Square webhook concurrent duplicate skipped')
          return new Response(null, { status: 200 })
        }
        throw err
      }
    }

    if (hooks?.onWebhookReceived) {
      await hooks.onWebhookReceived({ req, eventType: type, payload: data })
    }

    // Each handler is isolated in its own try/catch so a failure in one handler
    // does not prevent other handlers from running or cause Square to retry the event.
    if (type === 'payment.updated') {
      try { await handlePaymentUpdated(req, data.object) } catch (err) {
        req.payload.logger.error({ err, eventId, eventType: type }, 'payment.updated handler failed')
      }
    }

    if (type === 'loyalty.account.updated') {
      try { await handleLoyaltyAccountUpdated(req, data.object) } catch (err) {
        req.payload.logger.error({ err, eventId, eventType: type }, 'loyalty.account.updated handler failed')
      }
    }

    if (type === 'order.updated') {
      try { await handleOrderUpdated(req, data.object) } catch (err) {
        req.payload.logger.error({ err, eventId, eventType: type }, 'order.updated handler failed')
      }
    }

    if (type === 'inventory.count.updated') {
      try { await handleInventoryCountUpdated(req, data.object) } catch (err) {
        req.payload.logger.error({ err, eventId, eventType: type }, 'inventory.count.updated handler failed')
      }
    }

    if (type === 'catalog.version.updated') {
      handleCatalogVersionUpdated(req, options)
    }

    if (type === 'refund.updated') {
      try { await handleRefundUpdated(req, data.object) } catch (err) {
        req.payload.logger.error({ err, eventId, eventType: type }, 'refund.updated handler failed')
      }
    }

    if (type === 'order.fulfillment.updated') {
      try { await handleFulfillmentUpdated(req, data.object, options) } catch (err) {
        req.payload.logger.error({ err, eventId, eventType: type }, 'order.fulfillment.updated handler failed')
      }
    }

    if (type === 'subscription.updated' || type === 'subscription.created') {
      try { await handleSubscriptionUpdated(req, data.object) } catch (err) {
        req.payload.logger.error({ err, eventId, eventType: type }, 'subscription handler failed')
      }
    }

    // Square retries delivery on any non-200 response
    return new Response(null, { status: 200 })
  }
}

async function handlePaymentUpdated(
  req: Parameters<PayloadHandler>[0],
  object: Record<string, unknown>,
) {
  const payment = (object as { payment?: Record<string, unknown> }).payment
  if (!payment) return

  const squarePaymentId = payment['id'] as string | undefined
  const status = payment['status'] as string | undefined
  if (!squarePaymentId) return

  // Update the raw audit record
  const existing = await req.payload.find({
    collection: 'payments',
    where: { squarePaymentId: { equals: squarePaymentId } },
    overrideAccess: true,
    limit: 1,
  })
  if (existing.docs.length > 0) {
    await req.payload.update({
      collection: 'payments',
      id: existing.docs[0]!.id as string,
      data: { status, rawResponse: payment },
      overrideAccess: true,
    })
  }

  // Sync order status on terminal payment states
  if (status === 'COMPLETED' || status === 'FAILED' || status === 'CANCELED') {
    const orders = await req.payload.find({
      collection: 'orders',
      where: { squarePaymentId: { equals: squarePaymentId } },
      overrideAccess: true,
      limit: 1,
    })
    if (orders.docs.length > 0) {
      const newStatus = status === 'COMPLETED' ? 'paid' : 'failed'
      await req.payload.update({
        collection: 'orders',
        id: orders.docs[0]!.id as string,
        data: { status: newStatus },
        overrideAccess: true,
      })
    }
  }
}

async function handleOrderUpdated(
  req: Parameters<PayloadHandler>[0],
  object: Record<string, unknown>,
) {
  const orderUpdated = (object as { order_updated?: Record<string, unknown> }).order_updated
  if (!orderUpdated) return

  const squareOrderId = orderUpdated['order_id'] as string | undefined
  const state = orderUpdated['state'] as string | undefined
  if (!squareOrderId || !state) return

  const statusMap: Record<string, 'paid' | 'failed'> = {
    COMPLETED: 'paid',
    CANCELED: 'failed',
  }
  const newStatus = statusMap[state]
  if (!newStatus) return

  const orders = await req.payload.find({
    collection: 'orders',
    where: { squareOrderId: { equals: squareOrderId } },
    overrideAccess: true,
    limit: 1,
  })
  if (orders.docs.length > 0) {
    await req.payload.update({
      collection: 'orders',
      id: orders.docs[0]!.id as string,
      data: { status: newStatus },
      overrideAccess: true,
    })
  }
}

async function handleLoyaltyAccountUpdated(
  req: Parameters<PayloadHandler>[0],
  object: Record<string, unknown>,
) {
  type RawLoyaltyAccount = {
    id?: string
    balance?: number
    mapping?: { type?: string; value?: string }
  }
  const account = (object as { loyalty_account?: RawLoyaltyAccount }).loyalty_account
  if (!account?.id) return

  const accountId = account.id
  const balance = account.balance ?? 0
  const email =
    account.mapping?.type === 'EMAIL' ? account.mapping.value : undefined

  // Find customer by loyaltyAccountId first, fall back to email
  let customers = await req.payload.find({
    collection: 'customers',
    where: { loyaltyAccountId: { equals: accountId } },
    limit: 1,
    overrideAccess: true,
  })

  if (customers.docs.length === 0 && email) {
    customers = await req.payload.find({
      collection: 'customers',
      where: { email: { equals: email } },
      limit: 1,
      overrideAccess: true,
    })
  }

  if (customers.docs.length > 0) {
    await req.payload.update({
      collection: 'customers',
      id: customers.docs[0]!.id as string,
      data: { loyaltyPoints: balance, loyaltyAccountId: accountId },
      overrideAccess: true,
    })
    req.payload.logger.info({ accountId, balance }, 'Loyalty balance synced')
  }
}

// Fire-and-forget: respond to Square immediately, sync in background
function handleCatalogVersionUpdated(
  req: Parameters<PayloadHandler>[0],
  options: PayloadPluginSquareConfig,
) {
  const mediaCollectionSlug = options.mediaCollectionSlug ?? 'media'
  void syncCatalog({
    accessToken: options.accessToken,
    environment: options.environment,
    locationId: options.locationId,
    mediaCollectionSlug,
    payload: req.payload,
  })
    .then(({ synced }) => {
      req.payload.logger.info({ synced }, 'catalog.version.updated sync complete')
      if (synced > 0) broadcastCatalogUpdate()
    })
    .catch((err: unknown) => {
      req.payload.logger.error({ err }, 'catalog.version.updated sync failed')
    })
}

async function handleRefundUpdated(
  req: Parameters<PayloadHandler>[0],
  object: Record<string, unknown>,
) {
  const refund = (object as { refund?: Record<string, unknown> }).refund
  if (!refund) return

  const squarePaymentId = refund['payment_id'] as string | undefined
  const status = refund['status'] as string | undefined
  if (!squarePaymentId || status !== 'COMPLETED') return

  const orders = await req.payload.find({
    collection: 'orders',
    where: { squarePaymentId: { equals: squarePaymentId } },
    overrideAccess: true,
    limit: 1,
  })
  if (orders.docs.length === 0) return

  const order = orders.docs[0]!
  const orderTotal = order.total as number
  const refundAmount = Number(
    (refund['amount_money'] as { amount?: number } | undefined)?.amount ?? 0,
  )

  const newStatus = refundAmount >= orderTotal ? 'refunded' : 'partially_refunded'

  await req.payload.update({
    collection: 'orders',
    id: order.id as string,
    data: { status: newStatus },
    overrideAccess: true,
  })

  req.payload.logger.info(
    { orderId: order.id, newStatus, refundAmount, orderTotal },
    'Refund processed',
  )
}

async function handleFulfillmentUpdated(
  req: Parameters<PayloadHandler>[0],
  object: Record<string, unknown>,
  options: PayloadPluginSquareConfig,
) {
  type FulfillmentUpdate = { fulfillment_uid?: string; new_state?: string }
  const squareOrderId = object['order_id'] as string | undefined
  const updates = (object['fulfillment_update'] as FulfillmentUpdate[] | undefined) ?? []

  if (!squareOrderId || updates.length === 0) return

  // Find the Payload order by squareOrderId
  const orders = await req.payload.find({
    collection: 'orders',
    where: { squareOrderId: { equals: squareOrderId } },
    overrideAccess: true,
    limit: 1,
  })
  if (orders.docs.length === 0) return

  const payloadOrder = orders.docs[0]!
  const orderId = payloadOrder.id as string

  // Match the specific fulfillment to the one we stored, or use the first update
  const storedUid = payloadOrder.squareFulfillmentUid as string | undefined
  const update = updates.find((u) => !storedUid || u.fulfillment_uid === storedUid) ?? updates[0]!
  const newState = update.new_state

  const fulfillmentStatusMap: Record<string, 'pending' | 'shipped' | 'delivered' | 'failed'> = {
    PROPOSED: 'pending',
    RESERVED: 'pending',
    PREPARED: 'shipped',
    COMPLETED: 'delivered',
    CANCELED: 'failed',
    FAILED: 'failed',
  }
  const newFulfillmentStatus = newState ? (fulfillmentStatusMap[newState] ?? 'pending') : undefined

  // Fetch the full Square order to get tracking info
  let trackingNumber: string | undefined
  let trackingUrl: string | undefined
  let carrier: string | undefined

  try {
    const client = createSquareClient(options.accessToken, options.environment ?? 'sandbox')
    const orderResp = await (client.orders as unknown as SquareOrdersAPI).retrieve(squareOrderId)
    const fulfillment = orderResp.order?.fulfillments?.find(
      (f) => !storedUid || f.uid === storedUid,
    )
    const shipmentDetails = fulfillment?.shipmentDetails
    trackingNumber = shipmentDetails?.trackingNumber
    trackingUrl = shipmentDetails?.trackingUrl
    carrier = shipmentDetails?.carrier
  } catch (err) {
    req.payload.logger.warn({ err }, 'Failed to retrieve Square order for fulfillment details')
  }

  await req.payload.update({
    collection: 'orders',
    id: orderId,
    data: {
      ...(newFulfillmentStatus ? { fulfillmentStatus: newFulfillmentStatus } : {}),
      ...(trackingNumber ? { trackingNumber } : {}),
      ...(trackingUrl ? { trackingUrl } : {}),
      ...(carrier ? { shippingCarrier: carrier } : {}),
    },
    overrideAccess: true,
  })

  req.payload.logger.info(
    { orderId, newFulfillmentStatus, trackingNumber },
    'Fulfillment updated',
  )
}

async function handleSubscriptionUpdated(
  req: Parameters<PayloadHandler>[0],
  object: Record<string, unknown>,
) {
  const sub = (object as { subscription?: Record<string, unknown> }).subscription
  if (!sub?.id) return

  const squareSubscriptionId = sub['id'] as string
  const status = sub['status'] as string | undefined
  const chargedThroughDate = sub['charged_through_date'] as string | undefined

  const existing = await req.payload.find({
    collection: 'square-subscriptions',
    where: { squareSubscriptionId: { equals: squareSubscriptionId } },
    limit: 1,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    await req.payload.update({
      collection: 'square-subscriptions',
      id: existing.docs[0]!.id as string,
      data: {
        ...(status ? { status } : {}),
        ...(chargedThroughDate ? { chargedThroughDate } : {}),
      },
      overrideAccess: true,
    })
    req.payload.logger.info({ squareSubscriptionId, status }, 'Subscription updated')
  }
}

async function handleInventoryCountUpdated(
  req: Parameters<PayloadHandler>[0],
  object: Record<string, unknown>,
) {
  type RawCount = {
    catalog_object_id?: string
    catalog_object_type?: string
    state?: string
    quantity?: string
  }

  const counts = ((object as { inventory_counts?: RawCount[] }).inventory_counts ?? []).filter(
    (c) => c.catalog_object_type === 'ITEM_VARIATION' && c.state === 'IN_STOCK' && c.catalog_object_id,
  )

  req.payload.logger.info({ count: counts.length }, 'inventory.count.updated received')

  if (counts.length === 0) return

  // Fetch all catalog items once before the loop to avoid N+1 queries
  const all = await req.payload.find({
    collection: 'catalog',
    overrideAccess: true,
    pagination: false,
    limit: 0,
  })

  for (const count of counts) {
    const variationSquareId = count.catalog_object_id!
    const newQuantity = count.quantity !== undefined ? parseFloat(count.quantity) : 0

    const result = all.docs.find((doc) =>
      (doc.variations as Array<{ squareId: string }>).some((v) => v.squareId === variationSquareId),
    )

    if (!result) {
      req.payload.logger.info({ variationSquareId }, 'No catalog item found for variation')
      continue
    }

    type Variation = { id?: string; squareId: string; inventoryCount?: number; [key: string]: unknown }

    const updatedVariations = (result.variations as Variation[]).map((v) =>
      v.squareId === variationSquareId ? { ...v, inventoryCount: newQuantity } : v,
    )

    await req.payload.update({
      collection: 'catalog',
      id: result.id,
      data: { variations: updatedVariations },
      overrideAccess: true,
    })

    broadcastInventoryUpdate(variationSquareId, newQuantity)

    req.payload.logger.info({ variationSquareId, newQuantity }, 'Inventory updated')
  }
}
