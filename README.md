# payload-plugin-square

A [Payload CMS](https://payloadcms.com) plugin that integrates [Square](https://squareup.com/developers) for catalog sync, inventory tracking, payments, customers, and loyalty.

## Features

- **Catalog sync** — pulls Square catalog items (with images) into a Payload collection; delta sync only fetches items changed since the last run
- **Real-time inventory** — Square webhooks update stock counts instantly via Server-Sent Events; all open browser tabs reflect changes without a refresh
- **Checkout** — server-side price verification, live inventory gating, Square Order + Payment creation, and Payload order/audit records in one endpoint
- **Shipping** — configurable rates with free-shipping threshold, SHIPMENT fulfillment on Square Orders, tracking number sync via `order.fulfillment.updated` webhook
- **Customer records** — creates or finds a `customers` record at checkout for both logged-in users and guests; links orders and loyalty data to the customer
- **Square Loyalty** — opt-in loyalty account creation, point accrual, reward redemption, and live balance sync via webhooks; includes a `GET /api/square/loyalty/balance` endpoint
- **Guest order emails** — sends an HTML order confirmation email after checkout (requires Payload email adapter)
- **Square Subscriptions** — save card on file, create subscriptions from Square catalog plans, and manage them (cancel/pause/resume) via API endpoints; status synced via `subscription.updated` webhook
- **Webhook handling** — verifies HMAC-SHA256 signatures, deduplicates replayed events, handles `payment.updated`, `order.updated`, `inventory.count.updated`, `catalog.version.updated`, `refund.updated`, `loyalty.account.updated`, `order.fulfillment.updated`, `subscription.updated`, and `subscription.created`
- **Scheduled sync** — optional cron-based catalog sync via Payload's Jobs Queue (e.g. `syncSchedule: '0 * * * *'` for hourly)
- **Multi-location** — pass an array to `locationId`; the first entry is the primary location used for payments
- **Plugin hooks** — `beforeCheckout`, `afterCheckout`, `onWebhookReceived`, `onSyncComplete` for custom business logic

## Installation

```bash
pnpm add payload-plugin-square
```

## Setup

```ts
// payload.config.ts
import { payloadPluginSquare } from 'payload-plugin-square'

export default buildConfig({
  plugins: [
    payloadPluginSquare({
      accessToken: process.env.SQUARE_ACCESS_TOKEN!,
      locationId: process.env.SQUARE_LOCATION_ID!,
      environment: 'sandbox', // or 'production'
      webhookSecret: process.env.SQUARE_WEBHOOK_SECRET,
      mediaCollectionSlug: 'square-media', // store catalog images separately (recommended)
      syncOnInit: true,               // sync catalog on server start
      syncSchedule: '0 * * * *',      // optional: also sync hourly via Jobs Queue

      // Tell the plugin who is an admin. Defaults to checking user.roles.includes('admin').
      // Override this if your user model uses a different shape (e.g. a boolean field).
      isAdmin: (user) => (user as any).roles?.includes('admin') ?? false,

      loyalty: {                       // optional: enable Square Loyalty
        programId: 'main',             // Square loyalty program ID (default: 'main')
      },
      subscriptions: {},               // optional: enable Square Subscriptions
      shipping: {                      // optional: enable shipping
        rates: [
          { id: 'standard', name: 'Standard Shipping', amount: 599, estimatedDays: 5 },
          { id: 'express',  name: 'Express Shipping',  amount: 1499, estimatedDays: 2 },
        ],
        freeShippingThreshold: 5000,   // free shipping on orders ≥ $50
      },
    }),
  ],
})
```

## Environment Variables

| Variable | Description |
|---|---|
| `SQUARE_ACCESS_TOKEN` | Square API access token |
| `SQUARE_LOCATION_ID` | Square location ID (comma-separated for multiple) |
| `SQUARE_ENVIRONMENT` | `sandbox` or `production` |
| `SQUARE_WEBHOOK_SECRET` | Signature key from Square webhook subscription |
| `NEXT_PUBLIC_SQUARE_APPLICATION_ID` | Square app ID (browser, for Web Payments SDK) |
| `NEXT_PUBLIC_SQUARE_LOCATION_ID` | Square location ID (browser, for Web Payments SDK) |

## Collections Added

All collections are grouped under **Square** in the Payload admin sidebar.

| Slug | Admin Label | Description |
|---|---|---|
| `catalog` | Catalog | Public read. Synced catalog items with variations and inventory counts. |
| `orders` | Orders | Admins see all; users see only their own orders. |
| `customers` | Customers | Admins see all; users see only their own customer record. |
| `payments` | Payments | Admin only. Raw Square payment responses for reconciliation. |
| `square-webhook-events` | Webhook Events | Admin only. Processed webhook event IDs for replay protection. |
| `square-subscriptions` | Subscriptions | Admins see all; users see only their own subscriptions. |

Row-level access control is enforced automatically based on the `isAdmin` predicate you pass to the plugin (see [Plugin Options](#plugin-options)). The default checks `user.roles.includes('admin')` — add a `roles` field to your users collection to use it out of the box.

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/square/checkout` | Optional | Process a cart through Square |
| `POST` | `/api/square/webhook` | — | Receive Square webhook events |
| `GET` | `/api/square/inventory-stream` | — | SSE stream for real-time inventory/catalog updates |
| `POST` | `/api/square/sync` | Required | Manually trigger a catalog sync |
| `GET` | `/api/square/loyalty/balance` | Required | Current loyalty balance, program tiers, and redeemable rewards |
| `GET` | `/api/square/shipping/rates` | — | Available shipping rates; pass `?cartTotal=N` (cents) to apply free-shipping threshold |
| `GET` | `/api/square/subscriptions/plans` | — | Square Subscription Plan catalog items |
| `POST` | `/api/square/subscriptions/subscribe` | Optional | Save card on file and create a subscription |
| `GET` | `/api/square/subscriptions` | Required | List the authenticated user's subscriptions |
| `POST` | `/api/square/subscriptions/cancel` | Required | Cancel a subscription |
| `POST` | `/api/square/subscriptions/pause` | Required | Pause a subscription |
| `POST` | `/api/square/subscriptions/resume` | Required | Resume a paused subscription |

### Checkout request body

```ts
{
  sourceId: string                      // Square payment token from Web Payments SDK
  cart: {
    items: {
      variationId: string               // Square catalog variation ID
      quantity: number
      unitPrice: number                 // cents — verified server-side against Square
    }[]
    userId?: string                     // optional Payload user ID (links order to account)
    guestEmail?: string                 // triggers order confirmation email
    loyaltyOptIn?: boolean              // set true to create/find loyalty account and accrue points
    loyaltyRewardDefinitionId?: string  // Square reward definition ID to redeem at checkout
    shippingAddress?: {                 // required for physical orders
      firstName: string
      lastName: string
      address1: string
      address2?: string
      city: string
      state: string
      zip: string
      country?: string                  // ISO 3166-1 alpha-2, default 'US'
      phone?: string
    }
    shippingRateId?: string             // ID from GET /api/square/shipping/rates
  }
}
```

### Shipping rates response

```ts
{
  rates: { id, name, amount, estimatedDays? }[]   // amount in cents (0 when free)
  freeShippingThreshold: number | undefined       // configured threshold in cents
  qualifiesForFree: boolean                       // true when cartTotal >= threshold
}
```

### Loyalty balance response

```ts
{
  balance: number                       // current point balance
  customerId: string | null             // Payload customer record ID
  program: {                            // null if not configured in Square
    id: string
    name: string
    rewardTiers: { id, name, pointsCost, discount }[]
  } | null
  availableRewards: RewardTier[]        // tiers the customer can currently redeem
}
```

## Square Dashboard Setup

### Webhooks

1. In the Square Developer Dashboard, open **Webhooks** and create a subscription
2. Set the URL to `https://your-domain.com/api/square/webhook`
3. Subscribe to these events:

| Event | Purpose |
|---|---|
| `payment.updated` | Sync order status on payment completion/failure |
| `order.updated` | Sync order status on Square order state changes |
| `order.fulfillment.updated` | Sync tracking number, carrier, and fulfillment status |
| `inventory.count.updated` | Update stock counts in real-time |
| `catalog.version.updated` | Auto-sync catalog when items change in Square |
| `refund.updated` | Mark orders as refunded/partially refunded |
| `loyalty.account.updated` | Sync loyalty point balance to customer records |
| `subscription.updated` | Sync subscription status and billing date |
| `subscription.created` | Sync newly created subscriptions |

4. Copy the **Signature key** to `SQUARE_WEBHOOK_SECRET`

### Loyalty (optional)

1. Enable the **Loyalty** feature in your Square Dashboard
2. Configure earning rules (points per dollar) and reward tiers
3. Add `loyalty: { programId: 'main' }` to the plugin options
4. Users opt in at checkout via the "Join the loyalty program" checkbox

## Plugin Options

```ts
type PayloadPluginSquareConfig = {
  accessToken: string
  /** Single location ID or array for multi-location. First entry used for payments. */
  locationId: string | string[]
  environment?: 'sandbox' | 'production'    // default: 'sandbox'
  webhookSecret?: string
  mediaCollectionSlug?: string              // default: 'media'
  syncOnInit?: boolean                      // sync catalog on server start
  /** Cron expression for scheduled sync via Payload Jobs Queue, e.g. '0 * * * *' */
  syncSchedule?: string
  disabled?: boolean                        // keep schema, disable all API activity
  endpoints?: {
    checkout?: boolean                      // default: true
    webhook?: boolean                       // default: true
    sync?: boolean                          // default: true
  }
  /**
   * Predicate used for row-level access control on all plugin collections.
   * Admins can read every record; non-admins can only read their own.
   * Defaults to: (user) => user?.roles?.includes('admin')
   *
   * Override when your user model uses a different shape:
   *   isAdmin: (user) => (user as MyUser).isAdmin === true
   */
  isAdmin?: (user: unknown) => boolean
  loyalty?: {
    programId?: string                      // default: 'main'
  }
  shipping?: {
    rates: {
      id: string
      name: string
      amount: number                        // cents
      estimatedDays?: number
    }[]
    freeShippingThreshold?: number          // cents; orders at or above this get free shipping
  }
  /** Enable Square Subscriptions endpoints. Omit to disable. */
  subscriptions?: {}
  hooks?: {
    beforeCheckout?: (ctx: BeforeCheckoutContext) => Promise<void>
    afterCheckout?: (ctx: AfterCheckoutContext) => Promise<void>
    onWebhookReceived?: (ctx: WebhookContext) => Promise<void>
    onSyncComplete?: (ctx: SyncContext) => Promise<void>
  }
}
```

## Delta Sync

After the first full sync, subsequent syncs only fetch catalog items modified in Square since the last `lastSyncedAt` timestamp (with a 5-minute buffer for clock skew). The `catalog.version.updated` webhook also triggers an automatic background sync so your catalog stays fresh without polling.

## Multi-Location

```ts
payloadPluginSquare({
  locationId: ['LOCATION_A', 'LOCATION_B'],
  // LOCATION_A is used for Square Orders and Payments
  // Both locations are checked for inventory counts at checkout
})
```

## Real-Time Inventory

The `/api/square/inventory-stream` endpoint is a Server-Sent Events stream. Connect from the browser to receive live updates:

```ts
const es = new EventSource('/api/square/inventory-stream')
es.onmessage = (e) => {
  const update = JSON.parse(e.data)
  if (update.type === 'inventory') {
    // update.variationSquareId, update.quantity
  }
  if (update.type === 'catalog') {
    // full catalog changed — refetch
  }
}
```

## Development

```bash
pnpm install
pnpm dev        # starts the dev app at http://localhost:3000
```

The `dev/` folder contains a full Payload + Next.js storefront for end-to-end testing:

| Route | Description |
|---|---|
| `/` | Catalog grid with real-time inventory |
| `/item/[id]` | Product detail with variation selector |
| `/cart` | Shopping cart |
| `/checkout` | Square Web Payments SDK checkout form |
| `/order/[id]` | Order confirmation |
| `/login` | User sign-in (Payload auth) |
| `/account` | Loyalty balance, reward tiers, order history |
| `/admin` | Payload CMS admin panel |

Copy `dev/.env.example` to `dev/.env` and fill in your Square credentials.

### Running tests

```bash
pnpm test:int   # unit tests (Vitest)
```

> **Note:** Delete `dev/dev.db` whenever collection slugs change — SQLite will recreate the schema on next start.

### Sandbox test credentials

**Payload admin:** `dev@payloadcms.com` / `test`

**Square test cards** (any future expiry date, any CVV, any postal code):

| Network | Number |
|---|---|
| Visa | `4111 1111 1111 1111` |
| Mastercard | `5105 1051 0510 5100` |
| American Express | `3714 4963 5398 431` |
| Discover | `6011 1111 1111 1117` |

For nonce-based testing (bypass the card form), see [Square Sandbox test values](https://developer.squareup.com/docs/devtools/sandbox/payments).

## Security

### Collection access control

Row-level access control is built into every plugin collection. Admins can read all records; authenticated non-admins can only read their own. Unauthenticated requests are always rejected.

The plugin determines admin status via the `isAdmin` option (defaults to `user.roles.includes('admin')`). To use the default, add a `roles` field to your users collection:

```ts
// In your users collection:
{
  name: 'roles',
  type: 'select',
  hasMany: true,
  defaultValue: ['user'],
  options: [
    { label: 'Admin', value: 'admin' },
    { label: 'User', value: 'user' },
  ],
}
```

If your user model uses a different shape, pass a custom predicate:

```ts
payloadPluginSquare({
  isAdmin: (user) => (user as MyUser).isAdmin === true,
  // ...
})
```

**Access rules per collection:**

| Collection | Admin | Authenticated user | Guest |
|---|---|---|---|
| `catalog` | Read | Read | Read |
| `orders` | All records | Own orders only | ✗ |
| `customers` | All records | Own record only | ✗ |
| `payments` | All records | ✗ | ✗ |
| `square-webhook-events` | All records | ✗ | ✗ |
| `square-subscriptions` | All records | Own subscriptions only | ✗ |

### Webhook replay protection

Webhook deduplication uses a two-layer approach:
1. **Application check** — queries the `square-webhook-events` collection before processing.
2. **Database unique constraint** — the `eventId` field has `unique: true`. If two concurrent deliveries of the same event both pass the application check, whichever creates the record second gets a unique constraint violation, which the handler catches and returns 200 for (Square stops retrying). This eliminates the TOCTOU race condition.

### Card data

Card numbers and CVVs are never stored in Payload. Square's Web Payments SDK tokenizes the card in the browser; only the single-use nonce reaches your server. For subscriptions, the nonce is converted to a card-on-file in Square's vault via `POST /v2/cards` and only the card ID is stored.

## Payment Methods & Addresses — Best Practices

**Card data is never stored in Payload.** Square's Web Payments SDK tokenizes the card in the browser and returns a single-use nonce. Only that nonce is sent to your server, where it is passed to Square's Payments API. Square handles PCI-DSS scope; your database never touches card numbers or CVVs.

**What Payload stores:**

| Data | Where | Notes |
|---|---|---|
| Square Customer ID | `customers.squareCustomerId` | Links to Square's customer record |
| Loyalty Account ID | `customers.loyaltyAccountId` | Links to Square's loyalty record |
| Shipping address | `orders.shippingAddress` | Stored per-order for fulfillment |
| Order totals & line items | `orders` | For your own records |
| Raw payment response | `payments.rawResponse` | Audit trail only |

**Saved payment methods:** Square stores cards-on-file in its own vault. To offer "pay with saved card," retrieve the customer's cards via the [Square Customers API](https://developer.squareup.com/reference/square/customers-api) and pass the card ID as `sourceId` to checkout. No card data ever lives in Payload.

**Shipping addresses:** Stored on the `orders` record (one address per order). If you want a customer address book, store address objects linked to the `customers` collection and let users select one at checkout.

## Reference Documentation

### Square
| Topic | Link |
|---|---|
| API overview | [developer.squareup.com/docs](https://developer.squareup.com/docs) |
| Orders API | [Create orders](https://developer.squareup.com/reference/square/orders-api/create-order) |
| Payments API | [Create payments](https://developer.squareup.com/reference/square/payments-api/create-payment) |
| Catalog API | [List catalog](https://developer.squareup.com/reference/square/catalog-api/list-catalog) |
| Inventory API | [Batch retrieve counts](https://developer.squareup.com/reference/square/inventory-api/batch-retrieve-inventory-counts) |
| Customers API | [Search customers](https://developer.squareup.com/reference/square/customers-api/search-customers) |
| Loyalty API | [Loyalty overview](https://developer.squareup.com/docs/loyalty-api/overview) |
| Fulfillments | [Order fulfillments](https://developer.squareup.com/docs/orders-api/create-orders#fulfillments) |
| Webhooks | [Webhook overview](https://developer.squareup.com/docs/webhooks/overview) |
| Web Payments SDK | [Getting started](https://developer.squareup.com/docs/web-payments/overview) |
| Sandbox payments | [Test card numbers & nonces](https://developer.squareup.com/docs/devtools/sandbox/payments) |
| Node.js SDK | [square npm package](https://www.npmjs.com/package/square) |

### Payload CMS
| Topic | Link |
|---|---|
| Getting started | [payloadcms.com/docs](https://payloadcms.com/docs) |
| Collections | [Collection config](https://payloadcms.com/docs/configuration/collections) |
| Hooks | [Collection hooks](https://payloadcms.com/docs/hooks/collections) |
| Access control | [Access control](https://payloadcms.com/docs/access-control/overview) |
| Local API | [Local API](https://payloadcms.com/docs/local-api/overview) |
| Custom endpoints | [REST endpoints](https://payloadcms.com/docs/rest-api/overview) |
| Jobs queue | [Background jobs](https://payloadcms.com/docs/jobs-queue/overview) |
| Email | [Email adapter](https://payloadcms.com/docs/email/overview) |
| Plugin development | [Building plugins](https://payloadcms.com/docs/plugins/build-your-own) |
