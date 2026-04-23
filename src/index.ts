import type { Config } from 'payload'

import { Orders } from './collections/Orders.js'
import { createSquareCatalogItemsCollection } from './collections/SquareCatalogItems.js'
import { SquarePayments } from './collections/SquarePayments.js'
import { createCheckoutHandler } from './endpoints/checkout.js'
import { inventoryStreamHandler } from './endpoints/inventoryStream.js'
import { makeSyncHandler } from './endpoints/syncEndpoint.js'
import { createWebhookHandler } from './endpoints/webhook.js'
import { syncCatalog } from './tasks/syncCatalog.js'
import type { PayloadPluginSquareConfig } from './types.js'

export type { PayloadPluginSquareConfig } from './types.js'
export type {
  AfterCheckoutContext,
  BeforeCheckoutContext,
  Cart,
  CartItem,
  Order,
  OrderLineItem,
  SquarePayment,
  SyncContext,
  WebhookContext,
} from './types.js'

export const payloadPluginSquare =
  (pluginOptions: PayloadPluginSquareConfig) =>
  (config: Config): Config => {
    const mediaCollectionSlug = pluginOptions.mediaCollectionSlug ?? 'media'

    if (!config.collections) {
      config.collections = []
    }

    // Always register collections so the DB schema stays consistent across environments
    config.collections.push(
      createSquareCatalogItemsCollection(mediaCollectionSlug),
      Orders,
      SquarePayments,
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

    config.endpoints.push({
      path: '/square/inventory-stream',
      method: 'get',
      handler: inventoryStreamHandler,
    })

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
