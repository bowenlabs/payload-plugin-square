# Contributing to payload-plugin-square

Thanks for helping out. This document covers everything you need to go from zero to a running dev environment, plus the patterns to follow when adding new features.

---

## Repository structure

```
payload-plugin-square/
├── src/                        ← Plugin source (the publishable package)
│   ├── collections/            ← Payload collection configs
│   ├── endpoints/              ← API route handlers
│   ├── lib/                    ← Shared utilities (Square client, location helpers, SSE broadcaster)
│   ├── tasks/                  ← Payload Jobs Queue tasks (catalog sync)
│   ├── types.ts                ← All exported types
│   ├── index.ts                ← Plugin entry point
│   └── __tests__/              ← Vitest unit tests
├── dev/                        ← Integration test harness (Next.js + Payload + storefront)
│   ├── app/                    ← Next.js App Router pages and components
│   ├── payload.config.ts       ← Dev Payload config (uses the plugin from src/)
│   └── .env.example            ← Required environment variables
├── examples/                   ← Annotated code patterns for common customisations
└── CONTRIBUTING.md
```

The plugin (`src/`) and the dev app (`dev/`) are intentionally separate. The dev app is not published — it exists purely to develop and test the plugin end-to-end. It doubles as a reference storefront so contributors can see all features in action, but you should not treat it as production-quality frontend code.

---

## Prerequisites

