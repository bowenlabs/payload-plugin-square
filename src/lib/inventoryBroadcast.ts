type Controller = ReadableStreamDefaultController<Uint8Array>

const connections = new Set<Controller>()

export function addConnection(controller: Controller) {
  connections.add(controller)
}

export function removeConnection(controller: Controller) {
  connections.delete(controller)
}

function broadcast(payload: string) {
  const chunk = new TextEncoder().encode(payload)
  for (const controller of connections) {
    try {
      controller.enqueue(chunk)
    } catch {
      connections.delete(controller)
    }
  }
}

export function broadcastInventoryUpdate(variationSquareId: string, quantity: number) {
  broadcast(`data: ${JSON.stringify({ type: 'inventory', variationSquareId, quantity })}\n\n`)
}

export function broadcastCatalogUpdate() {
  broadcast(`data: ${JSON.stringify({ type: 'catalog' })}\n\n`)
}
