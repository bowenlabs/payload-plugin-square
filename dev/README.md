# dev/

This is the integration test harness for `payload-plugin-square`. It is **not published** and not intended as a production template — it exists to develop and test the plugin against real Square sandbox APIs.

## What it is

A full Next.js + Payload CMS application that:

- Registers the plugin from `../src/` (the local source, not npm)
- Exercises every plugin feature end-to-end: catalog sync, inventory SSE, checkout, webhooks, customers, loyalty
- Doubles as a reference implementation so you can see all the pieces wired together

## What it is not

- A production storefront template (no error boundary, no accessibility audit, inline CSS)
- The canonical example for how to build a checkout UI (see `../examples/` for clean, annotated patterns)

## Setup

```bash
cp .env.example .env
# Fill in SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, etc.
```

See the [CONTRIBUTING guide](../CONTRIBUTING.md) for Square Dashboard setup, webhook tunnelling, and first-run instructions.

## Structure

```
dev/
├── app/
│   ├── _auth/          ← Auth context (login / logout / current user)
│   ├── _cart/          ← Cart context (localStorage-backed)
│   ├── _components/    ← Nav bar
│   ├── _hooks/         ← useInventoryStream (SSE)
│   ├── account/        ← Loyalty balance + order history (logged-in users)
│   ├── cart/           ← Shopping cart page
│   ├── checkout/       ← Square Web Payments SDK checkout form
│   ├── item/[id]/      ← Product detail
│   ├── login/          ← User sign-in
│   ├── order/[id]/     ← Order confirmation
│   ├── (payload)/      ← Auto-generated Payload admin routes (do not edit)
│   └── page.tsx        ← Catalog grid (home page)
├── payload.config.ts   ← Payload config — registers the plugin
├── .env.example        ← Required environment variables
└── README.md           ← You are here
```

## Useful commands

```bash
pnpm dev                    # start dev server at http://localhost:3000
pnpm dev:generate-types     # regenerate payload-types.ts after schema changes
pnpm dev:generate-importmap # regenerate admin importMap after adding components
```

> Delete `dev.db` whenever you change collection slugs or field names — SQLite recreates the schema on next start.
