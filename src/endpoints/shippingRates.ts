import type { PayloadHandler } from 'payload'

import type { PayloadPluginSquareConfig, ShippingRate } from '../types.js'

export function createShippingRatesHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    const { shipping } = options
    if (!shipping) {
      return Response.json({ error: 'Shipping is not configured' }, { status: 404 })
    }

    const url = new URL(req.url ?? '', 'http://localhost')
    const cartTotal = parseInt(url.searchParams.get('cartTotal') ?? '0', 10)

    const qualifiesForFree =
      shipping.freeShippingThreshold !== undefined && cartTotal >= shipping.freeShippingThreshold

    const rates: ShippingRate[] = shipping.rates.map((rate) => ({
      ...rate,
      amount: qualifiesForFree ? 0 : rate.amount,
    }))

    return Response.json({
      rates,
      freeShippingThreshold: shipping.freeShippingThreshold,
      qualifiesForFree,
    })
  }
}
