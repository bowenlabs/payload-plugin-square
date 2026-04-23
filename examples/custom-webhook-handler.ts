/**
 * onWebhookReceived hook example
 *
 * Called for every verified, non-duplicate webhook event before the plugin's
 * own built-in handling runs. Use it to react to event types the plugin
 * doesn't handle natively, or to run side effects on events it does.
 *
 * Supported events (subscribe in Square Dashboard):
 *   payment.updated            order.updated
 *   inventory.count.updated    catalog.version.updated
 *   refund.updated             loyalty.account.updated
 *   subscription.created       subscription.updated       (Square Subscriptions)
 *   dispute.created            dispute.state.updated      (Disputes)
 *   booking.created            booking.updated            (Square Appointments)
 */

import type { WebhookContext } from 'payload-plugin-square'

export async function onWebhookReceived({ req, eventType, payload }: WebhookContext) {
  // eventType — e.g. 'payment.updated'
  // payload   — the raw event data object from Square (typed as unknown)
  // req       — the Payload request

  // ── Example 1: log every event for observability ───────────────────────────
  req.payload.logger.info({ event: eventType }, 'Square webhook received')

  // ── Example 2: handle an event the plugin doesn't cover natively ──────────
  if (eventType === 'dispute.created') {
    const disputeData = payload as { dispute?: { id?: string; amount_money?: { amount?: number } } }
    const dispute = disputeData.dispute

    if (dispute?.id) {
      req.payload.logger.warn(
        { disputeId: dispute.id, amount: dispute.amount_money?.amount },
        'Square dispute created — manual review required',
      )

      // Optionally write to a custom disputes collection:
      // await req.payload.create({
      //   collection: 'disputes',
      //   data: { squareDisputeId: dispute.id, status: 'open', rawData: dispute },
      //   overrideAccess: true,
      // })
    }
  }

  // ── Example 3: forward all events to an external system ───────────────────
  if (process.env.WEBHOOK_RELAY_URL) {
    void fetch(process.env.WEBHOOK_RELAY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: eventType, data: payload }),
    }).catch((err: unknown) => {
      req.payload.logger.warn({ err }, 'Webhook relay failed')
    })
  }
}

// ── Plugin registration ────────────────────────────────────────────────────
//
// payloadPluginSquare({
//   accessToken: process.env.SQUARE_ACCESS_TOKEN!,
//   locationId:  process.env.SQUARE_LOCATION_ID!,
//   hooks: {
//     onWebhookReceived: onWebhookReceived,
//   },
// })
