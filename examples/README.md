# Examples

This directory contains annotated patterns for common customisations. Each example is a focused code snippet with inline comments — not a runnable app.

For a complete, working storefront implementation see the `dev/` folder at the root of this repo. It is a full Next.js + Payload app that exercises every plugin feature and doubles as the integration test harness.

---

## What's in each example

| File | What it shows |
|---|---|
| [`storefront-checkout.tsx`](./storefront-checkout.tsx) | Production-ready checkout form with loyalty reward selector |
| [`storefront-account.tsx`](./storefront-account.tsx) | Account page with loyalty balance, reward tiers, and order history |
| [`afterCheckout-hook.ts`](./afterCheckout-hook.ts) | `afterCheckout` plugin hook — trigger fulfilment, send to CRM, etc. |
| [`custom-webhook-handler.ts`](./custom-webhook-handler.ts) | `onWebhookReceived` hook — act on any Square event in your own code |
| [`multi-location.ts`](./multi-location.ts) | Plugin config for a multi-location Square account |

---

## When to use the dev app vs. these examples

| Scenario | Use |
|---|---|
| Developing or debugging the plugin | `dev/` — it's wired to the live plugin source |
| Adding a new feature and need a test surface | `dev/` |
| Building your own app on top of the plugin | Start here, then adapt |
| Showing a colleague how to wire up checkout | These examples |
