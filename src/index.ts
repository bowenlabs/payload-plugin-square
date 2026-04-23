import type { Config } from 'payload'

import { createSquareCatalogItemsCollection } from './collections/SquareCatalogItems.js'
import { makeSyncHandler } from './endpoints/syncEndpoint.js'
import { syncCatalog } from './tasks/syncCatalog.js'

export type PayloadPluginSquareConfig = {
  /** Square API access token */
  accessToken: string
  /** Defaults to 'sandbox' */
  environment?: 'sandbox' | 'production'
  /** Square location ID — required for fetching inventory counts per variation */
  locationId?: string
  /** Payload collection slug for storing synced images. Defaults to 'media' */
  mediaCollectionSlug?: string
  /** Run a full catalog sync when Payload initializes */
  syncOnInit?: boolean
  /**
   * Keep the collection in the schema while disabling all Square API activity.
   * Useful for environments where Square credentials are unavailable (e.g. CI).
   */
  disabled?: boolean
}

export const payloadPluginSquare =
  (pluginOptions: PayloadPluginSquareConfig) =>
  (config: Config): Config => {
    const mediaCollectionSlug = pluginOptions.mediaCollectionSlug ?? 'media'

    if (!config.collections) {
      config.collections = []
    }

    // Always add the collection so the DB schema stays consistent
    config.collections.push(createSquareCatalogItemsCollection(mediaCollectionSlug))

    if (pluginOptions.disabled) {
      return config
    }

    if (!config.endpoints) {
      config.endpoints = []
    }

    config.endpoints.push({
      handler: makeSyncHandler({
        accessToken: pluginOptions.accessToken,
        environment: pluginOptions.environment,
        locationId: pluginOptions.locationId,
        mediaCollectionSlug,
      }),
      method: 'post',
      path: '/square/sync',
    })

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
