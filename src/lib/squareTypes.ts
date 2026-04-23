/**
 * Typed interfaces for Square SDK methods whose TypeScript definitions are incomplete
 * in the current SDK version. Use `client.loyalty as unknown as SquareLoyaltyAPI`, etc.
 */

export interface SquareLoyaltyAPI {
  searchAccounts(params: {
    query: { mappings: Array<{ type: string; value: string }> }
    limit: number
  }): Promise<{ loyaltyAccounts?: Array<{ id: string }> }>

  createAccount(params: {
    idempotencyKey: string
    loyaltyAccount: { programId: string; mapping: { type: string; value: string } }
  }): Promise<{ loyaltyAccount?: { id: string } }>

  createLoyaltyReward(params: {
    idempotencyKey: string
    reward: { loyaltyAccountId: string; rewardDefinitionId: string; orderId?: string }
  }): Promise<void>

  accumulatePoints(
    accountId: string,
    params: {
      accumulatePoints: { orderId: string }
      idempotencyKey: string
      locationId: string
    },
  ): Promise<void>

  retrieveLoyaltyAccount(accountId: string): Promise<{
    loyaltyAccount?: { balance?: number }
  }>
}

export interface SquareOrderRetrieveResponse {
  order?: {
    fulfillments?: Array<{
      uid?: string
      shipmentDetails?: {
        trackingNumber?: string
        trackingUrl?: string
        carrier?: string
      }
    }>
  }
}

export interface SquareOrdersAPI {
  retrieve(orderId: string): Promise<SquareOrderRetrieveResponse>
}

export interface SquareCreateSubscriptionResponse {
  subscription?: { id: string; status: string; chargedThroughDate?: string }
  errors?: unknown[]
}

export interface SquareSubscriptionsAPI {
  createSubscription(params: {
    idempotencyKey: string
    locationId: string
    planVariationId: string
    customerId: string
    cardId: string
    startDate: string
  }): Promise<SquareCreateSubscriptionResponse>

  cancelSubscription(id: string): Promise<void>

  pauseSubscription(id: string, params: { pause: { effectiveDate: string } }): Promise<void>

  resumeSubscription(id: string, params: { resumeEffectiveDate: string }): Promise<void>
}

export interface SquareCustomerSearchResponse {
  customers?: Array<{ id: string }>
}

export interface SquareCustomerCreateResponse {
  customer?: { id: string }
}

export interface SquareCardCreateResponse {
  card?: { id: string }
}

export interface SquareSubscriptionPlanVariationData {
  name?: string
  phases?: Array<{
    cadence?: string
    recurringPriceMoney?: { amount?: bigint | number; currency?: string }
  }>
}
