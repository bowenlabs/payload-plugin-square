import type { Config } from 'payload'

import { createCustomersCollection } from './collections/Customers.js'
import { createOrdersCollection } from './collections/Orders.js'
import { createSquareCatalogItemsCollection } from './collections/SquareCatalogItems.js'
import { createSquarePaymentsCollection } from './collections/SquarePayments.js'
import { createSquareSubscriptionsCollection } from './collections/SquareSubscriptions.js'
import { createSquareWebhookEventsCollection } from './collections/SquareWebhookEvents.js'
import { createCheckoutHandler } from './endpoints/checkout.js'
import { inventoryStreamHandler } from './endpoints/inventoryStream.js'
import { createLoyaltyBalanceHandler } from './endpoints/loyaltyBalance.js'
import {
  createCancelSubscriptionHandler,
  createListSubscriptionsHandler,
  createPauseSubscriptionHandler,
  createResumeSubscriptionHandler,
} from './endpoints/manageSubscriptions.js'
import { createShippingRatesHandler } from './endpoints/shippingRates.js'
import { createSubscribeHandler } from './endpoints/subscribe.js'
import { createSubscriptionPlansHandler } from './endpoints/subscriptionPlans.js'
import { makeSyncHandler } from './endpoints/syncEndpoint.js'
import { createWebhookHandler } from './endpoints/webhook.js'
import { defaultIsAdmin } from './lib/accessControl.js'
import { primaryLocation } from './lib/locationUtils.js'
import { syncCatalog } from './tasks/syncCatalog.js'
import type { PayloadPluginSquareConfig } from './types.js'

export type { PayloadPluginSquareConfig } from './types.js'
export type {
  AfterCheckoutContext,
  BeforeCheckoutContext,
  Cart,
  CartItem,
  Customer,
  Order,
  OrderLineItem,
  ShippingAddress,
  ShippingRate,
  SquarePayment,
  SyncContext,
  WebhookContext,
} from './types.js'
export { createSquareSubscriptionsCollection } from './collections/SquareSubscriptions.js'
export { defaultIsAdmin } from './lib/accessControl.js'

