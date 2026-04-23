'use client'

import { useEffect } from 'react'

type InventoryUpdate = { type: 'inventory'; variationSquareId: string; quantity: number }
type CatalogUpdate = { type: 'catalog' }
type StreamEvent = InventoryUpdate | CatalogUpdate

interface UseInventoryStreamOptions {
  onInventoryUpdate: (update: InventoryUpdate) => void
  onCatalogUpdate?: () => void
}

export function useInventoryStream({ onInventoryUpdate, onCatalogUpdate }: UseInventoryStreamOptions) {
  useEffect(() => {
    const es = new EventSource('/api/square/inventory-stream')

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data as string) as StreamEvent
        if (event.type === 'inventory') {
          onInventoryUpdate(event)
        } else if (event.type === 'catalog') {
          onCatalogUpdate?.()
        }
      } catch {
        // ignore malformed events
      }
    }

    return () => es.close()
  }, [onInventoryUpdate, onCatalogUpdate])
}
