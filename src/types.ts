import type { PayloadRequest } from 'payload'

export type PayloadPluginSquareConfig = {
  /** Square API access token */
  accessToken: string
  /** Required for checkout and inventory counts. Pass an array for multi-location support — the first entry is used as the primary location for payments. */
  locationId: string | string[]
  /** Defaults to 'sandbox' */
  environment?: 'sandbox' | 'production'
  /** Required to enable the webhook endpoint */
  webhookSecret?: string
  /** Payload collection slug for storing synced images. Defaults to 'media' */
  mediaCollectionSlug?: string
  /** Run a full catalog sync when Payload initializes */
  syncOnInit?: boolean
  /** Cron expression for scheduled catalog sync, e.g. '0 * * * *' for hourly */
  syncSchedule?: string
  /**
   * Keep collections in the schema while disabling all Square API activity.
   * Useful for environments where Square credentials are unavailable (e.g. CI).
   */
  disabled?: boolean
  /** Selectively disable individual endpoints. All default to enabled. */
  endpoints?: {
    checkout?: boolean
    webhook?: boolean
    sync?: boolean
  }
  /**
   * Enable Square Loyalty integration. Omit to disable.
   * Square's loyalty program rules (points per dollar, reward tiers) are configured
   * in the Square Dashboard — the plugin calls Square's Loyalty API to accrue and
   * redeem points, keeping the local balance in sync via the loyalty.account.updated webhook.
   */
  loyalty?: {
    /** Square loyalty program ID. Defaults to 'main' (the merchant's primary program). */
    programId?: string
  }
  hooks?: {
    beforeCheckout?: (ctx: BeforeCheckoutContext) => Promise<void>
    afterCheckout?: (ctx: AfterCheckoutContext) => Promise<void>
    onWebhookReceived?: (ctx: WebhookContext) => Promise<void>
    onSyncComplete?: (ctx: SyncContext) => Promise<void>
  }
}

export interface Cart {
  items: CartItem[]
  userId?: string
  guestEmail?: string
  /**
   * Set to true when the customer opts in to the loyalty program at checkout.
   * When false/omitted, no loyalty account is created or looked up and no points are accrued.
   */
  loyaltyOptIn?: boolean
  /**
   * Square reward definition ID to redeem at checkout. Get available reward
   * definition IDs from GET /api/square/loyalty/balance (availableRewards[].id).
   * Only honoured when loyaltyOptIn is true.
   */
  loyaltyRewardDefinitionId?: string
}

export interface CartItem {
  productId: string
  variationId?: string
  quantity: number
  /** In cents — server verifies against Square catalog before charging */
  unitPrice: number
}

export interface Order {
  id: string
  orderNumber: string
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'partially_refunded'
  total: number
  subtotal: number
  tax?: number
  currency: string
  squarePaymentId?: string
  squareOrderId?: string
  user?: string
  guestEmail?: string
  lineItems: OrderLineItem[]
}

export interface OrderLineItem {
  productName: string
  variationName?: string
  quantity: number
  unitPrice: number
  totalPrice: number
  squareCatalogObjectId?: string
}

export interface SquarePayment {
  id: string
  squarePaymentId: string
  squareOrderId?: string
  rawResponse: unknown
  status: string
  amount: number
  currency: string
}

export interface Customer {
  id: string
  squareCustomerId?: string
  loyaltyAccountId?: string
  user?: string
  email?: string
  displayName?: string
  /** Cached balance synced from Square via loyalty.account.updated webhook */
  loyaltyPoints: number
}

export interface BeforeCheckoutContext {
  req: PayloadRequest
  cart: Cart
}

export interface AfterCheckoutContext {
  req: PayloadRequest
  order: Order
  payment: SquarePayment
}

export interface WebhookContext {
  req: PayloadRequest
  eventType: string
  payload: unknown
}

export interface SyncContext {
  productsUpdated: number
  productsCreated: number
  errors: string[]
}
