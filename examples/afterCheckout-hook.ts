/**
 * afterCheckout hook example
 *
 * Runs server-side after a successful Square payment. Use it to:
 *  - Trigger fulfilment / shipping
 *  - Notify an internal CRM or ERP
 *  - Send a custom transactional email
 *  - Fire an analytics event
 *
 * The hook is non-blocking from the customer's perspective — the checkout
 * response is already sent before this runs. Throw errors freely; they will
 * be caught and logged by the handler.
 */

import type { AfterCheckoutContext } from 'payload-plugin-square'

export async function afterCheckoutHook({ req, order, payment }: AfterCheckoutContext) {
  // order   — the Payload Order document just created
  // payment — the Square payment object (id, status, amount, currency, rawResponse)
  // req     — the Payload request (gives you req.payload for further DB operations)

  // ── Example 1: notify a fulfilment system ──────────────────────────────────
  await fetch('https://fulfilment.example.com/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.FULFILMENT_API_KEY}` },
    body: JSON.stringify({
      externalOrderId: order.id,
      orderNumber: order.orderNumber,
      lineItems: order.lineItems,
      total: order.total,
    }),
  })

  // ── Example 2: store a custom audit field on the order ─────────────────────
  await req.payload.update({
    collection: 'orders',
    id: order.id,
    data: { fulfilmentNotifiedAt: new Date().toISOString() },
    overrideAccess: true,
  })

  // ── Example 3: track in analytics ─────────────────────────────────────────
  req.payload.logger.info({
    event: 'purchase',
    orderId: order.id,
    revenue: order.total / 100, // convert cents to dollars
    currency: order.currency,
  })
}

// ── Plugin registration ────────────────────────────────────────────────────
//
// In your payload.config.ts:
//
// payloadPluginSquare({
//   accessToken: process.env.SQUARE_ACCESS_TOKEN!,
//   locationId:  process.env.SQUARE_LOCATION_ID!,
//   hooks: {
//     afterCheckout: afterCheckoutHook,
//   },
// })
