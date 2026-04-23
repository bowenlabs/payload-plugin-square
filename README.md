# payload-plugin-square

A [Payload CMS](https://payloadcms.com) plugin that integrates [Square](https://squareup.com/developers) for catalog sync, inventory tracking, payments, customers, and loyalty.

## Features

- **Catalog sync** — pulls Square catalog items (with images) into a local Payload collection; delta sync only fetches items changed since the last run
- **Real-time inventory** — Square webhooks update stock counts instantly via Server-Sent Events; all open browser tabs reflect changes without a refresh
- **Checkout** — server-side price verification, live inventory gating, Square Order + Payment creation, and Payload order/audit records in one endpoint
- **Customer records** — creates or finds a `customers` record at checkout for both logged-in users and guests; links orders and loyalty data to the customer
- **Square Loyalty** — opt-in loyalty account creation, point accrual, reward redemption, and live balance sync via webhooks; includes a `GET /api/square/loyalty/balance` endpoint
- **Guest order emails** — sends an HTML order confirmation email after checkout (requires Payload email adapter)
- **Webhook handling** — verifies HMAC-SHA256 signatures, deduplicates replayed events, and handles `payment.updated`, `order.updated`, `inventory.count.updated`, `catalog.version.updated`, `refund.updated`, and `loyalty.account.updated`
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
      syncOnInit: true,               // sync catalog on server start
      syncSchedule: '0 * * * *',      // optional: also sync hourly via Jobs Queue
      loyalty: {                       // optional: enable Square Loyalty
        programId: 'main',             // Square loyalty program ID (default: 'main')
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
| `catalog` | Catalog | Read-only. Synced catalog items with variations and inventory counts. |
| `orders` | Orders | Orders created at checkout. |
| `customers` | Customers | Customer records linked to Payload users and Square loyalty accounts. |
| `payments` | Payments | Read-only. Raw Square payment responses for reconciliation. |
| `square-webhook-events` | Webhook Events | Read-only. Processed webhook event IDs for replay protection. |

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `POST` | `/api/square/checkout` | Optional | Process a cart through Square |
| `POST` | `/api/square/webhook` | — | Receive Square webhook events |
| `GET` | `/api/square/inventory-stream` | — | SSE stream for real-time inventory/catalog updates |
| `POST` | `/api/square/sync` | Required | Manually trigger a catalog sync |
| `GET` | `/api/square/loyalty/balance` | Required | Current loyalty balance, program tiers, and redeemable rewards |

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
  }
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
| `inventory.count.updated` | Update stock counts in real-time |
| `catalog.version.updated` | Auto-sync catalog when items change in Square |
| `refund.updated` | Mark orders as refunded/partially refunded |
| `loyalty.account.updated` | Sync loyalty point balance to customer records |

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
  loyalty?: {
    programId?: string                      // default: 'main'
  }
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
pnpm test:e2e   # end-to-end tests (Playwright)
```

> **Note:** Delete `dev/dev.db` whenever collection slugs change — SQLite will recreate the schema on next start.
