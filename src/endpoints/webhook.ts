import type { PayloadHandler } from 'payload'
import { WebhooksHelper } from 'square'

import { broadcastInventoryUpdate } from '../lib/inventoryBroadcast.js'
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

    // Reconstruct the notification URL Square used when sending this event
    const proto = req.headers.get('x-forwarded-proto') ?? 'https'
    const host = req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? ''
    const notificationUrl = `${proto}://${host}/api/square/webhook`

    let isValid: boolean
    try {
      isValid = await WebhooksHelper.verifySignature({
        requestBody: rawBody,
        signatureHeader,
        signatureKey: webhookSecret,
        notificationUrl,
      })
    } catch (err) {
      req.payload.logger.error({ msg: 'Square webhook signature verification threw', err })
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

    // Replay protection — skip events we've already processed
    if (eventId) {
      const seen = await req.payload.find({
        collection: 'square-webhook-events',
        where: { eventId: { equals: eventId } },
        limit: 1,
        overrideAccess: true,
      })
      if (seen.docs.length > 0) {
        req.payload.logger.info(`Square webhook duplicate skipped: ${eventId}`)
        return new Response(null, { status: 200 })
      }
      await req.payload.create({
        collection: 'square-webhook-events',
        data: { eventId, eventType: type },
        overrideAccess: true,
      })
    }

    if (hooks?.onWebhookReceived) {
      await hooks.onWebhookReceived({ req, eventType: type, payload: data })
    }

    if (type === 'payment.updated') {
      await handlePaymentUpdated(req, data.object)
    }

    if (type === 'order.updated') {
      await handleOrderUpdated(req, data.object)
    }

    if (type === 'inventory.count.updated') {
      await handleInventoryCountUpdated(req, data.object)
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

  req.payload.logger.info({ object }, 'inventory.count.updated received')

  const counts = ((object as { inventory_counts?: RawCount[] }).inventory_counts ?? []).filter(
    (c) => c.catalog_object_type === 'ITEM_VARIATION' && c.state === 'IN_STOCK' && c.catalog_object_id,
  )

  req.payload.logger.info(`inventory.count.updated: ${counts.length} IN_STOCK variation(s) to process`)

  for (const count of counts) {
    const variationSquareId = count.catalog_object_id!
    const newQuantity = count.quantity ? parseFloat(count.quantity) : 0

    req.payload.logger.info(`Looking for variation squareId=${variationSquareId} qty=${newQuantity}`)

    // Fetch all items and match in memory — more reliable than nested array queries
    const all = await req.payload.find({
      collection: 'catalog',
      overrideAccess: true,
      limit: 200,
    })

    const result = all.docs.find((doc) =>
      (doc.variations as Array<{ squareId: string }>).some((v) => v.squareId === variationSquareId),
    )

    req.payload.logger.info(`Found catalog item: ${result ? result.id : 'none'}`)

    if (!result) continue

    const item = result
    type Variation = { id?: string; squareId: string; inventoryCount?: number; [key: string]: unknown }

    const updatedVariations = (item.variations as Variation[]).map((v) =>
      v.squareId === variationSquareId ? { ...v, inventoryCount: newQuantity } : v,
    )

    await req.payload.update({
      collection: 'catalog',
      id: item.id,
      data: { variations: updatedVariations },
      overrideAccess: true,
    })

    broadcastInventoryUpdate(variationSquareId, newQuantity)

    req.payload.logger.info(
      `Inventory updated: variation ${variationSquareId} → ${newQuantity}`,
    )
  }
}
