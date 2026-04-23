import type { PayloadHandler } from 'payload'
import { SquareError } from 'square'

import { primaryLocation, allLocations } from '../lib/locationUtils.js'
import { createSquareClient } from '../lib/squareClient.js'
import type { Cart, Order, PayloadPluginSquareConfig, SquarePayment } from '../types.js'

export function createCheckoutHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    const { accessToken, locationId, environment = 'sandbox', hooks } = options
    const locationIdPrimary = primaryLocation(locationId)
    const locationIds = allLocations(locationId)
    const client = createSquareClient(accessToken, environment)

    let body: { cart: Cart; sourceId: string }
    try {
      const raw = (await req.text?.()) ?? ''
      body = JSON.parse(raw) as { cart: Cart; sourceId: string }
    } catch {
      return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { cart, sourceId } = body ?? {}

    if (!cart?.items?.length) {
      return Response.json(
        { error: 'cart.items is required and must not be empty' },
        { status: 400 },
      )
    }
    if (!sourceId) {
      return Response.json(
        { error: 'sourceId (Square payment token) is required' },
        { status: 400 },
      )
    }

    // All items must supply a variationId so we can verify prices server-side
    const variationIds = cart.items.map((i) => i.variationId).filter(Boolean) as string[]
    if (variationIds.length !== cart.items.length) {
      return Response.json(
        { error: 'All cart items must have a variationId for server-side price verification' },
        { status: 400 },
      )
    }

    if (hooks?.beforeCheckout) {
      await hooks.beforeCheckout({ req, cart })
    }

    // ── Step 1: Server-side price verification ──────────────────────────────
    let catalogResponse: Awaited<ReturnType<typeof client.catalog.batchGet>>
    try {
      catalogResponse = await client.catalog.batchGet({ objectIds: variationIds })
    } catch (err) {
      if (err instanceof SquareError) {
        return Response.json(
          { error: 'Failed to fetch catalog', details: err.message },
          { status: 502 },
        )
      }
      throw err
    }

    const catalogObjects = catalogResponse.objects ?? []

    for (const item of cart.items) {
      const variation = catalogObjects.find((o) => o.id === item.variationId)
      if (!variation) {
        return Response.json(
          { error: `Catalog variation not found: ${item.variationId}` },
          { status: 400 },
        )
      }
      if (variation.type !== 'ITEM_VARIATION') {
        return Response.json(
          { error: `${item.variationId} is not an item variation` },
          { status: 400 },
        )
      }
      const serverPrice = Number(variation.itemVariationData?.priceMoney?.amount ?? 0)
      if (serverPrice !== item.unitPrice) {
        return Response.json(
          {
            error: 'Price mismatch — cart prices do not match current Square catalog prices',
            variationId: item.variationId,
          },
          { status: 400 },
        )
      }
    }

    // ── Step 2: Inventory validation ────────────────────────────────────────
    try {
      const inventoryMap = new Map<string, number>()
      for await (const count of await client.inventory.batchGetCounts({
        catalogObjectIds: variationIds,
        locationIds,
      })) {
        if (count.catalogObjectId && count.quantity) {
          inventoryMap.set(count.catalogObjectId, parseFloat(count.quantity))
        }
      }

      for (const item of cart.items) {
        const available = inventoryMap.get(item.variationId!)
        // Only block if the variation actively tracks inventory and stock is insufficient
        if (available !== undefined && available < item.quantity) {
          return Response.json(
            {
              error: `Not enough stock for ${item.variationId} — requested ${item.quantity}, available ${available}`,
              variationId: item.variationId,
            },
            { status: 400 },
          )
        }
      }
    } catch (err) {
      if (err instanceof SquareError) {
        return Response.json(
          { error: 'Failed to verify inventory', details: err.message },
          { status: 502 },
        )
      }
      throw err
    }

    // ── Step 3: Create Square Order (catalog refs let Square apply taxes) ───
    let squareOrder: NonNullable<Awaited<ReturnType<typeof client.orders.create>>['order']>
    try {
      const orderResponse = await client.orders.create({
        idempotencyKey: crypto.randomUUID(),
        order: {
          locationId: locationIdPrimary,
          lineItems: cart.items.map((item) => ({
            catalogObjectId: item.variationId,
            quantity: String(item.quantity),
          })),
        },
      })
      if (!orderResponse.order) {
        return Response.json(
          { error: 'Square order creation returned no order', details: orderResponse.errors },
          { status: 502 },
        )
      }
      squareOrder = orderResponse.order
    } catch (err) {
      if (err instanceof SquareError) {
        return Response.json(
          { error: 'Failed to create Square order', details: err.message },
          { status: 502 },
        )
      }
      throw err
    }

    // ── Step 4: Charge via Square Payments API ──────────────────────────────
    let squarePaymentObj: NonNullable<
      Awaited<ReturnType<typeof client.payments.create>>['payment']
    >
    try {
      const paymentResponse = await client.payments.create({
        sourceId,
        idempotencyKey: crypto.randomUUID(),
        amountMoney: {
          amount: squareOrder.totalMoney?.amount ?? BigInt(0),
          currency: squareOrder.totalMoney?.currency ?? 'USD',
        },
        orderId: squareOrder.id,
        locationId: locationIdPrimary,
      })
      if (!paymentResponse.payment) {
        return Response.json(
          { error: 'Payment creation returned no payment', details: paymentResponse.errors },
          { status: 402 },
        )
      }
      squarePaymentObj = paymentResponse.payment
    } catch (err) {
      if (err instanceof SquareError) {
        return Response.json({ error: 'Payment failed', details: err.message }, { status: 402 })
      }
      throw err
    }

    // ── Step 5: Persist order to Payload DB ─────────────────────────────────
    const subtotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`

    const enrichedLineItems = cart.items.map((item) => {
      const variation = catalogObjects.find((o) => o.id === item.variationId)
      const productName =
        variation?.type === 'ITEM_VARIATION'
          ? (variation.itemVariationData?.name ?? 'Unknown')
          : 'Unknown'
      return {
        productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.unitPrice * item.quantity,
        squareCatalogObjectId: item.variationId,
      }
    })

    let payloadOrder: Order
    try {
      payloadOrder = (await req.payload.create({
        collection: 'orders',
        data: {
          orderNumber,
          status: 'paid',
          total: Number(squareOrder.totalMoney?.amount ?? 0),
          subtotal,
          tax: Number(squareOrder.totalTaxMoney?.amount ?? 0),
          currency: squareOrder.totalMoney?.currency ?? 'USD',
          squarePaymentId: squarePaymentObj.id,
          squareOrderId: squareOrder.id,
          user: cart.userId ?? undefined,
          guestEmail: cart.guestEmail ?? undefined,
          lineItems: enrichedLineItems,
        },
        overrideAccess: true,
      })) as unknown as Order
    } catch (dbErr) {
      // Payment succeeded but DB write failed — log Square IDs for manual reconciliation
      req.payload.logger.error({
        msg: 'Order DB write failed after successful Square payment — manual reconciliation required',
        squarePaymentId: squarePaymentObj.id,
        squareOrderId: squareOrder.id,
        err: dbErr,
      })
      return Response.json(
        {
          warning:
            'Payment processed but order record failed to save. Contact support with your payment reference.',
          squarePaymentId: squarePaymentObj.id,
        },
        { status: 200 },
      )
    }

    // ── Step 6: Write audit record (non-fatal if it fails) ──────────────────
    try {
      await req.payload.create({
        collection: 'payments',
        data: {
          squarePaymentId: squarePaymentObj.id!,
          squareOrderId: squareOrder.id,
          rawResponse: squarePaymentObj as unknown as Record<string, unknown>,
          status: squarePaymentObj.status,
          amount: Number(squarePaymentObj.amountMoney?.amount ?? 0),
          currency: squarePaymentObj.amountMoney?.currency ?? 'USD',
        },
        overrideAccess: true,
      })
    } catch (auditErr) {
      req.payload.logger.error({
        msg: 'Failed to write payments audit record',
        squarePaymentId: squarePaymentObj.id,
        err: auditErr,
      })
    }

    // ── Step 7: Guest order confirmation email (non-fatal) ─────────────────
    if (cart.guestEmail) {
      try {
        const lineItemsHtml = enrichedLineItems
          .map(
            (li) =>
              `<tr><td>${li.productName}</td><td style="text-align:center">${li.quantity}</td><td style="text-align:right">$${(li.totalPrice / 100).toFixed(2)}</td></tr>`,
          )
          .join('')
        await req.payload.sendEmail({
          to: cart.guestEmail,
          subject: `Order ${payloadOrder.orderNumber} confirmed`,
          html: `
            <h2>Thanks for your order!</h2>
            <p>Order <strong>${payloadOrder.orderNumber}</strong> has been placed.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Total</th></tr></thead>
              <tbody>${lineItemsHtml}</tbody>
              <tfoot>
                <tr><td colspan="2"><strong>Total</strong></td><td style="text-align:right"><strong>$${(Number(squareOrder.totalMoney?.amount ?? 0) / 100).toFixed(2)}</strong></td></tr>
              </tfoot>
            </table>
          `,
        })
      } catch (emailErr) {
        req.payload.logger.warn({ msg: 'Failed to send order confirmation email', err: emailErr })
      }
    }

    // ── Step 8: afterCheckout hook ──────────────────────────────────────────
    if (hooks?.afterCheckout) {
      const paymentShape: SquarePayment = {
        id: squarePaymentObj.id!,
        squarePaymentId: squarePaymentObj.id!,
        squareOrderId: squareOrder.id,
        rawResponse: squarePaymentObj,
        status: squarePaymentObj.status ?? '',
        amount: Number(squarePaymentObj.amountMoney?.amount ?? 0),
        currency: squarePaymentObj.amountMoney?.currency ?? 'USD',
      }
      await hooks.afterCheckout({ req, order: payloadOrder, payment: paymentShape })
    }


    return Response.json({ order: payloadOrder }, { status: 200 })
  }
}
