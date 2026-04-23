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
    /** Server-sent events stream for real-time inventory updates */
    inventoryStream?: boolean
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
  /**
   * Enable shipping support. Omit to disable.
   * Adds a SHIPMENT fulfillment to Square Orders and exposes GET /api/square/shipping/rates.
   * When configured, cart submissions may include shippingAddress and shippingRateId.
   */
  shipping?: {
    /** Available shipping options presented to the customer. */
    rates: ShippingRate[]
    /**
     * Cart subtotal in cents at or above which shipping is free.
     * When a cart qualifies, rates are returned with amount overridden to 0.
     */
    freeShippingThreshold?: number
  }
  /**
   * Predicate that returns true when the given Payload user should be treated as an admin.
   * Admins can read all records in the plugin's collections; non-admins can only read their own.
   * Defaults to checking `user.roles.includes('admin')`.
   *
   * @example
   * // Custom boolean field instead of a roles array:
   * isAdmin: (user) => (user as any).isAdmin === true
   */
  isAdmin?: (user: unknown) => boolean
  /**
   * Enable Square Subscriptions. Omit to disable.
   * Exposes endpoints for listing plans, subscribing, and managing subscriptions.
   * Requires Square Subscriptions to be configured in the Square Dashboard.
   */
  subscriptions?: Record<string, never>
  hooks?: {
    beforeCheckout?: (ctx: BeforeCheckoutContext) => Promise<void>
    afterCheckout?: (ctx: AfterCheckoutContext) => Promise<void>
    onWebhookReceived?: (ctx: WebhookContext) => Promise<void>
    onSyncComplete?: (ctx: SyncContext) => Promise<void>
  }
}

export interface ShippingAddress {
  firstName: string
  lastName: string
  address1: string
  address2?: string
  city: string
  state: string
  zip: string
  /** ISO 3166-1 alpha-2 country code, e.g. 'US'. Defaults to 'US'. */
  country?: string
  phone?: string
}

export interface ShippingRate {
  id: string
  name: string
  /** Shipping cost in cents */
  amount: number
  /** Estimated delivery window shown to the customer */
  estimatedDays?: number
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
  /** Shipping destination. Required when the merchant has shipping configured. */
  shippingAddress?: ShippingAddress
  /**
   * ID of a shipping rate from GET /api/square/shipping/rates.
   * Required when shippingAddress is provided and the order doesn't qualify for free shipping.
   */
  shippingRateId?: string
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
  shippingAddress?: ShippingAddress
  shippingAmount?: number
  shippingCarrier?: string
  trackingNumber?: string
  trackingUrl?: string
  fulfillmentStatus?: 'pending' | 'shipped' | 'delivered' | 'failed'
  squareFulfillmentUid?: string
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
