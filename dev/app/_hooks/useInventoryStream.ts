'use client'

import { useEffect } from 'react'

type InventoryUpdate = { variationSquareId: string; quantity: number }

export function useInventoryStream(onUpdate: (update: InventoryUpdate) => void) {
  useEffect(() => {
    const es = new EventSource('/api/square/inventory-stream')

    es.onmessage = (e) => {
      try {
        const update = JSON.parse(e.data) as InventoryUpdate
        onUpdate(update)
      } catch {
        // ignore malformed events
      }
    }

    return () => es.close()
  }, [onUpdate])
}
