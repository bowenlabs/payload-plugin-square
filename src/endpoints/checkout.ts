import type { PayloadHandler } from 'payload'
import { SquareError } from 'square'

import { primaryLocation, allLocations } from '../lib/locationUtils.js'
import { createSquareClient } from '../lib/squareClient.js'
import type {
  SquareCustomerSearchResponse,
  SquareCustomerCreateResponse,
  SquareLoyaltyAPI,
  SquareOrdersAPI,
} from '../lib/squareTypes.js'
import type { Cart, Customer, Order, PayloadPluginSquareConfig, SquarePayment } from '../types.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function createCheckoutHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    const { accessToken, locationId, environment = 'sandbox', hooks, loyalty } = options
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

    // ── Shipping validation ──────────────────────────────────────────────────
    const { shippingAddress, shippingRateId } = cart
    let resolvedShippingAmount = 0
    let resolvedShippingRate: import('../types.js').ShippingRate | undefined

    if (shippingAddress) {
      const requiredFields: (keyof typeof shippingAddress)[] = [
        'firstName', 'lastName', 'address1', 'city', 'state', 'zip',
      ]
      for (const field of requiredFields) {
        if (!shippingAddress[field]) {
          return Response.json(
            { error: `shippingAddress.${field} is required` },
            { status: 400 },
          )
        }
      }

      if (options.shipping) {
        const subtotal = cart.items.reduce((s, i) => s + i.unitPrice * i.quantity, 0)
        const qualifiesForFree =
          options.shipping.freeShippingThreshold !== undefined &&
          subtotal >= options.shipping.freeShippingThreshold

        if (!qualifiesForFree) {
          if (!shippingRateId) {
            return Response.json(
              { error: 'shippingRateId is required when a shipping address is provided' },
              { status: 400 },
            )
          }
          resolvedShippingRate = options.shipping.rates.find((r) => r.id === shippingRateId)
          if (!resolvedShippingRate) {
            return Response.json(
              { error: `Unknown shippingRateId: ${shippingRateId}` },
              { status: 400 },
            )
          }
          resolvedShippingAmount = resolvedShippingRate.amount
        }
      }
    }

    const variationIds = cart.items.map((i) => i.variationId).filter(Boolean) as string[]
    if (variationIds.length !== cart.items.length) {
      return Response.json(
        { error: 'All cart items must have a variationId for server-side price verification' },
        { status: 400 },
      )
    }

    // ── Email validation ─────────────────────────────────────────────────────
    const customerEmail = cart.guestEmail ?? undefined
    if (customerEmail && !EMAIL_RE.test(customerEmail)) {
      return Response.json({ error: 'guestEmail is not a valid email address' }, { status: 400 })
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
        req.payload.logger.error({ err }, 'Failed to fetch catalog for price verification')
        return Response.json({ error: 'Failed to fetch catalog' }, { status: 502 })
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
        if (count.catalogObjectId && count.quantity !== undefined) {
          inventoryMap.set(count.catalogObjectId, parseFloat(count.quantity))
        }
      }

      for (const item of cart.items) {
        const available = inventoryMap.get(item.variationId!)
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
        req.payload.logger.error({ err }, 'Failed to verify inventory')
        return Response.json({ error: 'Failed to verify inventory' }, { status: 502 })
      }
      throw err
    }

    // ── Step 3: Find or create customer + loyalty account ───────────────────
    const customerUserId = cart.userId ?? undefined
    let customerId: string | undefined
    let customerDoc: Customer | undefined
    let loyaltyAccountId: string | undefined

    if (customerUserId || customerEmail) {
      const existing = await req.payload.find({
        collection: 'customers',
        where: customerUserId
          ? { user: { equals: customerUserId } }
          : { email: { equals: customerEmail } },
        limit: 1,
        overrideAccess: true,
      })

      if (existing.docs.length > 0) {
        customerId = existing.docs[0]!.id as string
        customerDoc = existing.docs[0] as unknown as Customer
        loyaltyAccountId = customerDoc.loyaltyAccountId
      } else {
        // Try to find or create the Square customer record (non-fatal)
        let squareCustomerId: string | undefined
        try {
          const searchResp = (await client.customers.search({
            query: { filter: { emailAddress: { exact: customerEmail } } },
          })) as unknown as SquareCustomerSearchResponse
          squareCustomerId = searchResp.customers?.[0]?.id

          if (!squareCustomerId && customerEmail) {
            const createResp = (await client.customers.create({
              emailAddress: customerEmail,
              idempotencyKey: crypto.randomUUID(),
            })) as unknown as SquareCustomerCreateResponse
            squareCustomerId = createResp.customer?.id
          }
        } catch (err) {
          req.payload.logger.warn({ err }, 'Failed to find/create Square customer')
        }

        const newCustomer = await req.payload.create({
          collection: 'customers',
          data: {
            squareCustomerId: squareCustomerId ?? undefined,
            user: customerUserId ?? undefined,
            email: customerEmail ?? undefined,
            loyaltyPoints: 0,
          },
          overrideAccess: true,
        })
        customerId = newCustomer.id as string
        customerDoc = newCustomer as unknown as Customer
      }

      // Find or create Square loyalty account (non-fatal, only when customer has opted in)
      if (loyalty && cart.loyaltyOptIn && customerEmail && !loyaltyAccountId) {
        try {
          const programId = loyalty.programId ?? 'main'
          const loyaltyApi = client.loyalty as unknown as SquareLoyaltyAPI
          const searchResp = await loyaltyApi.searchAccounts({
            query: { mappings: [{ type: 'EMAIL', value: customerEmail }] },
            limit: 1,
          })
          loyaltyAccountId = searchResp.loyaltyAccounts?.[0]?.id

          if (!loyaltyAccountId) {
            const createResp = await loyaltyApi.createAccount({
              idempotencyKey: crypto.randomUUID(),
              loyaltyAccount: {
                programId,
                mapping: { type: 'EMAIL', value: customerEmail },
              },
            })
            loyaltyAccountId = createResp.loyaltyAccount?.id
          }

          if (loyaltyAccountId && customerId) {
            await req.payload.update({
              collection: 'customers',
              id: customerId,
              data: { loyaltyAccountId },
              overrideAccess: true,
            })
          }
        } catch (err) {
          req.payload.logger.warn({ err }, 'Failed to find/create Square loyalty account')
        }
      }
    }

    // ── Step 4: Create Square Order ─────────────────────────────────────────
    let squareOrder: NonNullable<Awaited<ReturnType<typeof client.orders.create>>['order']>
    try {
      const fulfillments: import('square').Fulfillment[] = shippingAddress
        ? [
            {
              type: 'SHIPMENT',
              state: 'PROPOSED',
              shipmentDetails: {
                recipient: {
                  displayName: `${shippingAddress.firstName} ${shippingAddress.lastName}`,
                  emailAddress: customerEmail,
                  phoneNumber: shippingAddress.phone,
                  address: {
                    addressLine1: shippingAddress.address1,
                    addressLine2: shippingAddress.address2,
                    locality: shippingAddress.city,
                    administrativeDistrictLevel1: shippingAddress.state,
                    postalCode: shippingAddress.zip,
                    country: (shippingAddress.country ?? 'US') as import('square').Country,
                  },
                },
              },
            },
          ]
        : []

      const serviceCharges: import('square').OrderServiceCharge[] =
        resolvedShippingAmount > 0
          ? [
              {
                name: resolvedShippingRate?.name ?? 'Shipping',
                amountMoney: {
                  amount: BigInt(resolvedShippingAmount),
                  currency: 'USD',
                },
                calculationPhase: 'TOTAL_PHASE',
              },
            ]
          : []

      const orderResponse = await client.orders.create({
        idempotencyKey: crypto.randomUUID(),
        order: {
          locationId: locationIdPrimary,
          lineItems: cart.items.map((item) => ({
            catalogObjectId: item.variationId,
            quantity: String(item.quantity),
          })),
          ...(fulfillments.length > 0 ? { fulfillments } : {}),
          ...(serviceCharges.length > 0 ? { serviceCharges } : {}),
        },
      })
      if (!orderResponse.order) {
        req.payload.logger.error({ errors: orderResponse.errors }, 'Square order creation returned no order')
        return Response.json({ error: 'Failed to create order' }, { status: 502 })
      }
      squareOrder = orderResponse.order
    } catch (err) {
      if (err instanceof SquareError) {
        req.payload.logger.error({ err }, 'Failed to create Square order')
        return Response.json({ error: 'Failed to create order' }, { status: 502 })
      }
      throw err
    }

    // ── Step 5: Apply loyalty reward (if requested) ─────────────────────────
    if (cart.loyaltyRewardDefinitionId && loyaltyAccountId) {
      try {
        const loyaltyApi = client.loyalty as unknown as SquareLoyaltyAPI
        await loyaltyApi.createLoyaltyReward({
          idempotencyKey: crypto.randomUUID(),
          reward: {
            loyaltyAccountId,
            rewardDefinitionId: cart.loyaltyRewardDefinitionId,
            orderId: squareOrder.id,
          },
        })

        // Retrieve the order with the discount applied to get the updated total
        const updatedOrderResp = await (client.orders as unknown as SquareOrdersAPI).retrieve(squareOrder.id!)
        if (updatedOrderResp.order) {
          squareOrder = updatedOrderResp.order as typeof squareOrder
        }
      } catch (err) {
        req.payload.logger.error({ err }, 'Failed to apply loyalty reward')
        return Response.json(
          { error: 'Failed to apply loyalty reward — please try again without redeeming points' },
          { status: 400 },
        )
      }
    }

    // ── Step 6: Charge via Square Payments API ──────────────────────────────
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
        req.payload.logger.error({ errors: paymentResponse.errors }, 'Payment creation returned no payment')
        return Response.json({ error: 'Payment processing failed' }, { status: 402 })
      }
      squarePaymentObj = paymentResponse.payment
    } catch (err) {
      if (err instanceof SquareError) {
        req.payload.logger.error({ err }, 'Payment failed')
        return Response.json({ error: 'Payment processing failed' }, { status: 402 })
      }
      throw err
    }

    // ── Step 7: Persist order to Payload DB ─────────────────────────────────
    const subtotal = cart.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
    const orderNumber = `ORD-${crypto.randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase()}`

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

    const squareFulfillmentUid = squareOrder.fulfillments?.[0]?.uid

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
          user: customerUserId ?? undefined,
          guestEmail: customerEmail ?? undefined,
          squareCustomer: customerId ?? undefined,
          lineItems: enrichedLineItems,
          ...(shippingAddress
            ? {
                shippingAddress: {
                  firstName: shippingAddress.firstName,
                  lastName: shippingAddress.lastName,
                  address1: shippingAddress.address1,
                  address2: shippingAddress.address2 ?? undefined,
                  city: shippingAddress.city,
                  state: shippingAddress.state,
                  zip: shippingAddress.zip,
                  country: shippingAddress.country ?? 'US',
                  phone: shippingAddress.phone ?? undefined,
                },
                shippingAmount: resolvedShippingAmount,
                fulfillmentStatus: 'pending',
                squareFulfillmentUid: squareFulfillmentUid ?? undefined,
              }
            : {}),
        },
        overrideAccess: true,
      })) as unknown as Order
    } catch (dbErr) {
      req.payload.logger.error({
        squarePaymentId: squarePaymentObj.id,
        squareOrderId: squareOrder.id,
        err: dbErr,
        msg: 'Order DB write failed after successful Square payment — manual reconciliation required',
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

    // ── Step 8: Accrue loyalty points via Square (non-fatal) ─────────────────
    if (loyalty && cart.loyaltyOptIn && loyaltyAccountId) {
      try {
        const loyaltyApi = client.loyalty as unknown as SquareLoyaltyAPI
        await loyaltyApi.accumulatePoints(loyaltyAccountId, {
          accumulatePoints: { orderId: squareOrder.id! },
          idempotencyKey: crypto.randomUUID(),
          locationId: locationIdPrimary,
        })
        const accountResp = await loyaltyApi.retrieveLoyaltyAccount(loyaltyAccountId)
        const updatedBalance = accountResp.loyaltyAccount?.balance
        if (customerId && updatedBalance !== undefined) {
          await req.payload.update({
            collection: 'customers',
            id: customerId,
            data: { loyaltyPoints: updatedBalance },
            overrideAccess: true,
          })
        }
      } catch (err) {
        req.payload.logger.warn({ err }, 'Failed to accrue loyalty points via Square')
        // loyalty.account.updated webhook will sync the balance if this fails
      }
    }

    // ── Step 9: Write audit record (non-fatal) ───────────────────────────────
    try {
      // Square SDK uses BigInt for monetary amounts; JSON.stringify throws on BigInt values,
      // so we serialise/deserialise through a replacer that converts BigInt → Number first.
      const safeRawResponse = JSON.parse(
        JSON.stringify(squarePaymentObj, (_k, v) => (typeof v === 'bigint' ? Number(v) : v)),
      ) as Record<string, unknown>

      await req.payload.create({
        collection: 'payments',
        data: {
          squarePaymentId: squarePaymentObj.id!,
          squareOrderId: squareOrder.id,
          rawResponse: safeRawResponse,
          status: squarePaymentObj.status,
          amount: Number(squarePaymentObj.amountMoney?.amount ?? 0),
          currency: squarePaymentObj.amountMoney?.currency ?? 'USD',
        },
        overrideAccess: true,
      })
    } catch (auditErr) {
      req.payload.logger.error({
        squarePaymentId: squarePaymentObj.id,
        err: auditErr,
      }, 'Failed to write payments audit record')
    }

    // ── Step 10: Order confirmation email (non-fatal) ────────────────────────
    if (customerEmail) {
      try {
        const lineItemsHtml = enrichedLineItems
          .map(
            (li) =>
              `<tr><td>${escHtml(li.productName)}</td><td style="text-align:center">${li.quantity}</td><td style="text-align:right">$${(li.totalPrice / 100).toFixed(2)}</td></tr>`,
          )
          .join('')

        const shippingRowHtml =
          resolvedShippingAmount > 0
            ? `<tr><td colspan="2" style="color:#6b7280">Shipping (${escHtml(resolvedShippingRate?.name ?? '')})</td><td style="text-align:right;color:#6b7280">$${(resolvedShippingAmount / 100).toFixed(2)}</td></tr>`
            : ''

        const shippingAddressHtml = shippingAddress
          ? `<p style="margin:16px 0 0">
               <strong>Ship to:</strong><br>
               ${escHtml(shippingAddress.firstName)} ${escHtml(shippingAddress.lastName)}<br>
               ${escHtml(shippingAddress.address1)}${shippingAddress.address2 ? `, ${escHtml(shippingAddress.address2)}` : ''}<br>
               ${escHtml(shippingAddress.city)}, ${escHtml(shippingAddress.state)} ${escHtml(shippingAddress.zip)}
             </p>`
          : ''

        await req.payload.sendEmail({
          to: customerEmail,
          subject: `Order ${payloadOrder.orderNumber} confirmed`,
          html: `
            <h2>Thanks for your order!</h2>
            <p>Order <strong>${escHtml(payloadOrder.orderNumber)}</strong> has been placed.</p>
            <table style="width:100%;border-collapse:collapse;margin:16px 0">
              <thead><tr><th style="text-align:left">Item</th><th>Qty</th><th style="text-align:right">Total</th></tr></thead>
              <tbody>${lineItemsHtml}</tbody>
              <tfoot>
                ${shippingRowHtml}
                <tr><td colspan="2"><strong>Total</strong></td><td style="text-align:right"><strong>$${(Number(squareOrder.totalMoney?.amount ?? 0) / 100).toFixed(2)}</strong></td></tr>
              </tfoot>
            </table>
            ${shippingAddressHtml}
          `,
        })
      } catch (emailErr) {
        req.payload.logger.warn({ err: emailErr }, 'Failed to send order confirmation email')
      }
    }

    // ── Step 11: afterCheckout hook ──────────────────────────────────────────
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
