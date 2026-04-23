import type { PayloadHandler } from 'payload'

import { syncCatalog } from '../tasks/syncCatalog.js'

type MakeSyncHandlerOptions = {
  accessToken: string
  environment?: 'sandbox' | 'production'
  locationId?: string | string[]
  mediaCollectionSlug: string
}

export function makeSyncHandler({
  accessToken,
  environment,
  locationId,
  mediaCollectionSlug,
}: MakeSyncHandlerOptions): PayloadHandler {
  return async (req) => {
    if (!req.user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    try {
      const result = await syncCatalog({
        accessToken,
        environment,
        locationId,
        mediaCollectionSlug,
        payload: req.payload,
      })
      return Response.json({ success: true, ...result })
    } catch (err) {
      req.payload.logger.error({ err }, 'Square catalog sync failed')
      return Response.json({ error: 'Sync failed' }, { status: 500 })
    }
  }
}
