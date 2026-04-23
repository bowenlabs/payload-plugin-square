import type { PayloadHandler } from 'payload'

import { createSquareClient } from '../lib/squareClient.js'
import type { PayloadPluginSquareConfig } from '../types.js'

export function createSubscriptionPlansHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async () => {
    const client = createSquareClient(options.accessToken, options.environment ?? 'sandbox')

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const resp = await (client.catalog as any).list({ types: 'SUBSCRIPTION_PLAN' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const objects: any[] = resp.objects ?? []

      const plans = objects
        .filter((o: { type?: string }) => o.type === 'SUBSCRIPTION_PLAN')
        .map((plan: {
          id?: string
          subscriptionPlanData?: {
            name?: string
            phases?: Array<{
              uid?: string
              cadence?: string
              periods?: number
              recurringPriceMoney?: { amount?: bigint; currency?: string }
              ordinal?: number
            }>
            subscriptionPlanVariations?: Array<{
              id?: string
              subscriptionPlanVariationData?: {
                name?: string
                phases?: Array<{
                  uid?: string
                  cadence?: string
                  periods?: number
                  recurringPriceMoney?: { amount?: bigint; currency?: string }
                  ordinal?: number
                }>
              }
            }>
          }
        }) => {
          const data = plan.subscriptionPlanData
          const variations = (data?.subscriptionPlanVariations ?? []).map((v) => {
            const vd = v.subscriptionPlanVariationData
            const phases = (vd?.phases ?? data?.phases ?? []).map((p) => ({
              uid: p.uid,
              cadence: p.cadence,
              periods: p.periods,
              recurringPriceMoney: {
                amount: Number(p.recurringPriceMoney?.amount ?? 0),
                currency: p.recurringPriceMoney?.currency ?? 'USD',
              },
              ordinal: p.ordinal,
            }))
            return {
              id: v.id,
              name: vd?.name ?? data?.name,
              phases,
            }
          })

          return {
            id: plan.id,
            name: data?.name,
            variations: variations.length > 0 ? variations : [{
              id: plan.id,
              name: data?.name,
              phases: (data?.phases ?? []).map((p) => ({
                uid: p.uid,
                cadence: p.cadence,
                periods: p.periods,
                recurringPriceMoney: {
                  amount: Number(p.recurringPriceMoney?.amount ?? 0),
                  currency: p.recurringPriceMoney?.currency ?? 'USD',
                },
                ordinal: p.ordinal,
              })),
            }],
          }
        })

      return Response.json({ plans })
    } catch (err) {
      return Response.json({ error: 'Failed to fetch subscription plans', details: String(err) }, { status: 502 })
    }
  }
}