export const payloadPluginSquare =
  (pluginOptions: PayloadPluginSquareConfig) =>
  (config: Config): Config => {
    if (!pluginOptions.disabled) {
      if (!pluginOptions.accessToken) {
        throw new Error('[payload-plugin-square] accessToken is required')
      }
      if (
        !pluginOptions.locationId ||
        (Array.isArray(pluginOptions.locationId) && pluginOptions.locationId.length === 0)
      ) {
        throw new Error('[payload-plugin-square] locationId is required')
      }
      const { endpoints: endpointOptions = {} } = pluginOptions
      if (endpointOptions.webhook !== false && !pluginOptions.webhookSecret) {
        console.warn(
          '[payload-plugin-square] webhookSecret is not set — the webhook endpoint will reject all incoming events',
        )
      }
    }

    const mediaCollectionSlug = pluginOptions.mediaCollectionSlug ?? 'media'
    const isAdmin = pluginOptions.isAdmin ?? defaultIsAdmin

    if (!config.collections) {
      config.collections = []
    }

    // Always register collections so the DB schema stays consistent across environments
    config.collections.push(
      createSquareCatalogItemsCollection(mediaCollectionSlug),
      createOrdersCollection(isAdmin),
      createCustomersCollection(isAdmin),
      createSquarePaymentsCollection(isAdmin),
      createSquareWebhookEventsCollection(isAdmin),
      createSquareSubscriptionsCollection(isAdmin),
    )

    if (pluginOptions.disabled) {
      return config
    }

    if (!config.endpoints) {
      config.endpoints = []
    }

    const { endpoints: endpointOptions = {} } = pluginOptions

    if (endpointOptions.checkout !== false) {
      config.endpoints.push({
        path: '/square/checkout',
        method: 'post',
        handler: createCheckoutHandler(pluginOptions),
      })
    }

    if (endpointOptions.webhook !== false) {
      config.endpoints.push({
        path: '/square/webhook',
        method: 'post',
        handler: createWebhookHandler(pluginOptions),
      })
    }

    if (endpointOptions.inventoryStream !== false) {
      config.endpoints.push({
        path: '/square/inventory-stream',
        method: 'get',
        handler: inventoryStreamHandler,
      })
    }

    if (pluginOptions.loyalty) {
      config.endpoints.push({
        path: '/square/loyalty/balance',
        method: 'get',
        handler: createLoyaltyBalanceHandler(pluginOptions),
      })
    }

    if (pluginOptions.shipping) {
      config.endpoints.push({
        path: '/square/shipping/rates',
        method: 'get',
        handler: createShippingRatesHandler(pluginOptions),
      })
    }

    if (pluginOptions.subscriptions) {
      config.endpoints.push(
        {
          path: '/square/subscriptions/plans',
          method: 'get',
          handler: createSubscriptionPlansHandler(pluginOptions),
        },
        {
          path: '/square/subscriptions/subscribe',
          method: 'post',
          handler: createSubscribeHandler(pluginOptions),
        },
        {
          path: '/square/subscriptions',
          method: 'get',
          handler: createListSubscriptionsHandler(pluginOptions),
        },
        {
          path: '/square/subscriptions/cancel',
          method: 'post',
          handler: createCancelSubscriptionHandler(pluginOptions),
        },
        {
          path: '/square/subscriptions/pause',
          method: 'post',
          handler: createPauseSubscriptionHandler(pluginOptions),
        },
        {
          path: '/square/subscriptions/resume',
          method: 'post',
          handler: createResumeSubscriptionHandler(pluginOptions),
        },
      )
    }

    if (endpointOptions.sync !== false) {
      config.endpoints.push({
        path: '/square/sync',
        method: 'post',
        handler: makeSyncHandler({
          accessToken: pluginOptions.accessToken,
          environment: pluginOptions.environment,
          locationId: pluginOptions.locationId,
          mediaCollectionSlug,
        }),
      })
    }

    if (pluginOptions.syncSchedule) {
      const taskSlug = 'square-catalog-sync'
      const locationId = pluginOptions.locationId

      if (!config.jobs) config.jobs = {}
      config.jobs.tasks = [
        ...(config.jobs.tasks ?? []),
        {
          slug: taskSlug,
          retries: 1,
          outputSchema: [{ name: 'synced', type: 'number' as const }],
          handler: async ({ req }: { req: import('payload').PayloadRequest; job: unknown }) => {
            const { synced } = await syncCatalog({
              accessToken: pluginOptions.accessToken,
              environment: pluginOptions.environment,
              locationId,
              mediaCollectionSlug,
              payload: req.payload,
            })
            req.payload.logger.info(`Scheduled Square catalog sync complete — ${synced} items synced`)
            return { output: { synced } }
          },
        },
      ]
      const newAutoRun = { cron: pluginOptions.syncSchedule, limit: 1, task: taskSlug }
      const existingAutoRun = config.jobs.autoRun
      if (typeof existingAutoRun === 'function') {
        config.jobs.autoRun = async (payload) => {
          const resolved = await existingAutoRun(payload)
          return [...resolved, newAutoRun]
        }
      } else {
        config.jobs.autoRun = [...(existingAutoRun ?? []), newAutoRun]
      }
    }

    if (pluginOptions.syncOnInit) {
      const incomingOnInit = config.onInit

      config.onInit = async (payload) => {
        if (incomingOnInit) {
          await incomingOnInit(payload)
        }

        try {
          const { synced } = await syncCatalog({
            accessToken: pluginOptions.accessToken,
            environment: pluginOptions.environment,
            locationId: pluginOptions.locationId,
            mediaCollectionSlug,
            payload,
          })
          payload.logger.info(`Square catalog sync complete — ${synced} items synced`)
        } catch (err) {
          payload.logger.error({ err }, 'Square catalog sync on init failed')
        }
      }
    }

    return config
  }