- **Node.js** `^18.20.2` or `>=20.9.0`
- **pnpm** `^9` or `^10`
- A **Square developer account** — [sign up free](https://developer.squareup.com/)
- A tunnel tool for webhooks: [ngrok](https://ngrok.com/) or [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)

---

## Square sandbox setup

### 1. Create a Square application

1. Go to the [Square Developer Dashboard](https://developer.squareup.com/apps)
2. Click **Create your first application** (or **+** to add another)
3. Give it a name, then open it

### 2. Gather credentials

From the application dashboard, copy:

| What | Where to find it | Environment variable |
|---|---|---|
| Sandbox access token | **Credentials** → Sandbox tab | `SQUARE_ACCESS_TOKEN` |
| Application ID | **Credentials** → Sandbox tab | `NEXT_PUBLIC_SQUARE_APPLICATION_ID` |
| Location ID | **Locations** → your sandbox location | `SQUARE_LOCATION_ID` + `NEXT_PUBLIC_SQUARE_LOCATION_ID` |

### 3. Required API permissions

Your application needs at least these OAuth scopes enabled (they are on by default for sandbox):

- `ITEMS_READ` — catalog sync
- `INVENTORY_READ` — inventory counts at checkout
- `ORDERS_WRITE` — create orders
- `PAYMENTS_WRITE` — charge payments
- `CUSTOMERS_READ` / `CUSTOMERS_WRITE` — customer lookup and creation
- `LOYALTY_READ` / `LOYALTY_WRITE` — if testing loyalty features

### 4. Set up webhooks

Webhooks require a publicly accessible URL. Run ngrok (or equivalent) pointing at port 3000:

```bash
ngrok http 3000
```

Then in the Square Developer Dashboard:

1. Go to **Webhooks** → **Subscriptions** → **Add subscription**
2. Set the URL to `https://<your-ngrok-subdomain>.ngrok.io/api/square/webhook`
3. Select the following events:

   | Event | Why |
   |---|---|
   | `inventory.count.updated` | Real-time stock updates |
   | `payment.updated` | Order status sync |
   | `order.updated` | Order status sync |
   | `catalog.version.updated` | Auto-sync catalog on Square changes |
   | `refund.updated` | Mark orders refunded |
   | `loyalty.account.updated` | Sync loyalty point balance |

4. Click **Save**, then copy the **Signature key** → `SQUARE_WEBHOOK_SECRET`

> **Tip:** The ngrok URL changes every restart unless you have a paid plan. Re-paste it into the Square Dashboard each session or use a static domain.

### 5. Add catalog items in Square

The dev app will be empty until you sync. Add a few items in the [Square Items Catalog](https://squareupsandbox.com/dashboard/items/library), then either restart the dev server (with `syncOnInit: true`) or hit `POST /api/square/sync`.

---

## Running the dev app

```bash
# Install dependencies
pnpm install

# Copy and fill in your credentials
cp dev/.env.example dev/.env
# Edit dev/.env with your Square sandbox values

# Start the dev server
pnpm dev
# → http://localhost:3000  (storefront)
# → http://localhost:3000/admin  (Payload admin panel)
```

> **First run:** Payload creates `dev/dev.db` automatically. If you change any collection field names or slugs, delete `dev/dev.db` before restarting so SQLite recreates the schema.

### Creating an admin user

On first start, visit `http://localhost:3000/admin` and follow the "Create first user" prompt. This user account is also what the `/login` storefront page authenticates against.

---

## Running tests

```bash
# Unit tests (Vitest — no Square credentials needed)
pnpm test:int
```

Unit tests live in `src/__tests__/` and mock all external dependencies. They cover:

| File | What's tested |
|---|---|
| `locationUtils.test.ts` | `primaryLocation` / `allLocations` pure functions |
| `plugin.test.ts` | Config builder — collections, endpoints, jobs, syncOnInit |
| `checkout.test.ts` | Input validation, price mismatch, loyalty opt-in gating |
| `webhook.test.ts` | Signature verification, replay protection, event routing |

---

## How to add a new webhook handler

Square fires many event types. Adding a handler for one takes three steps.

**1. Subscribe in Square Dashboard** — add the event to your webhook subscription.

**2. Add a handler function in `src/endpoints/webhook.ts`:**

```ts
async function handleSubscriptionUpdated(
  req: Parameters<PayloadHandler>[0],
  object: Record<string, unknown>,
) {
  const subscription = (object as { subscription?: Record<string, unknown> }).subscription
  if (!subscription) return

  // ...your logic here
}
```

**3. Call it in the main handler switch block:**

```ts
if (type === 'subscription.updated') {
  await handleSubscriptionUpdated(req, data.object)
}
```

A few conventions to follow:

- Always return early if the expected object key is missing (Square event shapes are not guaranteed)
- Use `overrideAccess: true` on all Payload operations inside webhook handlers — the request has no authenticated user
- Wrap in try/catch if the operation is non-fatal (don't let a best-effort side effect kill the 200 response)
- Square retries delivery on any non-2xx response — a 200 must be returned even if your handler did nothing

---

## How to add a new endpoint

**1. Create a handler factory in `src/endpoints/`:**

```ts
// src/endpoints/myFeature.ts
import type { PayloadHandler } from 'payload'
import type { PayloadPluginSquareConfig } from '../types.js'

export function createMyFeatureHandler(options: PayloadPluginSquareConfig): PayloadHandler {
  return async (req) => {
    // ...
    return Response.json({ ok: true })
  }
}
```

**2. Register it in `src/index.ts`:**

```ts
import { createMyFeatureHandler } from './endpoints/myFeature.js'

// Inside payloadPluginSquare:
config.endpoints.push({
  path: '/square/my-feature',
  method: 'get',
  handler: createMyFeatureHandler(pluginOptions),
})
```

**3. Gate it behind an option if it's opt-in:**

```ts
if (pluginOptions.myFeature) {
  config.endpoints.push({ ... })
}
```

**4. Export any new public types from `src/index.ts`.**

---

## How to add a new collection

Collections are registered in `src/index.ts` regardless of whether the plugin is `disabled` — this keeps the database schema consistent across environments.

```ts
// src/collections/MyCollection.ts
import type { CollectionConfig } from 'payload'

export const MyCollection: CollectionConfig = {
  slug: 'my-collection',
  admin: { group: 'Square' },   // keep all plugin collections together
  access: {
    read: ({ req }) => !!req.user,
    create: () => false,
    update: () => false,
    delete: () => false,
  },
  fields: [...],
}
```

```ts
// src/index.ts
config.collections.push(MyCollection)
```

If the collection adds fields that other parts of the plugin reference by name, add the corresponding type to `src/types.ts` and export it from `src/index.ts`.

---

## Commit conventions

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short description>

feat(webhook): add loyalty.account.updated handler
fix(checkout): convert BigInt amounts before JSON serialisation
docs: update webhook setup in README
test(plugin): add autoRun function-merge case
refactor(sync): use pagination:false instead of limit:200
```

| Type | When to use |
|---|---|
| `feat` | New capability visible to plugin users |
| `fix` | Bug fix |
| `docs` | README, CONTRIBUTING, inline comments |
| `test` | Adding or updating tests |
| `refactor` | Internal cleanup, no behaviour change |
| `chore` | Dependency bumps, build config, CI |

Scope is optional but helpful — use the relevant module name (`checkout`, `webhook`, `sync`, `catalog`, `loyalty`, `dev`).

---

## Pull request checklist

- [ ] `pnpm test:int` passes with no failures
- [ ] `pnpm lint` passes (or failures are pre-existing and unrelated)
- [ ] New public API surface is exported from `src/index.ts` and documented in `README.md`
- [ ] New webhook events are listed in both `README.md` and this file's webhook section
- [ ] `dev/dev.db` is **not** committed (it's in `.gitignore`)
- [ ] `dev/media/` files are **not** committed (it's in `.gitignore`)
- [ ] The PR description explains the *why*, not just the *what*

---

## Project decisions worth knowing

**Why `overrideAccess: true` everywhere in the plugin?**
Plugin operations (sync, webhook handlers, checkout) run server-side with no authenticated user on the request. Payload's Local API bypasses access control only when `overrideAccess: true` is explicitly set. All plugin operations trust the server context; access control is enforced at the collection level for external requests.

**Why SQLite in dev?**
Zero setup friction. The trade-off: nested array field queries are unreliable in SQLite, which is why `handleInventoryCountUpdated` fetches all catalog items and filters in memory rather than querying `variations.squareId` directly.

**Why `pagination: false` for catalog fetches in webhook handlers?**
The `limit: N` approach caps results silently, which would cause inventory updates to be silently dropped for stores with large catalogs. `pagination: false` fetches all documents regardless of count.

**Why does the checkout handler call `createSquareClient` before input validation?**
The client constructor makes no network requests — it only stores credentials. The ordering is a minor style inconsistency; the real work only begins at the catalog batch-get call after validation passes.
