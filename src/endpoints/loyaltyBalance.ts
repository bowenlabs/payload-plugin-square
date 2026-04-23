import type { PayloadHandler } from 'payload'

import { createSquareClient } from '../lib/squareClient.js'
import type { PayloadPluginSquareConfig } from '../types.js'

export function createLoyaltyBalanceHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Authentication required' }, { status: 401 })
    }

    const client = createSquareClient(options.accessToken, options.environment)
    const programId = options.loyalty?.programId ?? 'main'

    // Find the customer record
    const customerResult = await req.payload.find({
      collection: 'customers',
      where: { user: { equals: req.user.id } },
      limit: 1,
      overrideAccess: true,
    })
    const customer = customerResult.docs[0]
    const loyaltyAccountId = customer?.loyaltyAccountId as string | undefined

    // Get live balance from Square (fall back to cached value if Square is unavailable)
    let balance = (customer?.loyaltyPoints as number) ?? 0
    if (loyaltyAccountId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const accountResp = await (client.loyalty as any).retrieveLoyaltyAccount(loyaltyAccountId)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        balance = (accountResp as any).loyaltyAccount?.balance ?? balance
      } catch {
        // use cached balance
      }
    }

    // Fetch the loyalty program to return available reward tiers
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let program: Record<string, unknown> | null = null
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let availableRewards: Record<string, unknown>[] = []
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const programResp = await (client.loyalty as any).retrieveProgram(programId)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loyaltyProgram = (programResp as any).program
      if (loyaltyProgram) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rewardTiers = ((loyaltyProgram.rewardTiers ?? []) as any[]).map((tier) => ({
          id: tier.id as string,
          name: tier.name as string,
          pointsCost: tier.points as number,
          discount: tier.definition,
        }))
        program = {
          id: loyaltyProgram.id as string,
          name: loyaltyProgram.name as string,
          rewardTiers,
        }
        availableRewards = rewardTiers.filter((t) => (t.pointsCost as number) <= balance)
      }
    } catch {
      // loyalty program not configured in Square — return balance only
    }

    return Response.json({
      balance,
      customerId: customer?.id ?? null,
      program,
      availableRewards,
    })
  }
}
