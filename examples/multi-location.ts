/**
 * Multi-location plugin config example
 *
 * Pass an array to `locationId` when your Square account has more than one
 * location. The plugin uses the array as follows:
 *
 *  - First entry → used as the locationId for Square Orders and Payments
 *  - All entries → used together for inventory count queries at checkout
 *
 * This means a customer can buy from any location's stock, but the order and
 * payment are always attributed to the primary location in Square's reporting.
 */

import { buildConfig } from 'payload'
import { payloadPluginSquare } from 'payload-plugin-square'

export default buildConfig({
  plugins: [
    payloadPluginSquare({
      accessToken: process.env.SQUARE_ACCESS_TOKEN!,

      // Primary location first — all subsequent locations are checked for inventory
      locationId: [
        process.env.SQUARE_LOCATION_PRIMARY!,   // → orders, payments, loyalty
        process.env.SQUARE_LOCATION_WAREHOUSE!,  // → inventory checks only
        process.env.SQUARE_LOCATION_POPUP!,      // → inventory checks only
      ],

      environment: process.env.SQUARE_ENVIRONMENT === 'production' ? 'production' : 'sandbox',
      webhookSecret: process.env.SQUARE_WEBHOOK_SECRET,
      syncOnInit: true,
    }),
  ],

  // ... rest of your Payload config
})

// ── Required environment variables ────────────────────────────────────────
//
// SQUARE_ACCESS_TOKEN=...
// SQUARE_LOCATION_PRIMARY=LXXXXXXXXXXXXXXXXX
// SQUARE_LOCATION_WAREHOUSE=LXXXXXXXXXXXXXXXXX
// SQUARE_LOCATION_POPUP=LXXXXXXXXXXXXXXXXX
// SQUARE_ENVIRONMENT=sandbox
// SQUARE_WEBHOOK_SECRET=...
