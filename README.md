# payload-plugin-square

A [Payload CMS](https://payloadcms.com) plugin that integrates [Square](https://squareup.com/developers) for catalog sync, inventory tracking, and payments.

## Features

- **Catalog sync** — pulls Square catalog items (with images) into a local Payload collection, reducing your exposure to Square outages
- **Real-time inventory** — Square webhooks update stock counts instantly via Server-Sent Events; all open browser tabs reflect changes without a refresh
- **Checkout** — server-side price verification, live inventory gating, Square Order + Payment creation, and Payload order/audit records in one endpoint
- **Webhook handling** — verifies HMAC-SHA256 signatures and handles `payment.updated`, `order.updated`, and `inventory.count.updated` events
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
      syncOnInit: true, // sync catalog on server start
    }),
  ],
})
```

## Environment Variables

| Variable | Description |
|---|---|
| `SQUARE_ACCESS_TOKEN` | Square API access token |
| `SQUARE_LOCATION_ID` | Square location ID |
| `SQUARE_ENVIRONMENT` | `sandbox` or `production` |
| `SQUARE_WEBHOOK_SECRET` | Signature key from Square webhook subscription |
| `NEXT_PUBLIC_SQUARE_APPLICATION_ID` | Square app ID (browser, for Web Payments SDK) |
| `NEXT_PUBLIC_SQUARE_LOCATION_ID` | Square location ID (browser, for Web Payments SDK) |

## Collections Added

All three collections are grouped under **Square** in the Payload admin sidebar.

| Slug | Description |
|---|---|
| `catalog` | Read-only. Synced catalog with variations and inventory counts — managed by Square. |
| `orders` | Orders created at checkout |
| `payments` | Read-only. Raw Square payment audit log for reconciliation. |

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/square/sync` | Manually trigger a catalog sync (requires auth) |
| `POST` | `/api/square/checkout` | Process a cart through Square |
| `POST` | `/api/square/webhook` | Receive Square webhook events |
| `GET` | `/api/square/inventory-stream` | SSE stream for real-time inventory updates |

### Checkout request body

```ts
{
  sourceId: string          // Square payment token from Web Payments SDK
  cart: {
    items: {
      variationId: string   // Square catalog variation ID
      quantity: number
      unitPrice: number     // cents — verified server-side against Square
    }[]
    userId?: string         // optional Payload user ID
    guestEmail?: string
  }
}
```

## Square Webhook Setup

1. In the Square Developer Dashboard, create a webhook subscription
2. Set the URL to `https://your-domain.com/api/square/webhook`
3. Subscribe to: `inventory.count.updated`, `payment.updated`, `order.updated`
4. Copy the **Signature key** to `SQUARE_WEBHOOK_SECRET`

## Plugin Options

```ts
type PayloadPluginSquareConfig = {
  accessToken: string
  locationId: string
  environment?: 'sandbox' | 'production'
  webhookSecret?: string
  mediaCollectionSlug?: string   // default: 'media'
  syncOnInit?: boolean           // sync catalog on server start
  disabled?: boolean
  endpoints?: {
    checkout?: boolean           // default: true
    webhook?: boolean            // default: true
    sync?: boolean               // default: true
  }
  hooks?: {
    beforeCheckout?: (ctx: BeforeCheckoutContext) => Promise<void>
    afterCheckout?: (ctx: AfterCheckoutContext) => Promise<void>
    onWebhookReceived?: (ctx: WebhookContext) => Promise<void>
    onSyncComplete?: (ctx: SyncContext) => Promise<void>
  }
}
```

## Development

```bash
pnpm install
pnpm dev        # starts the dev app at http://localhost:3000
```

The `dev/` folder contains a full Payload + Next.js app with a storefront UI (catalog → item detail → cart → checkout) for end-to-end testing. Copy `dev/.env.example` to `dev/.env` and fill in your Square credentials.
