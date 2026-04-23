import type { BasePayload, CollectionSlug } from 'payload'
import type { CatalogObject } from 'square'

import { createSquareClient } from '../lib/squareClient.js'

type SyncOptions = {
  accessToken: string
  environment?: 'sandbox' | 'production'
  locationId?: string
  mediaCollectionSlug: string
  payload: BasePayload
}

export async function syncCatalog({
  accessToken,
  environment,
  locationId,
  mediaCollectionSlug,
  payload,
}: SyncOptions): Promise<{ synced: number }> {
  const client = createSquareClient(accessToken, environment)

  // Collect all ITEM catalog objects via the async-iterable Page API
  const allItems: Extract<CatalogObject, { type: 'ITEM' }>[] = []

  for await (const obj of await client.catalog.list({ types: 'ITEM' })) {
    if (obj.type === 'ITEM') {
      allItems.push(obj as Extract<CatalogObject, { type: 'ITEM' }>)
    }
  }

  // Build inventory count map keyed by variation ID
  const inventoryByVariationId = new Map<string, number>()

  if (locationId && allItems.length > 0) {
    const variationIds: string[] = []
    for (const item of allItems) {
      for (const variation of item.itemData?.variations ?? []) {
        if (variation.id) variationIds.push(variation.id)
      }
    }

    if (variationIds.length > 0) {
      for (const batch of chunkArray(variationIds, 1000)) {
        for await (const count of await client.inventory.batchGetCounts({
          catalogObjectIds: batch,
          locationIds: [locationId],
        })) {
          if (count.catalogObjectId && count.quantity) {
            inventoryByVariationId.set(count.catalogObjectId, parseFloat(count.quantity))
          }
        }
      }
    }
  }

  // Collect unique image IDs across all items (first image per item)
  const imageIdToItemMap = new Map<string, string>() // imageId → item squareId
  for (const item of allItems) {
    const primaryImageId = item.itemData?.imageIds?.[0]
    if (item.id && primaryImageId) {
      imageIdToItemMap.set(primaryImageId, item.id)
    }
  }

  // Batch-fetch IMAGE catalog objects to get their URLs
  const imageUrlById = new Map<string, string>()
  const allImageIds = [...imageIdToItemMap.keys()]

  if (allImageIds.length > 0) {
    for (const batch of chunkArray(allImageIds, 1000)) {
      const batchResponse = await client.catalog.batchGet({ objectIds: batch })
      for (const obj of batchResponse.objects ?? []) {
        if (obj.type === 'IMAGE' && obj.id && obj.imageData?.url) {
          imageUrlById.set(obj.id, obj.imageData.url)
        }
      }
    }
  }

  const syncedAt = new Date().toISOString()

  for (const item of allItems) {
    if (!item.id) continue

    const variations = (item.itemData?.variations ?? []).map((v) => {
      const varData = v.type === 'ITEM_VARIATION' ? v.itemVariationData : undefined
      return {
        squareId: v.id ?? '',
        name: varData?.name ?? '',
        sku: varData?.sku ?? '',
        // Square stores amounts as BigInt (smallest currency unit, e.g. cents)
        price:
          varData?.priceMoney?.amount != null ? Number(varData.priceMoney.amount) : undefined,
        currency: varData?.priceMoney?.currency ?? undefined,
        inventoryCount: v.id ? inventoryByVariationId.get(v.id) : undefined,
      }
    })

    // Resolve image — skip re-download if squareImageId hasn't changed
    const primaryImageId = item.itemData?.imageIds?.[0]
    const existing = await payload.find({
      collection: 'square-catalog-items',
      where: { squareId: { equals: item.id } },
      limit: 1,
    })
    const existingDoc = existing.docs[0]

    let imageDocId: number | string | undefined =
      existingDoc?.image && typeof existingDoc.image === 'object'
        ? (existingDoc.image as { id: string | number }).id
        : (existingDoc?.image as string | number | undefined)

    if (primaryImageId && primaryImageId !== existingDoc?.squareImageId) {
      const imageUrl = imageUrlById.get(primaryImageId)
      if (imageUrl) {
        try {
          imageDocId = await downloadAndCreateMedia({
            imageId: primaryImageId,
            imageUrl,
            itemName: item.itemData?.name ?? 'item',
            mediaCollectionSlug,
            payload,
          })
        } catch (err) {
          payload.logger.warn({ err, imageId: primaryImageId }, 'Failed to sync Square image')
        }
      }
    }

    const data = {
      squareId: item.id,
      squareImageId: primaryImageId ?? null,
      name: item.itemData?.name ?? 'Unnamed item',
      description: item.itemData?.description ?? '',
      type: 'ITEM' as const,
      variations,
      image: imageDocId ?? null,
      lastSyncedAt: syncedAt,
    }

    if (existingDoc) {
      await payload.update({
        collection: 'square-catalog-items',
        id: existingDoc.id,
        data,
      })
    } else {
      await payload.create({
        collection: 'square-catalog-items',
        data,
      })
    }
  }

  return { synced: allItems.length }
}

async function downloadAndCreateMedia({
  imageId,
  imageUrl,
  itemName,
  mediaCollectionSlug,
  payload,
}: {
  imageId: string
  imageUrl: string
  itemName: string
  mediaCollectionSlug: string
  payload: BasePayload
}): Promise<string | number> {
  const response = await fetch(imageUrl)
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.status} ${response.statusText}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  const contentType = response.headers.get('content-type') || 'image/jpeg'
  const ext = contentType.split('/')[1]?.split(';')[0] || 'jpg'
  const filename = `square-${imageId}.${ext}`

  const doc = await payload.create({
    collection: mediaCollectionSlug as CollectionSlug,
    data: { alt: itemName },
    file: {
      data: buffer,
      mimetype: contentType,
      name: filename,
      size: buffer.length,
    },
  })

  return doc.id
}

function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size))
  }
  return chunks
}
